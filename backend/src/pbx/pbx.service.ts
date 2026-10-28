import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';

import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { OwnPbxProvider } from '../onlinepbx/own-pbx.provider';
import { PrismaService } from '../prisma/prisma.service';
import { GeneratorError, generateAsterisk, natFromEnv, type GenModule } from './asterisk.generator';
import { DEVICES, MAC_RE, generateDeviceConfig, type CfgLine, type Device } from './configurator';
import { MODULE_TYPES, NUMBER_BASE, NUMBER_RE, SchemaError, USER_NUMBER_RE, cleanName, normalizeConfig, type ModuleType } from './pbx-schema';
import { EXT_RE, phoneKey } from './phone';

const isType = (t: unknown): t is ModuleType => (MODULE_TYPES as readonly string[]).includes(String(t));
const MUSIC_KEY = 'pbx_music';
const OUTGOING_KEY = 'pbx_outgoing';
const RECORDING_KEY = 'pbx_recording';
const QUALITY_KEY = 'pbx_quality';
export interface QualityCfg { enabled: boolean; promptAudioId: string | null; thanksAudioId: string | null; scope: 'in' | 'all' }
/** Bazadagi eski (hozirgi qoidalarga mos kelmaydigan) yozuv o'qish yo'llarini 500 ga tushirmasin. */
const targetsOf = (type: string, json: string) => { try { return normalizeConfig(type as ModuleType, parse(json, {})); } catch { return { config: {}, targets: [] as string[], members: [] as string[] }; } };
const isP2002 = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';

type Row = { id: string; type: string; number: string; name: string | null; configJson: string; enabled: boolean; createdAt: Date; updatedAt: Date };
const parse = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };

/** Audio → 8 kHz mono 16-bit PCM wav (Asterisk standarti). ffmpeg yo'q yoki xato bo'lsa null (asl fayl yoziladi). */
export async function transcodeWav(data: Buffer): Promise<Buffer | null> {
  // pipe'ga yozilgan wav sarlavhasida o'lcham noto'g'ri (0xFFFFFFFF) — Asterisk format_wav o'qimaydi; shuning uchun vaqtinchalik FAYLga yozamiz
  const dir = await fs.mkdtemp(join(tmpdir(), 'crm-audio-'));
  try {
    await fs.writeFile(join(dir, 'in'), data);
    const code = await new Promise<number | null>((resolve) => {
      try {
        const p = spawn('ffmpeg', ['-v', 'error', '-y', '-i', join(dir, 'in'), '-ar', '8000', '-ac', '1', '-c:a', 'pcm_s16le', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-f', 'wav', join(dir, 'out.wav')], { stdio: 'ignore' });
        const timer = setTimeout(() => { p.kill('SIGKILL'); resolve(null); }, 30_000);
        p.on('error', () => { clearTimeout(timer); resolve(null); });
        p.on('close', (c) => { clearTimeout(timer); resolve(c); });
      } catch { resolve(null); }
    });
    if (code !== 0) return null;
    const out = await fs.readFile(join(dir, 'out.wav'));
    return out.length > 44 ? out : null;
  } catch { return null; } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

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
    for (const m of all) graph.set(m.number, targetsOf(m.type, m.configJson).targets);
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
    this.assertNumber(type, number);
    if (await this.prisma.pbxModule.findUnique({ where: { number }, select: { id: true } })) throw new ConflictException({ error: 'NUMBER_TAKEN', message: `Bu raqam band: ${number}` });
    const n = this.norm(type, dto.config);
    await this.assertFlow({ number, type, targets: n.targets, members: n.members });
    await this.assertCrmUserFree(type, n.config, undefined);
    let row: Row;
    try {
      row = (await this.prisma.pbxModule.create({ data: { type, number, name: cleanName(dto.name, 100) || null, configJson: JSON.stringify(n.config), enabled: dto.enabled !== false } })) as Row;
    } catch (e) {
      if (isP2002(e)) throw new ConflictException({ error: 'NUMBER_TAKEN', message: `Bu raqam band: ${number}` });
      throw e;
    }
    await this.syncUserExt(row, undefined);
    return { module: this.view(row) };
  }

  async update(id: string, dto: { number?: string; name?: string; config?: Record<string, unknown>; enabled?: boolean }) {
    const cur = (await this.prisma.pbxModule.findUnique({ where: { id } })) as Row | null;
    if (!cur) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Modul topilmadi' });
    const type = cur.type as ModuleType;
    const number = dto.number !== undefined ? String(dto.number).trim() : cur.number;
    this.assertNumber(type, number);
    if (number !== cur.number) {
      if (await this.prisma.pbxModule.findUnique({ where: { number }, select: { id: true } })) throw new ConflictException({ error: 'NUMBER_TAKEN', message: `Bu raqam band: ${number}` });
      if ((await this.referencedBy(cur.number)).length) throw new ConflictException({ error: 'IN_USE', message: "Raqamni o'zgartirib bo'lmaydi: boshqa modullar unga yo'naltirilgan" });
      const ext = await this.settingRefs(cur.number);
      if (ext.length) throw new ConflictException({ error: 'IN_USE', message: `Raqamni o'zgartirib bo'lmaydi: ${ext.join(', ')} sozlamasida ishlatilgan` });
    }
    const old = parse<Record<string, unknown>>(cur.configJson, {});
    const patch = { ...(dto.config || {}) };
    if (type === 'trunk' && !patch.password && old.password) patch.password = old.password; // parol bo'sh bo'lsa eskisi qoladi
    const n = this.norm(type, dto.config === undefined ? old : { ...old, ...patch });
    await this.assertFlow({ number, type, targets: n.targets, members: n.members }, id);
    await this.assertCrmUserFree(type, n.config, id);
    let row: Row;
    try {
      row = (await this.prisma.pbxModule.update({ where: { id }, data: { number, ...(dto.name !== undefined ? { name: cleanName(dto.name, 100) || null } : {}), configJson: JSON.stringify(n.config), ...(dto.enabled !== undefined ? { enabled: !!dto.enabled } : {}) } })) as Row;
    } catch (e) {
      if (isP2002(e)) throw new ConflictException({ error: 'NUMBER_TAKEN', message: `Bu raqam band: ${number}` });
      throw e;
    }
    await this.syncUserExt(row, cur);
    return { module: this.view(row) };
  }

  async remove(id: string) {
    const cur = (await this.prisma.pbxModule.findUnique({ where: { id } })) as Row | null;
    if (!cur) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Modul topilmadi' });
    const refs = await this.referencedBy(cur.number);
    if (refs.length) throw new ConflictException({ error: 'IN_USE', message: `O'chirib bo'lmaydi: ${refs.map((r) => r.number).join(', ')} modullari shunga yo'naltirilgan`, usedBy: refs });
    const ext = await this.settingRefs(cur.number);
    if (ext.length) throw new ConflictException({ error: 'IN_USE', message: `O'chirib bo'lmaydi: ${ext.join(', ')} sozlamasida ishlatilgan`, usedBy: ext.map((x) => ({ number: x, type: 'setting' })) });
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
      const n = targetsOf(m.type, m.configJson);
      return n.targets.includes(number) || n.members.includes(number);
    }).map((m) => ({ number: m.number, type: m.type }));
  }

  /** Modul raqami sozlamalarda ishlatilganmi: chiquvchi qoida (trunk/xodim), callback vidjeti, avto-qayta qo'ng'iroq. */
  private async settingRefs(number: string): Promise<string[]> {
    const out: string[] = [];
    const rules = (await this.outgoing()).rules || [];
    const r = rules.find((x: any) => x?.trunk === number || (Array.isArray(x?.users) && x.users.includes(number)));
    if (r) out.push(`chiquvchi qoida «${r.name || r.mask || r.id}»`);
    if ((await this.setting<{ ext?: string }>('pbx_callback', {})).ext === number) out.push('callback vidjeti');
    if ((await this.setting<{ ext?: string }>('pbx_autorecall', {})).ext === number) out.push("avto-qayta qo'ng'iroq");
    return out;
  }

  private assertNumber(type: ModuleType, number: string) {
    if (!NUMBER_RE.test(number)) throw new BadRequestException({ error: 'BAD_NUMBER', message: "Raqam noto'g'ri (harf/raqam, 32 belgigacha, _ bilan boshlanmaydi)" });
    if (type === 'user' && !USER_NUMBER_RE.test(number)) throw new BadRequestException({ error: 'BAD_NUMBER', message: "Xodimning ichki raqami 2–5 xonali son bo'lishi kerak" });
  }

  /** Bitta CRM foydalanuvchisi faqat bitta «Пользователь» moduliga bog'lanadi. */
  private async assertCrmUserFree(type: ModuleType, cfg: Record<string, unknown>, selfId?: string) {
    if (type !== 'user' || !cfg.crmUserId) return;
    const others = await this.prisma.pbxModule.findMany({ where: { type: 'user', ...(selfId ? { id: { not: selfId } } : {}) }, select: { number: true, configJson: true } });
    const busy = others.find((m) => parse<Record<string, any>>(m.configJson, {}).crmUserId === cfg.crmUserId);
    if (busy) throw new ConflictException({ error: 'CRM_USER_TAKEN', message: `Bu CRM foydalanuvchisi allaqachon ${busy.number} raqamiga biriktirilgan` });
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
    if (prev) {
      // raqam o'zgardi yoki boshqa foydalanuvchiga (A → B) o'tkazildi — eski egasining ichki raqami tozalanadi
      const pc = parse<Record<string, any>>(prev.configJson, {});
      if (pc.crmUserId && (prev.number !== row.number || pc.crmUserId !== cfg.crmUserId)) await this.prisma.user.updateMany({ where: { id: pc.crmUserId, extension: prev.number }, data: { extension: null } });
    }
    if (cfg.crmUserId) {
      const u = await this.prisma.user.findUnique({ where: { id: cfg.crmUserId }, select: { id: true, sipPassword: true } });
      if (u) {
        // modul — manba: shu raqamni o'zida yozib qo'ygan boshqa foydalanuvchilardan olib tashlanadi
        await this.prisma.user.updateMany({ where: { extension: row.number, id: { not: u.id } }, data: { extension: null } });
        // SIP parolini server yaratadi (24 belgi); foydalanuvchi o'zi kiritmaydi
        const weak = !u.sipPassword || u.sipPassword.length < 16 || /[\x00-\x20;"\\]/.test(u.sipPassword);
        await this.prisma.user.update({ where: { id: u.id }, data: { extension: row.number, ...(weak ? { sipPassword: randomBytes(18).toString('base64url') } : {}) } });
      }
    }
  }

  /** Oqim tekshiruvi: bo'sh «keyingi qadam», yetim modullar, ishlamaydigan raqamlar. */
  async validateFlow() {
    const rows = (await this.prisma.pbxModule.findMany()) as Row[];
    const numbers = new Set(rows.map((r) => r.number));
    const issues: { level: 'error' | 'warn'; number: string; message: string }[] = [];
    const referenced = new Set<string>();
    for (const r of rows) {
      const n = targetsOf(r.type, r.configJson);
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
    try {
      const out = generateAsterisk(mods, { blacklist: bl, outgoing: await this.outgoing(), sipSecrets: withSecrets ? secrets : {}, recording: await this.recording(), nat: natFromEnv(), quality: await this.quality() });
      return { ...out, missing };
    } catch (e) {
      if (e instanceof GeneratorError || e instanceof SchemaError) throw new BadRequestException({ error: 'BAD_CONFIG', message: e.message });
      throw e;
    }
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
  /** CRM konteyneri root bo'lsa fayllar root egaligida yoziladi — Asterisk (uid 1000) o'qiy olishi uchun egasini almashtiramiz (xato bo'lsa e'tiborsiz). */
  private async chownAst(file: string) {
    const uid = Number(process.env.ASTERISK_UID ?? 1000), gid = Number(process.env.ASTERISK_GID ?? 1000);
    try { await fs.chown(file, uid, gid); } catch { /* root emas yoki ruxsat yo'q — bir xil foydalanuvchi bo'lsa kerak */ }
  }

  /**
   * Bitta audio faylni Asterisk ovozlar papkasiga (`custom/<id>.wav`) yozadi — «Stansiyaga qo'llash» va avtoinformator ishga tushganda.
   * Asterisk wav faqat 8 kHz mono 16-bit PCM; mp3/ogg uchun qo'shimcha modul kerak — ffmpeg bo'lsa hammasi 8 kHz mono wav'ga o'tkaziladi.
   */
  async writeAudioFile(id: string): Promise<boolean> {
    const sounds = process.env.ASTERISK_SOUNDS_DIR;
    if (!sounds || !/^[A-Za-z0-9_-]+$/.test(id)) return false;
    const a = await this.prisma.pbxAudio.findUnique({ where: { id } });
    if (!a) return false;
    const cdir = join(sounds, 'custom');
    await fs.mkdir(cdir, { recursive: true });
    const ext = a.mime.includes('mpeg') || a.mime.includes('mp3') ? 'mp3' : a.mime.includes('ogg') ? 'ogg' : 'wav';
    const wav = await transcodeWav(Buffer.from(a.data));
    const out = wav ? 'wav' : ext;
    const target = join(cdir, `${a.id}.${out}`);
    await fs.writeFile(target, wav || Buffer.from(a.data));
    await this.chownAst(target);
    for (const o of ['wav', 'mp3', 'ogg']) if (o !== out) await fs.rm(join(cdir, `${a.id}.${o}`), { force: true }); // eski format qolib ketmasin
    return true;
  }

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
      const tmp = join(dir, `.${name}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`); // parallel qo'llashda to'qnashmasin
      await fs.writeFile(tmp, text + '\n', { mode: 0o640 });
      await fs.rename(tmp, join(dir, name)); // atomik almashtirish
      await this.chownAst(join(dir, name));
      written.push(name);
    }
    let audio = 0;
    if (process.env.ASTERISK_SOUNDS_DIR) for (const a of await this.prisma.pbxAudio.findMany({ select: { id: true } })) if (await this.writeAudioFile(a.id)) audio++;
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
    const q = await this.quality();
    if (q.promptAudioId === id || q.thanksAudioId === id) used.push('sifat bahosi');
    const inf = await this.prisma.pbxInformer.findFirst({ where: { audioId: id, status: { not: 'done' } }, select: { name: true } });
    if (inf) used.push(`avtoinformator «${inf.name}»`);
    if (used.length) throw new ConflictException({ error: 'IN_USE', message: `O'chirib bo'lmaydi: ishlatilmoqda (${used.join(', ')})` });
    const r = await this.prisma.pbxAudio.deleteMany({ where: { id } });
    if (!r.count) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Audio topilmadi' });
    return { ok: true };
  }

  // ── Qora ro'yxat ──
  async blacklist() { return { numbers: (await this.prisma.pbxBlacklist.findMany({ orderBy: { createdAt: 'desc' } })).map((b) => ({ id: b.id, number: b.number, note: b.note })) }; }
  async blacklistAdd(dto: { number?: string; note?: string }) {
    const number = String(dto.number || '').trim().replace(/[\s()-]/g, '');
    if (!/^\+?\d{3,20}$/.test(number)) throw new BadRequestException({ error: 'BAD_NUMBER', message: "Raqam noto'g'ri (faqat raqamlar, ixtiyoriy +)" });
    // +998901234567 / 998901234567 / 901234567 — bir raqam (oxirgi 9 raqam bo'yicha)
    const key = phoneKey(number);
    if ((await this.prisma.pbxBlacklist.findMany({ select: { number: true } })).some((b) => phoneKey(b.number) === key)) throw new ConflictException({ error: 'EXISTS', message: "Bu raqam ro'yxatda bor" });
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
  /**
   * Suhbatlarni yozib olish (MixMonitor) — standart yoqilgan; papka Asterisk serveridagi yo'l (CRM uni ASTERISK_RECORDINGS_DIR orqali o'qiydi).
   * keepDays — yozuvlar N kundan keyin o'chiriladi (standart 90; 0 — o'chirilmaydi). Tozalashni RecordingRetentionService bajaradi.
   */
  async recording() {
    const r = await this.setting<{ enabled?: boolean; dir?: string; keepDays?: number }>(RECORDING_KEY, {});
    const k = Number(r.keepDays);
    return { enabled: r.enabled !== false, dir: r.dir || '/var/spool/asterisk/monitor', keepDays: Number.isInteger(k) && k >= 0 && k <= 3650 ? k : 90 };
  }
  async saveRecording(dto: { enabled?: boolean; dir?: string; keepDays?: unknown }) {
    const cur = await this.recording();
    const dir = String(dto.dir ?? cur.dir).trim();
    if (!/^\/[\w./-]{1,200}$/.test(dir) || dir.includes('..')) throw new BadRequestException({ error: 'BAD_DIR', message: "Papka mutlaq yo'l bo'lsin (masalan /var/spool/asterisk/monitor)" });
    let keepDays = cur.keepDays;
    if (dto.keepDays !== undefined && dto.keepDays !== null && dto.keepDays !== '') {
      const k = Number(dto.keepDays);
      if (!Number.isInteger(k) || k < 0 || k > 3650) throw new BadRequestException({ error: 'BAD_KEEP_DAYS', message: "Saqlash muddati 0–3650 kun (0 — o'chirilmaydi)" });
      keepDays = k;
    }
    const v = { enabled: dto.enabled === undefined ? cur.enabled : !!dto.enabled, dir, keepDays };
    await this.saveSetting(RECORDING_KEY, v);
    return v;
  }
  /** «Оценка качества»: suhbatdan keyin mijozdan 1–5 baho (dialplan `crm-rate`). scope: in — faqat kiruvchi, all — chiquvchi ham. */
  async quality(): Promise<QualityCfg> {
    const r = await this.setting<Partial<QualityCfg>>(QUALITY_KEY, {});
    const id = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v) ? v : null);
    return { enabled: !!r.enabled, promptAudioId: id(r.promptAudioId), thanksAudioId: id(r.thanksAudioId), scope: r.scope === 'all' ? 'all' : 'in' };
  }
  async saveQuality(dto: Partial<QualityCfg>) {
    const cur = await this.quality();
    const next: QualityCfg = {
      enabled: dto.enabled === undefined ? cur.enabled : !!dto.enabled,
      promptAudioId: dto.promptAudioId === undefined ? cur.promptAudioId : dto.promptAudioId ? String(dto.promptAudioId) : null,
      thanksAudioId: dto.thanksAudioId === undefined ? cur.thanksAudioId : dto.thanksAudioId ? String(dto.thanksAudioId) : null,
      scope: dto.scope === undefined ? cur.scope : dto.scope === 'all' ? 'all' : dto.scope === 'in' ? 'in' : (() => { throw new BadRequestException({ error: 'BAD_SCOPE', message: "Qamrov noto'g'ri (in yoki all)" }); })(),
    };
    for (const k of ['promptAudioId', 'thanksAudioId'] as const) {
      const v = next[k];
      if (v && !(await this.prisma.pbxAudio.findUnique({ where: { id: v }, select: { id: true } }))) throw new BadRequestException({ error: 'AUDIO_NOT_FOUND', message: 'Audio fayl topilmadi' });
    }
    if (next.enabled && !next.promptAudioId) throw new BadRequestException({ error: 'NO_PROMPT', message: "Yoqish uchun so'rov audiosini tanlang (yoki matndan yarating)" });
    await this.saveSetting(QUALITY_KEY, next);
    return next;
  }
  async saveOutgoing(dto: { rules?: any[] }) {
    const rules = (Array.isArray(dto.rules) ? dto.rules : []).slice(0, 100).map((r, i) => {
      const mask = String(r?.mask ?? '').trim().replace(/[\s()]/g, '').slice(0, 64);
      if (mask && !/^\+?[0-9XZN*#.!\[\]-]*$/.test(mask)) throw new BadRequestException({ error: 'BAD_MASK', message: `Maska noto'g'ri: ${mask}` });
      const trunk = String(r?.trunk || '').trim().slice(0, 32);
      if (trunk && !NUMBER_RE.test(trunk)) throw new BadRequestException({ error: 'BAD_TRUNK', message: `Trunk raqami noto'g'ri: ${trunk}` });
      const externalNumber = String(r?.externalNumber || '').trim().replace(/[\s()-]/g, '').slice(0, 32);
      if (externalNumber && !/^\+?\d{3,20}$/.test(externalNumber)) throw new BadRequestException({ error: 'BAD_NUMBER', message: `Chiquvchi raqam noto'g'ri: ${externalNumber}` });
      const users = (Array.isArray(r?.users) ? r.users : []).map((u: unknown) => String(u).trim()).filter(Boolean).slice(0, 200);
      const badU = users.find((u: string) => !EXT_RE.test(u));
      if (badU) throw new BadRequestException({ error: 'BAD_USER', message: `Ichki raqam noto'g'ri: ${badU}` });
      return { id: String(r?.id || `r${i + 1}`).replace(/[^\w-]/g, '').slice(0, 40) || `r${i + 1}`, name: cleanName(r?.name, 80), mask, trunk, externalNumber, users };
    });
    await this.saveSetting(OUTGOING_KEY, { rules });
    return { rules };
  }
}
