import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { generateAsterisk, type GenModule } from './asterisk.generator';
import { MODULE_TYPES, NUMBER_BASE, NUMBER_RE, SchemaError, normalizeConfig, type ModuleType } from './pbx-schema';

const isType = (t: unknown): t is ModuleType => (MODULE_TYPES as readonly string[]).includes(String(t));
const MUSIC_KEY = 'pbx_music';
const OUTGOING_KEY = 'pbx_outgoing';

type Row = { id: string; type: string; number: string; name: string | null; configJson: string; enabled: boolean; createdAt: Date; updatedAt: Date };
const parse = <T,>(s: string, d: T): T => { try { return JSON.parse(s) as T; } catch { return d; } };

@Injectable()
export class PbxService {
  constructor(private readonly prisma: PrismaService) {}

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

  /** Asterisk sozlamasini ko'rish (parollar yashiriladi). Haqiqiy faylni stansiya serveri (keyingi bosqich) ichki funksiyadan oladi. */
  async asteriskPreview() {
    const rows = (await this.prisma.pbxModule.findMany({ orderBy: { number: 'asc' } })) as Row[];
    const mods: GenModule[] = rows.map((r) => ({ type: r.type, number: r.number, name: r.name, enabled: r.enabled, config: { ...parse<Record<string, unknown>>(r.configJson, {}), password: undefined } }));
    const bl = (await this.prisma.pbxBlacklist.findMany({ select: { number: true } })).map((b) => b.number);
    return generateAsterisk(mods, { blacklist: bl, outgoing: await this.outgoing() });
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
