import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';

import { promises as fs } from 'fs';
import { join } from 'path';
import { OwnPbxProvider } from '../onlinepbx/own-pbx.provider';
import { PrismaService } from '../prisma/prisma.service';
import { generateAsterisk, type GenModule } from './asterisk.generator';
import { DEVICES, MAC_RE, generateDeviceConfig, type CfgLine, type Device } from './configurator';
import { MODULE_TYPES, NUMBER_BASE, NUMBER_RE, SchemaError, normalizeConfig, type ModuleType } from './pbx-schema';

const isType = (t: unknown): t is ModuleType => (MODULE_TYPES as readonly string[]).includes(String(t));
const MUSIC_KEY = 'pbx_music';
const OUTGOING_KEY = 'pbx_outgoing';

type Row = { id: string; type: string; number: string; name: string | null; configJson: string; enabled: boolean; createdAt: Date; updatedAt: Date };
const parse = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };

@Injectable()
export class PbxService {
  constructor(private readonly prisma: PrismaService, private readonly own: OwnPbxProvider) {}

  /** Yashirin maydonlar (trunk paroli) javobda ko'rsatilmaydi. */
  private view(r: Row) {
    const cfg = parse<Record<string, unknown>>(r.configJson, {});
    const secret = r.type === 'trunk' && !!cfg.password;
    if (r.type === 'trunk') delete cfg.password;
    return { id: r.id, type: r.type, number: r.number, name: r.name, enabled: r.enabled, config: cfg, ...(r.type === 'trunk' ? { passwordSet: secret } : {}), createdAt: r.createdAt.toISOString() };
  }

  async list(type?: string) {
    const rows = (await this.prisma.pbxModule.findMany({ where: type && isType(type) ? { type } : {}, orderBy: [{ type: 'asc' }, { number: 'asc' }] })) as Row[];
    return { modules: rows.map((r) => this.view(r)) };
  }

  async get(id: string) {
    const r = (await this.prisma.pbxModule.findUnique({ where: { id } })) as Row | null;
    if (!r) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Modul topilmadi' });
    return { module: this.view(r) };
  }

  async nextNumber(type: string) {
    if (!isType(type)) throw new BadRequestException({ error: 'BAD_TYPE', message: 'Modul turi noto\'g\'ri' });
    const used = new Set((await this.prisma.pbxModule.findMany({ select: { number: true } })).map((x) => x.number));
    let n = NUMBER_BASE[type];
    while (used.has(String(n))) n++;
    return { number: String(n) };
  }

  /** Havolalar mavjudligi va aylanma (sikl) yo'qligi. `next` — saqlanayotgan modul (hali bazada bo'lmasligi mumkin). */
  private async assertFlow(next: { number: string; type: ModuleType; targets: string[]; members: string[] }, ignoreId?: string) {
    const all = await this.prisma.pbxModule.findMany({ where: ignoreId ? { id: { not: ignoreId } } : {}, select: { number: true, type: true, configJson: true } });
    const byNum = new Map(all.map((m) => [m.number, m]));
    byNum.set(next.number, { number: next.number, type: next.type, configJson: '{}' });
    for (const t of next.targets) if (!byNum.has(t)) throw new BadRequestException({ error: 'TARGET_NOT_FOUND', message: `Marshrut raqami topilmadi: ${t}` });
    for (const m of next.members) {
      const x = byNum.get(m);
      if (!x || x.type !== 'user') throw new BadRequestException({ error: 'MEMBER_NOT_USER', message: `Ichki raqam (foydalanuvchi) topilmadi: ${m}` });
    }
    // sikl: next dan boshlab havolalar bo'ylab yurib, o'ziga qaytib kelsa — rad
    const graph = new Map<string, string[]>();
    for (const m of all) graph.set(m.number, normalizeConfig(m.type as ModuleType, parse(m.configJson, {})).targets);
    graph.set(next.number, next.targets);
    const seen = new Set<string>();
    const stack = [...next.targets];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === next.number) throw new BadRequestException({ error: 'FLOW_LOOP', message: "Marshrutda aylanma bor (modul o'ziga qaytib keladi)" });
      if (seen.has(n)) continue;
      seen.add(n);
      stack.push(...(graph.get(n) || []));
    }
  }

  async create(dto: { type?: string; number?: string; name?: string; config?: Record<string, unknown>; enabled?: boolean }) {
    if (!isType(dto.type)) throw new BadRequestException({ error: 'BAD_TYPE', message: "Modul turi noto'g'ri" });
    const type = dto.type;
    const number = String(dto.number || '').trim() || (await this.nextNumber(type)).number;
    if (!NUMBER_RE.test(number)) throw new BadRequestException({ error: 'BAD_NUMBER', message: "Raqam noto'g'ri (harf/raqam, 32 belgigacha)" });
    if (await this.prisma.pbxModule.findUnique({ where: { number }, select: { id: true } })) throw new ConflictException({ error: 'NUMBER_TAKEN', message: `Bu raqam band: ${number}` });
    const n = this.norm(type, dto.config);
    await this.assertFlow({ number, type, targets: n.targets, members: n.members });
    const row = (await this.prisma.pbxModule.create({ data: { type, number, name: String(dto.name || '').trim().slice(0, 100) || null, configJson: JSON.stringify(n.config), enabled: dto.enabled !== false } })) as Row;
    await this.syncUserExt(row, undefined);
    return { module: this.view(row) };
  }

  async update(id: string, dto: { number?: string; name?: string; config?: Record<string, unknown>; enabled?: boolean }) {
    const cur = (await this.prisma.pbxModule.findUnique({ where: { id } })) as Row | null;
    if (!cur) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Modul topilmadi' });
    const type = cur.type as ModuleType;
    const number = dto.number !== undefined ? String(dto.number).trim() : cur.number;
    if (!NUMBER_RE.test(number)) throw new BadRequestException({ error: 'BAD_NUMBER', message: "Raqam noto'g'ri" });
    if (number !== cur.number) {
      if (await this.prisma.pbxModule.findUnique({ where: { number }, select: { id: true } })) throw new ConflictException({ error: 'NUMBER_TAKEN', message: `Bu raqam band: ${number}` });
      if ((await this.referencedBy(cur.number)).length) throw new ConflictException({ error: 'IN_USE', message: "Raqamni o'zgartirib bo'lmaydi: boshqa modullar unga yo'naltirilgan" });
    }
    const old = parse<Record<string, unknown>>(cur.configJson, {});
    const patch = { ...(dto.config || {}) };
    if (type === 'trunk' && !patch.password && old.password) patch.password = old.password; // parol bo'sh bo'lsa eskisi qoladi
    const n = this.norm(type, dto.config === undefined ? old : { ...old, ...patch });
    await this.assertFlow({ number, type, targets: n.targets, members: n.members }, id);
    const row = (await this.prisma.pbxModule.update({ where: { id }, data: { number, ...(dto.name !== undefined ? { name: String(dto.name).trim().slice(0, 100) || null } : {}), configJson: JSON.stringify(n.config), ...(dto.enabled !== undefined ? { enabled: !!dto.enabled } : {}) } })) as Row;
    await this.syncUserExt(row, cur);
    return { module: this.view(row) };
  }

  async remove(id: string) {
    const cur = (await this.prisma.pbxModule.findUnique({ where: { id } })) as Row | null;
    if (!cur) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Modul topilmadi' });
    const refs = await this.referencedBy(cur.number);
    if (refs.length) throw new ConflictException({ error: 'IN_USE', message: `O'chirib bo'lmaydi: ${refs.map((r) => r.number).join(', ')} modullari shunga yo'naltirilgan`, usedBy: refs });
    await this.prisma.pbxModule.delete({ where: { id } });
    if (cur.type === 'user') {
      const crmUserId = parse<Record<string, any>>(cur.configJson, {}).crmUserId;
      if (crmUserId) await this.prisma.user.updateMany({ where: { id: crmUserId, extension: cur.number }, data: { extension: null } });
    }
    return { ok: true };
  }

  private async referencedBy(number: string) {
    const all = await this.prisma.pbxModule.findMany({ select: { number: true, type: true, configJson: true } });
    return all.filter((m) => {
      const n = normalizeConfig(m.type as ModuleType, parse(m.configJson, {}));
      return n.targets.includes(number) || n.members.includes(number);
    }).map((m) => ({ number: m.number, type: m.type }));
  }

  private norm(type: ModuleType, cfg?: Record<string, unknown>) {
    try { return normalizeConfig(type, cfg || {}); } catch (e) {
      if (e instanceof SchemaError) throw new BadRequestException({ error: 'BAD_CONFIG', message: e.message });
      throw e;
    }
  }

  /** «Пользователь» moduli CRM foydalanuvchisiga bog'langan bo'lsa, uning ichki raqami (extension) moslab qo'yiladi. */
  private async syncUserExt(row: Row, prev?: Row) {
    if (row.type !== 'user') return;
    const cfg = parse<Record<string, any>>(row.configJson, {});
    if (prev && prev.number !== row.number) {
      const pc = parse<Record<string, any>>(prev.configJson, {});
      if (pc.crmUserId) await this.prisma.user.updateMany({ where: { id: pc.crmUserId, extension: prev.number }, data: { extension: null } });
    }
    if (cfg.crmUserId) {
      const u = await this.prisma.user.findUnique({ where: { id: cfg.crmUserId }, select: { id: true, sipPassword: true } });
      if (u) await this.prisma.user.update({ where: { id: u.id }, data: { extension: row.number, ...(u.sipPassword ? {} : { sipPassword: randomBytes(9).toString('base64url') }) } });
    }
  }

  /** Oqim tekshiruvi: bo'sh «keyingi qadam», yetim modullar, ishlamaydigan raqamlar. */
  async validateFlow() {
    const rows = (await this.prisma.pbxModule.findMany()) as Row[];
    const numbers = new Set(rows.map((r) => r.number));
    const issues: { level: 'error' | 'warn'; number: string; message: string }[] = [];
    const referenced = new Set<string>();
    for (const r of rows) {
      const n = normalizeConfig(r.type as ModuleType, parse(r.configJson, {}));
      for (const t of n.targets) { referenced.add(t); if (!numbers.has(t)) issues.push({ level: 'error', number: r.number, message: `Marshrut raqami yo'q: ${t}` }); }
      for (const m of n.members) referenced.add(m);
      if (r.type === 'trunk' && !(r.configJson.includes('forwardTo":"') && !r.configJson.includes('forwardTo":""'))) issues.push({ level: 'warn', number: r.number, message: "Kiruvchi raqam hech qayerga yo'naltirilmagan" });
    }
    for (const r of rows) if (!['trunk', 'user'].includes(r.type) && !referenced.has(r.number)) issues.push({ level: 'warn', number: r.number, message: "Hech qaysi modul bunga yo'naltirmagan" });
    return { ok: !issues.some((i) => i.level === 'error'), issues };
  }

  private async buildAsterisk(withSecrets: boolean) {
    const rows = (await this.prisma.pbxModule.findMany({ orderBy: { number: 'asc' } })) as Row[];
    const secrets: Record<string, string> = {};
    const missing: string[] = [];
    for (const r of rows.filter((x) => x.type === 'user' && x.enabled)) {
      const crmUserId = parse<Record<string, any>>(r.configJson, {}).crmUserId;
      const u = crmUserId ? await this.prisma.user.findUnique({ where: { id: crmUserId }, select: { sipPassword: true } }) : null;
      if (u?.sipPassword) secrets[r.number] = u.sipPassword; else missing.push(r.number);
    }
    const mods: GenModule[] = rows.map((r) => {
      const cfg = parse<Record<string, unknown>>(r.configJson, {});
      return { type: r.type, number: r.number, name: r.name, enabled: r.enabled, config: withSecrets ? cfg : { ...cfg, password: undefined } };
    });
    const bl = (await this.prisma.pbxBlacklist.findMany({ select: { number: true } })).map((b) => b.number);
    const out = generateAsterisk(mods, { blacklist: bl, outgoing: await this.outgoing(), sipSecrets: withSecrets ? secrets : {} });
    return { ...out, missing };
  }

  /** Asterisk sozlamasini ko'rish (parollar yashiriladi). */
  async asteriskPreview() {
    const { pjsip, extensions, queues } = await this.buildAsterisk(false);
    return { pjsip, extensions, queues };
  }

  /**
   * Sozlamani Asterisk'ka qo'llash: ASTERISK_CONF_DIR ga uchta fayl (pjsip_crm.conf, extensions_crm.conf, queues_crm.conf) yoziladi,
   * audio fayllar ASTERISK_SOUNDS_DIR/custom ga ko'chiriladi va AMI orqali qayta yuklanadi. Asosiy konfiguratsiyalar bu fayllarni #include qiladi.
   */
  async applyAsterisk() {
    const dir = process.env.ASTERISK_CONF_DIR;
    if (!dir) throw new BadRequestException({ error: 'NO_CONF_DIR', message: 'ASTERISK_CONF_DIR sozlanmagan (stansiya serveri ulanmagan)' });
    const flow = await this.validateFlow();
    if (!flow.ok) throw new BadRequestException({ error: 'FLOW_INVALID', message: `Marshrutda xato bor: ${flow.issues.filter((i) => i.level === 'error').map((i) => `${i.number}: ${i.message}`).join('; ')}` });
    const cfg = await this.buildAsterisk(true);
    if (cfg.missing.length) throw new BadRequestException({ error: 'NO_SIP_PASSWORD', message: `Ichki raqamlarga CRM foydalanuvchisi biriktirilmagan (SIP paroli yo'q): ${cfg.missing.join(', ')}` });
    await fs.mkdir(dir, { recursive: true });
    const written: string[] = [];
    for (const [name, text] of [['pjsip_crm.conf', cfg.pjsip], ['extensions_crm.conf', cfg.extensions], ['queues_crm.conf', cfg.queues]] as const) {
      const tmp = join(dir, `.${name}.tmp`);
      await fs.writeFile(tmp, text + '\n', { mode: 0o640 });
      await fs.rename(tmp, join(dir, name)); // atomik almashtirish
      written.push(name);
    }
    const sounds = process.env.ASTERISK_SOUNDS_DIR;
    let audio = 0;
    if (sounds) {
      const cdir = join(sounds, 'custom');
      await fs.mkdir(cdir, { recursive: true });
      for (const a of await this.prisma.pbxAudio.findMany()) {
        const ext = a.mime.includes('mpeg') || a.mime.includes('mp3') ? 'mp3' : a.mime.includes('ogg') ? 'ogg' : 'wav';
        await fs.writeFile(join(cdir, `${a.id}.${ext}`), Buffer.from(a.data)); audio++;
      }
    }
    let reloaded = false;
    if (await this.own.enabled()) {
      for (const c of ['module reload res_pjsip.so', 'dialplan reload', 'queue reload all']) await this.own.command(c);
      reloaded = true;
    }
    return { written, audio, reloaded };
  }

  /** Stol telefoni uchun konfiguratsiya fayli: har liniya — «foydalanuvchi» moduli (CRM foydalanuvchisiga bog'langan bo'lsa SIP paroli bor). */
  async deviceConfig(dto: { device?: string; mac?: string; lines?: { ext?: string }[] }) {
    const device = String(dto.device || '') as Device;
    if (!DEVICES.includes(device)) throw new BadRequestException({ error: 'BAD_DEVICE', message: "Qurilma turi noto'g'ri" });
    if (device !== 'phonerlite' && !MAC_RE.test(String(dto.mac || '').trim())) throw new BadRequestException({ error: 'BAD_MAC', message: "MAC-adres noto'g'ri (masalan 00:15:65:AA:BB:CC)" });
    const host = (process.env.PBX_SIP_HOST || (() => { try { return new URL(process.env.PUBLIC_URL || '').hostname; } catch { return ''; } })()).trim();
    if (!host) throw new BadRequestException({ error: 'NO_HOST', message: "SIP-server manzili sozlanmagan (serverda PBX_SIP_HOST yoki PUBLIC_URL)" });
    const exts = (Array.isArray(dto.lines) ? dto.lines : []).map((l) => String(l?.ext || '').trim()).filter(Boolean).slice(0, 5);
    if (!exts.length) throw new BadRequestException({ error: 'NO_LINES', message: 'Kamida bitta liniya tanlang' });
    const lines: CfgLine[] = [];
    for (const ext of exts) {
      const m = (await this.prisma.pbxModule.findUnique({ where: { number: ext } })) as Row | null;
      if (!m || m.type !== 'user') throw new BadRequestException({ error: 'NOT_USER', message: `Ichki raqam topilmadi: ${ext}` });
      const crmUserId = parse<Record<string, any>>(m.configJson, {}).crmUserId;
      const u = crmUserId ? await this.prisma.user.findUnique({ where: { id: crmUserId }, select: { sipPassword: true } }) : null;
      if (!u?.sipPassword) throw new BadRequestException({ error: 'NO_SIP_PASSWORD', message: `${ext}: CRM foydalanuvchisi biriktirilmagan yoki SIP paroli yo'q` });
      lines.push({ ext, name: m.name || ext, password: u.sipPassword });
    }
    return generateDeviceConfig(device, String(dto.mac || ''), lines, host);
  }

  // ── Audio kutubxona ──
  private static readonly AUDIO_MIME = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg'];
  async audioList() {
    const rows = await this.prisma.pbxAudio.findMany({ select: { id: true, name: true, mime: true, size: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    return { files: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) };
  }
  async audioAdd(dto: { name?: string; mime?: string; data?: string }) {
    const mime = String(dto.mime || '').toLowerCase();
    if (!PbxService.AUDIO_MIME.includes(mime)) throw new BadRequestException({ error: 'BAD_AUDIO', message: 'Faqat MP3, WAV yoki OGG fayl yuklanadi' });
    const b64 = String(dto.data || '').replace(/^data:[^,]*,/, '');
    if (!/^[A-Za-z0-9+/=\s]+$/.test(b64) || !b64) throw new BadRequestException({ error: 'BAD_AUDIO', message: "Fayl ma'lumoti noto'g'ri" });
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 100) throw new BadRequestException({ error: 'BAD_AUDIO', message: 'Fayl juda kichik' });
    if (buf.length > 5 * 1024 * 1024) throw new BadRequestException({ error: 'TOO_BIG', message: "Fayl 5 MB dan oshmasin" });
    if ((await this.prisma.pbxAudio.count()) >= 100) throw new BadRequestException({ error: 'LIMIT', message: 'Kutubxonada 100 tadan ortiq fayl bo\'lmaydi' });
    const name = String(dto.name || '').replace(/[<>\\/]/g, '').trim().slice(0, 100) || 'audio';
    const r = await this.prisma.pbxAudio.create({ data: { name, mime, size: buf.length, data: buf } });
    return { id: r.id, name: r.name, mime: r.mime, size: r.size, createdAt: r.createdAt.toISOString() };
  }
  async audioFile(id: string) {
    const r = await this.prisma.pbxAudio.findUnique({ where: { id } });
    if (!r) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Audio topilmadi' });
    return { buffer: Buffer.from(r.data), mime: r.mime, name: r.name };
  }
  async audioRemove(id: string) {
    const mods = await this.prisma.pbxModule.findMany({ select: { number: true, configJson: true } });
    const used = mods.filter((m) => m.configJson.includes(`"${id}"`)).map((m) => m.number);
    const music = await this.music();
    if (music.ringback === id || music.hold === id) used.push('musiqa');
    if (used.length) throw new ConflictException({ error: 'IN_USE', message: `O'chirib bo'lmaydi: ishlatilmoqda (${used.join(', ')})` });
    const r = await this.prisma.pbxAudio.deleteMany({ where: { id } });
    if (!r.count) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Audio topilmadi' });
    return { ok: true };
  }

  // ── Qora ro'yxat ──
  async blacklist() { return { numbers: (await this.prisma.pbxBlacklist.findMany({ orderBy: { createdAt: 'desc' } })).map((b) => ({ id: b.id, number: b.number, note: b.note })) }; }
  async blacklistAdd(dto: { number?: string; note?: string }) {
    const number = String(dto.number || '').trim();
    if (!/^\+?\d{3,20}$/.test(number)) throw new BadRequestException({ error: 'BAD_NUMBER', message: "Raqam noto'g'ri (faqat raqamlar, ixtiyoriy +)" });
    if (await this.prisma.pbxBlacklist.findUnique({ where: { number } })) throw new ConflictException({ error: 'EXISTS', message: "Bu raqam ro'yxatda bor" });
    const b = await this.prisma.pbxBlacklist.create({ data: { number, note: String(dto.note || '').trim().slice(0, 200) || null } });
    return { id: b.id, number: b.number, note: b.note };
  }
  async blacklistRemove(id: string) {
    const r = await this.prisma.pbxBlacklist.deleteMany({ where: { id } });
    if (!r.count) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Topilmadi' });
    return { ok: true };
  }

  // ── Musiqa va chiquvchi qoidalar (AppSetting JSON) ──
  private async setting<T>(key: string, d: T): Promise<T> {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    return row ? parse<T>(row.value, d) : d;
  }
  private async saveSetting(key: string, v: unknown) {
    const value = JSON.stringify(v);
    await this.prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  async music() { return this.setting(MUSIC_KEY, { ringback: 'default', hold: 'default' }); }
  async saveMusic(dto: { ringback?: string; hold?: string }) {
    const m = { ringback: String(dto.ringback || 'default').slice(0, 80), hold: String(dto.hold || 'default').slice(0, 80) };
    await this.saveSetting(MUSIC_KEY, m);
    return m;
  }
  async outgoing() { return this.setting<{ rules: any[] }>(OUTGOING_KEY, { rules: [] }); }
  async saveOutgoing(dto: { rules?: any[] }) {
    const rules = (Array.isArray(dto.rules) ? dto.rules : []).slice(0, 100).map((r, i) => {
      const mask = String(r?.mask ?? '').trim().slice(0, 64);
      if (mask && !/^[0-9+*#X.()\[\]-]*$/.test(mask)) throw new BadRequestException({ error: 'BAD_MASK', message: `Maska noto'g'ri: ${mask}` });
      return { id: String(r?.id || `r${i + 1}`).slice(0, 40), name: String(r?.name || '').trim().slice(0, 80), mask, trunk: String(r?.trunk || '').slice(0, 32), externalNumber: String(r?.externalNumber || '').trim().slice(0, 32), users: (Array.isArray(r?.users) ? r.users : []).map((u: unknown) => String(u).slice(0, 32)).slice(0, 200) };
    });
    await this.saveSetting(OUTGOING_KEY, { rules });
    return { rules };
  }
}
