import { BadRequestException, Injectable } from '@nestjs/common';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

type DupMode = 'skip' | 'update' | 'create';
interface ImportOptions {
  pipelineId?: string | null; // standart voronka uchun null / 'main'
  stageKey?: string | null; // qator bosqichi bo'lmaganda
  assigneeId?: string | null;
  tag?: string | null; // barcha qatorlarga qo'shiladigan teg
  dupMode?: DupMode;
}
interface ImportRow { _row?: number; [k: string]: any }
export interface ImportResult {
  ok: true;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

const digits = (p?: string | null) => (p || '').replace(/\D/g, '');
const str = (v: unknown, max = 255) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function parse<T>(s: string | null, fb: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fb; }
}
function money(v: unknown): number | null {
  const raw = str(v);
  if (!raw) return 0;
  if (!/\d/.test(raw)) return null;
  const s = raw.replace(/\s/g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** amoCRM uslubidagi import: bitimlar va kontaktlar (partiyalab, qatorma-qator validatsiya). */
@Injectable()
export class CrmImportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Google Sheets havolasi → CSV (faqat docs.google.com; jadval «havolaga ega har kim ko'ra oladi» bo'lishi kerak). */
  async fetchSheet(url: string) {
    let u: URL;
    try { u = new URL(url.trim()); } catch { throw new BadRequestException({ error: 'BAD_URL', message: 'Google jadval havolasi noto`g`ri' }); }
    const m = u.pathname.match(/^\/spreadsheets\/d\/([\w-]{20,})/);
    if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com' || !m) throw new BadRequestException({ error: 'BAD_URL', message: 'Google jadval havolasi noto`g`ri' });
    const gid = (u.hash.match(/gid=(\d+)/) || u.search.match(/gid=(\d+)/) || [])[1];
    const exportUrl = `https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
    const res = await fetch(exportUrl, { redirect: 'follow', signal: AbortSignal.timeout(15000) }).catch(() => null);
    const type = res?.headers.get('content-type') || '';
    if (!res || !res.ok || !type.includes('csv')) {
      throw new BadRequestException({ error: 'SHEET_PRIVATE', message: "Jadvalni o'qib bo'lmadi: «Havolaga ega har kim ko'ra oladi» ruxsatini yoqing" });
    }
    const csv = await res.text();
    if (csv.length > 5_000_000) throw new BadRequestException({ error: 'TOO_BIG', message: 'Jadval juda katta (5 MB dan oshmasin)' });
    return { csv, name: `google-sheet-${m[1].slice(0, 8)}.csv` };
  }

  async history() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'import_history' } });
    let items: any[] = [];
    try { items = JSON.parse(row?.value || '[]'); } catch { /* */ }
    return { items: Array.isArray(items) ? items : [] };
  }
  async addHistory(dto: any, user?: AuthUser) {
    const n = (v: unknown) => Math.max(0, Math.floor(Number(v) || 0));
    const item = {
      at: new Date().toISOString(), entity: dto.entity === 'contacts' ? 'contacts' : 'leads',
      fileName: String(dto.fileName || '').slice(0, 200), userName: user?.name || '',
      created: n(dto.created), updated: n(dto.updated), skipped: n(dto.skipped), errors: n(dto.errors),
    };
    const items = [item, ...(await this.history()).items].slice(0, 100);
    const value = JSON.stringify(items);
    await this.prisma.appSetting.upsert({ where: { key: 'import_history' }, create: { key: 'import_history', value }, update: { value } });
    return { item };
  }

  async run(entity: string, rows: ImportRow[], opts: ImportOptions, user?: AuthUser): Promise<ImportResult> {
    if (entity !== 'leads' && entity !== 'contacts')
      throw new BadRequestException({ error: 'BAD_ENTITY', message: 'entity leads yoki contacts bo`lishi kerak' });
    if (!Array.isArray(rows) || rows.length === 0)
      throw new BadRequestException({ error: 'NO_ROWS', message: 'Qatorlar yo`q' });
    if (rows.length > 1000)
      throw new BadRequestException({ error: 'TOO_MANY', message: 'Bir so`rovda 1000 tadan ko`p qator mumkin emas' });
    const dupMode: DupMode = (['skip', 'update', 'create'] as const).includes(opts?.dupMode as DupMode) ? (opts.dupMode as DupMode) : 'skip';
    return entity === 'leads' ? this.leads(rows, { ...opts, dupMode }, user) : this.contacts(rows, { ...opts, dupMode }, user);
  }

  private async fieldMap(entity: 'lead' | 'contact') {
    const fields = await this.prisma.crmField.findMany({ where: { entity, active: true } });
    return new Map(fields.map((f) => [f.key, f]));
  }
  private customOf(r: ImportRow, fm: Map<string, { key: string; type: string; label: string; optionsJson: string }>, err: string[]) {
    const out: Record<string, unknown> = {};
    for (const [k, raw] of Object.entries(r)) {
      if (!k.startsWith('cf:')) continue;
      const f = fm.get(k.slice(3));
      const v = str(raw, 2000);
      if (!f || !v) continue;
      if (f.type === 'number') {
        const n = Number(v.replace(/\s/g, '').replace(',', '.'));
        if (!Number.isFinite(n)) { err.push(`"${f.label}": raqam emas`); continue; }
        out[f.key] = n;
      } else if (f.type === 'checkbox') out[f.key] = /^(1|true|ha|да|yes|y|\+)$/i.test(v);
      else if (f.type === 'multiselect') out[f.key] = v.split(/[;|]/).map((x) => x.trim()).filter(Boolean);
      else if (f.type === 'email' && !EMAIL_RE.test(v)) err.push(`"${f.label}": email noto'g'ri`);
      else out[f.key] = v;
    }
    return out;
  }

  // ── Bitimlar ──
  private async leads(rows: ImportRow[], o: ImportOptions & { dupMode: DupMode }, user?: AuthUser): Promise<ImportResult> {
    const res: ImportResult = { ok: true, created: 0, updated: 0, skipped: 0, errors: [] };
    const [pipelines, stages, users, fm, existing, existingContacts] = await Promise.all([
      this.prisma.crmPipeline.findMany(),
      this.prisma.crmStage.findMany({ orderBy: { order: 'asc' } }),
      this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      this.fieldMap('lead'),
      this.prisma.lead.findMany({ select: { id: true, phone: true, email: true, tagsJson: true, customJson: true } }),
      this.prisma.contact.findMany({ select: { id: true, name: true, phone: true, email: true } }),
    ]);
    const defPid = o.pipelineId && o.pipelineId !== 'main' ? o.pipelineId : null;
    const pipeByName = new Map(pipelines.map((p) => [p.name.toLowerCase(), p.id]));
    const userByName = new Map(users.map((u) => [u.name.toLowerCase(), u.id]));
    const userIds = new Set(users.map((u) => u.id));
    if (o.assigneeId && !userIds.has(o.assigneeId)) throw new BadRequestException({ error: 'BAD_ASSIGNEE', message: 'Mas`ul topilmadi' });
    const queues = new Map<string, number>();
    const nextQ = async (stage: string) => {
      if (!queues.has(stage)) {
        const m = await this.prisma.lead.aggregate({ where: { stage }, _max: { queue: true } });
        queues.set(stage, (m._max.queue ?? -1) + 1);
      }
      const q = queues.get(stage)!;
      queues.set(stage, q + 1);
      return q;
    };
    const idx = existing.map((l) => ({ ...l, tail: digits(l.phone).slice(-9), em: (l.email || '').toLowerCase() }));
    const cIdx = existingContacts.map((c) => ({ ...c, tail: digits(c.phone).slice(-9), em: (c.email || '').toLowerCase() }));

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNo = Number(r._row) || i + 1;
      const errs: string[] = [];
      try {
        const name = str(r.name);
        const phone = str(r.phone, 50) || null;
        const email = str(r.email).toLowerCase() || null;
        if (!name) errs.push('Bitim nomi bo`sh');
        if (email && !EMAIL_RE.test(email)) errs.push('Email noto`g`ri');
        if (phone && digits(phone).length < 7) errs.push('Telefon noto`g`ri');
        const value = money(r.value);
        if (value === null) errs.push('Byudjet raqam emas');
        const custom = this.customOf(r, fm, errs);

        // voronka / bosqich
        let pid = defPid;
        const rp = str(r.pipeline);
        if (rp) {
          const f = pipeByName.get(rp.toLowerCase());
          if (f) pid = f; else if (!/^(asosiy|main|основная|standart)$/i.test(rp)) errs.push(`Voronka topilmadi: ${rp}`);
        }
        const pStages = stages.filter((s) => (s.pipelineId || null) === pid);
        let stage = pStages.find((s) => s.key === o.stageKey) || pStages.find((s) => s.kind === 'open') || pStages[0];
        const rs = str(r.stage);
        if (rs) {
          const f = pStages.find((s) => s.name.toLowerCase() === rs.toLowerCase() || s.key === rs);
          if (f) stage = f; else errs.push(`Bosqich topilmadi: ${rs}`);
        }
        if (!stage) errs.push('Bosqich aniqlanmadi');

        let assigneeId = o.assigneeId || null;
        const ra = str(r.assignee);
        if (ra) {
          const f = userByName.get(ra.toLowerCase());
          if (f) assigneeId = f; else errs.push(`Mas'ul topilmadi: ${ra}`);
        }

        if (errs.length) { res.errors.push({ row: rowNo, message: errs.join('; ') }); continue; }

        const tags = [...new Set([...str(r.tags, 1000).split(/[,;]/).map((x) => x.trim()).filter(Boolean), ...(o.tag ? [o.tag] : [])])];
        const tail = digits(phone).slice(-9);
        const dup = idx.find((l) => (tail.length >= 7 && l.tail === tail) || (email && l.em === email));
        if (dup && o.dupMode === 'skip') { res.skipped++; continue; }

        // kontakt (ism berilgan yoki telefon/email bor bo'lsa)
        const contactName = str(r.contactName);
        let contactId: string | null = null;
        if (contactName || phone || email) {
          const ct = cIdx.find((c) => (tail.length >= 7 && c.tail === tail) || (email && c.em === email));
          if (ct) contactId = ct.id;
          else if (contactName) {
            const c = await this.prisma.contact.create({ data: { name: contactName, phone, email, createdById: user?.id || null } });
            contactId = c.id;
            cIdx.push({ id: c.id, name: c.name, phone, email, tail, em: email || '' });
          }
        }
        let companyId: string | null = null;
        const companyName = str(r.company);
        if (companyName) {
          const comp = await this.prisma.company.findFirst({ where: { name: { equals: companyName, mode: 'insensitive' } }, select: { id: true } })
            || await this.prisma.company.create({ data: { name: companyName, createdById: user?.id || null } });
          companyId = comp.id;
        }

        if (dup && o.dupMode === 'update') {
          const data: Record<string, unknown> = {};
          if (name) data.name = name;
          if (value) data.value = value;
          if (email) data.email = email;
          if (phone) data.phone = phone;
          if (companyName) { data.company = companyName; data.companyId = companyId; }
          if (assigneeId) data.assigneeId = assigneeId;
          if (contactId) data.contactId = contactId;
          data.tagsJson = JSON.stringify([...new Set([...parse<string[]>(dup.tagsJson, []), ...tags])]);
          data.customJson = JSON.stringify({ ...parse<Record<string, unknown>>(dup.customJson, {}), ...custom });
          data.lastActivityAt = new Date();
          await this.prisma.lead.update({ where: { id: dup.id }, data });
          res.updated++;
          continue;
        }

        const lead = await this.prisma.lead.create({
          data: {
            name, phone, email,
            company: companyName || null, companyId, contactId,
            source: str(r.source) || 'Import',
            value: value || 0,
            stage: stage!.key,
            pipelineId: pid,
            queue: await nextQ(stage!.key),
            assigneeId,
            tagsJson: JSON.stringify(tags),
            customJson: JSON.stringify(custom),
            createdById: user?.id || null,
          },
        });
        idx.push({ id: lead.id, phone, email, tagsJson: lead.tagsJson, customJson: lead.customJson, tail, em: email || '' });
        res.created++;
      } catch (e: any) {
        res.errors.push({ row: rowNo, message: e?.message ? String(e.message).slice(0, 200) : 'Noma`lum xato' });
      }
    }
    await this.ensureTags(o.tag ? [o.tag] : []);
    return res;
  }

  // ── Kontaktlar ──
  private async contacts(rows: ImportRow[], o: ImportOptions & { dupMode: DupMode }, user?: AuthUser): Promise<ImportResult> {
    const res: ImportResult = { ok: true, created: 0, updated: 0, skipped: 0, errors: [] };
    const [fm, existing, users] = await Promise.all([
      this.fieldMap('contact'),
      this.prisma.contact.findMany({ select: { id: true, phone: true, email: true, customJson: true } }),
      this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);
    const userByName = new Map(users.map((u) => [u.name.toLowerCase(), u.id]));
    if (o.assigneeId && !users.some((u) => u.id === o.assigneeId)) throw new BadRequestException({ error: 'BAD_ASSIGNEE', message: 'Mas`ul topilmadi' });
    const idx = existing.map((c) => ({ ...c, tail: digits(c.phone).slice(-9), em: (c.email || '').toLowerCase() }));

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowNo = Number(r._row) || i + 1;
      const errs: string[] = [];
      try {
        const name = str(r.name);
        const phone = str(r.phone, 50) || null;
        const email = str(r.email).toLowerCase() || null;
        if (!name) errs.push('Ism bo`sh');
        if (email && !EMAIL_RE.test(email)) errs.push('Email noto`g`ri');
        if (phone && digits(phone).length < 7) errs.push('Telefon noto`g`ri');
        const custom = this.customOf(r, fm, errs);
        let assigneeId = o.assigneeId || null;
        const ra = str(r.assignee);
        if (ra) {
          const f = userByName.get(ra.toLowerCase());
          if (f) assigneeId = f; else errs.push(`Mas'ul topilmadi: ${ra}`);
        }
        if (errs.length) { res.errors.push({ row: rowNo, message: errs.join('; ') }); continue; }
        if (assigneeId) custom._assigneeId = assigneeId;

        const tail = digits(phone).slice(-9);
        const dup = idx.find((c) => (tail.length >= 7 && c.tail === tail) || (email && c.em === email));
        if (dup && o.dupMode === 'skip') { res.skipped++; continue; }

        const position = str(r.position) || null;
        let companyId: string | null = null;
        const companyName = str(r.company);
        if (companyName) {
          const comp = await this.prisma.company.findFirst({ where: { name: { equals: companyName, mode: 'insensitive' } }, select: { id: true } })
            || await this.prisma.company.create({ data: { name: companyName, createdById: user?.id || null } });
          companyId = comp.id;
        }
        if (dup && o.dupMode === 'update') {
          const data: Record<string, unknown> = { name };
          if (phone) data.phone = phone;
          if (email) data.email = email;
          if (position) data.position = position;
          if (companyId) data.companyId = companyId;
          data.customJson = JSON.stringify({ ...parse<Record<string, unknown>>(dup.customJson, {}), ...custom });
          await this.prisma.contact.update({ where: { id: dup.id }, data });
          res.updated++;
          continue;
        }
        const c = await this.prisma.contact.create({
          data: { name, phone, email, position, companyId, customJson: JSON.stringify(custom), createdById: user?.id || null },
        });
        idx.push({ id: c.id, phone, email, customJson: c.customJson, tail, em: email || '' });
        res.created++;
      } catch (e: any) {
        res.errors.push({ row: rowNo, message: e?.message ? String(e.message).slice(0, 200) : 'Noma`lum xato' });
      }
    }
    return res;
  }

  private async ensureTags(names: string[]) {
    for (const name of names) {
      await this.prisma.crmTag.upsert({ where: { name }, create: { name }, update: {} });
    }
  }
}
