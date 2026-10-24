import { Prisma } from '../generated/prisma/client';

/**
 * Ro'yxatlar uchun umumiy SQL yordamchilari: filtr -> WHERE, saralash, sahifalash kursori.
 * Bitimlar (leads), kontaktlar va kompaniyalar bir xil qoidalar bilan ishlaydi.
 * Raw SQL ishlatilishining sababi: bosqich tartibi / mas'ul nomi / kontakt nomi bo'yicha saralash,
 * vazifa holati (EXISTS) va telefon raqamlari bo'yicha normallashtirilgan qidiruv Prisma where'da ifodalanmaydi.
 */

const BIZ_TZ_HOURS = 5; // akkaunt biznes vaqti UTC+5 (getPipeline'dagi bilan bir xil)
const DAY = 86_400_000;

export type Cond = Prisma.Sql;

/** Biznes kunining boshlanishi (UTC Date), offsetDays kun oldin. */
export function bizDayStart(offsetDays = 0, now = Date.now()): Date {
  const shifted = now + BIZ_TZ_HOURS * 3600_000;
  const midnight = shifted - (((shifted % DAY) + DAY) % DAY);
  return new Date(midnight - BIZ_TZ_HOURS * 3600_000 - offsetDays * DAY);
}

export function digitsOf(v?: string | null): string {
  return (v || '').replace(/\D/g, '');
}

/** LIKE uchun maxsus belgilarni ekranlash (\ % _). */
export function escLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}
export const like = (s: string) => '%' + escLike(s) + '%';

/** Qidiruv matni telefon raqamiga o'xshaydimi (faqat raqam/bo'shliq/+()-.)? Unda raqamlar bo'yicha qidiriladi. */
export function phoneLike(search: string): string | null {
  const d = digitsOf(search);
  return d.length >= 2 && /^[\d\s()+\-.]+$/.test(search) ? d : null;
}

export function and(conds: Cond[]): Cond {
  return conds.length ? Prisma.join(conds, ' AND ') : Prisma.sql`TRUE`;
}

export function periodStart(period?: string): { from?: Date; to?: Date } {
  switch (period) {
    case 'today': return { from: bizDayStart(0) };
    case 'yesterday': return { from: bizDayStart(1), to: bizDayStart(0) };
    case 'week': return { from: bizDayStart(6) };
    case 'month': return { from: bizDayStart(29) };
    default: return {};
  }
}

export function toList(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => toList(x));
  if (typeof v !== 'string' || !v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Sahifalash: cursor = offset (matn). */
export function parsePaging(q: { limit?: string; cursor?: string }, def = 50, max = 200) {
  const raw = q.limit !== undefined && q.limit !== '' ? Number(q.limit) : NaN;
  const paged = Number.isFinite(raw) && raw > 0;
  const limit = paged ? Math.min(Math.floor(raw), max) : def;
  const off = Number(q.cursor);
  const offset = Number.isFinite(off) && off > 0 ? Math.floor(off) : 0;
  return { paged, limit, offset };
}

export function dirOf(dir?: string): Prisma.Sql {
  return String(dir || '').toLowerCase() === 'asc' || dir === '1' ? Prisma.sql`ASC` : Prisma.sql`DESC`;
}

// ───────────────────────── Bitimlar ─────────────────────────

export interface LeadFilter {
  search?: string; name?: string; preset?: string; period?: string; assigneeId?: string;
  budgetFrom?: string; budgetTo?: string; minValue?: string; maxValue?: string;
  tags?: string | string[]; tag?: string; pipelineId?: string; stage?: string; source?: string; hot?: string;
  task?: string; contactId?: string; companyId?: string; unsorted?: string;
}

export interface LeadCtx {
  userId?: string;
  /** stage kalit -> kind (open|won|lost) */
  kinds: Map<string, string>;
}

const keysOf = (ctx: LeadCtx, kind: string) => [...ctx.kinds].filter(([, k]) => k === kind).map(([key]) => key);

const inList = (col: Cond, keys: string[]): Cond => (keys.length ? Prisma.sql`${col} IN (${Prisma.join(keys)})` : Prisma.sql`FALSE`);

/** Bitimlar WHERE shartlari (jadval alias'i: l). */
export function leadConds(q: LeadFilter, ctx: LeadCtx): Cond[] {
  const c: Cond[] = [];
  const todayStart = bizDayStart(0);
  const openTask = (extra: Cond) => Prisma.sql`EXISTS (SELECT 1 FROM lead_tasks t WHERE t."leadId" = l.id AND t.done = FALSE AND ${extra})`;

  if (q.unsorted === '0' || q.unsorted === 'false') c.push(Prisma.sql`l.unsorted = FALSE`);
  else if (q.unsorted === '1' || q.unsorted === 'true') c.push(Prisma.sql`l.unsorted = TRUE`);

  switch (q.preset) {
    case 'open': c.push(inList(Prisma.sql`l.stage`, keysOf(ctx, 'open'))); break;
    case 'won': c.push(inList(Prisma.sql`l.stage`, keysOf(ctx, 'won'))); break;
    case 'lost': c.push(inList(Prisma.sql`l.stage`, keysOf(ctx, 'lost'))); break;
    case 'mine': c.push(ctx.userId ? Prisma.sql`l."assigneeId" = ${ctx.userId}` : Prisma.sql`FALSE`); break;
    case 'notask':
      c.push(inList(Prisma.sql`l.stage`, keysOf(ctx, 'open')));
      c.push(Prisma.sql`NOT ${openTask(Prisma.sql`TRUE`)}`);
      break;
    case 'overdue':
      c.push(inList(Prisma.sql`l.stage`, keysOf(ctx, 'open')));
      c.push(openTask(Prisma.sql`t."dueDate" < ${todayStart}`));
      break;
    default: break;
  }

  // Vazifa holati (kartochkadagi bilan bir xil: eng erta ochiq vazifa bo'yicha)
  if (q.task) {
    const tomorrow = bizDayStart(-1);
    if (q.task === 'none') c.push(Prisma.sql`NOT ${openTask(Prisma.sql`TRUE`)}`);
    else if (q.task === 'overdue') c.push(openTask(Prisma.sql`t."dueDate" < ${todayStart}`));
    else if (q.task === 'today') {
      c.push(openTask(Prisma.sql`t."dueDate" >= ${todayStart} AND t."dueDate" < ${tomorrow}`));
      c.push(Prisma.sql`NOT ${openTask(Prisma.sql`t."dueDate" < ${todayStart}`)}`);
    } else if (q.task === 'future') {
      c.push(openTask(Prisma.sql`TRUE`));
      c.push(Prisma.sql`NOT ${openTask(Prisma.sql`t."dueDate" < ${tomorrow}`)}`);
    }
  }

  const { from, to } = periodStart(q.period);
  if (from) c.push(Prisma.sql`l."createdAt" >= ${from}`);
  if (to) c.push(Prisma.sql`l."createdAt" < ${to}`);

  if (q.assigneeId) c.push(q.assigneeId === 'none' ? Prisma.sql`l."assigneeId" IS NULL` : Prisma.sql`l."assigneeId" = ${q.assigneeId}`);
  const vf = q.budgetFrom || q.minValue, vt = q.budgetTo || q.maxValue;
  if (vf && Number.isFinite(Number(vf))) c.push(Prisma.sql`l.value >= ${Math.floor(Number(vf))}`);
  if (vt && Number.isFinite(Number(vt))) c.push(Prisma.sql`l.value <= ${Math.floor(Number(vt))}`);
  for (const tg of [...toList(q.tags), ...toList(q.tag)]) c.push(Prisma.sql`l."tagsJson" LIKE ${like(JSON.stringify(tg))}`);

  if (q.pipelineId !== undefined && q.pipelineId !== null && q.pipelineId !== '__any') {
    c.push(q.pipelineId === '' || q.pipelineId === 'main' ? Prisma.sql`l."pipelineId" IS NULL` : Prisma.sql`l."pipelineId" = ${q.pipelineId}`);
  }
  if (q.stage) c.push(Prisma.sql`l.stage = ${q.stage}`);
  if (q.source) c.push(Prisma.sql`l.source = ${q.source}`);
  if (q.hot === 'true') c.push(Prisma.sql`l.hot = TRUE`);
  if (q.contactId) c.push(Prisma.sql`l."contactId" = ${q.contactId}`);
  if (q.companyId) {
    c.push(Prisma.sql`(l."companyId" = ${q.companyId} OR l."contactId" IN (SELECT id FROM crm_contacts WHERE "companyId" = ${q.companyId}))`);
  }
  if (q.name?.trim()) c.push(Prisma.sql`l.name ILIKE ${like(q.name.trim())}`);

  const s = q.search?.trim();
  if (s) {
    const p = like(s);
    const pd = phoneLike(s);
    const own: Cond[] = [Prisma.sql`l.name ILIKE ${p}`, Prisma.sql`l.email ILIKE ${p}`, Prisma.sql`l.company ILIKE ${p}`, Prisma.sql`l.phone ILIKE ${p}`];
    const cont: Cond[] = [Prisma.sql`k.name ILIKE ${p}`, Prisma.sql`k.phone ILIKE ${p}`, Prisma.sql`k.email ILIKE ${p}`];
    if (pd) {
      own.push(Prisma.sql`l."phoneDigits" LIKE ${like(pd)}`);
      cont.push(Prisma.sql`k."phoneDigits" LIKE ${like(pd)}`);
    }
    c.push(Prisma.sql`(${Prisma.join(own, ' OR ')} OR l."contactId" IN (SELECT k.id FROM crm_contacts k WHERE ${Prisma.join(cont, ' OR ')}))`);
  }
  return c;
}

/** Saralash: JOIN + ORDER BY (aniq tartib uchun l.id oxirida). */
export function leadOrder(sort?: string, dir?: string): { join: Prisma.Sql; order: Prisma.Sql } {
  const d = dirOf(dir);
  const none = Prisma.sql``;
  switch (sort) {
    case 'name': case 'n': return { join: none, order: Prisma.sql`ORDER BY l.name ${d}, l.id ASC` };
    case 'createdAt': return { join: none, order: Prisma.sql`ORDER BY l."createdAt" ${d}, l.id ASC` };
    case 'value': case 'budget': return { join: none, order: Prisma.sql`ORDER BY l.value ${d}, l.id ASC` };
    case 'stage':
      return { join: Prisma.sql`LEFT JOIN crm_stages so ON so.key = l.stage`, order: Prisma.sql`ORDER BY so."order" ${d} NULLS LAST, l.stage ${d}, l.id ASC` };
    case 'assignee':
      return { join: Prisma.sql`LEFT JOIN "User" uo ON uo.id = l."assigneeId"`, order: Prisma.sql`ORDER BY lower(uo.name) ${d} NULLS LAST, l.id ASC` };
    case 'contact':
      return { join: Prisma.sql`LEFT JOIN crm_contacts co ON co.id = l."contactId"`, order: Prisma.sql`ORDER BY lower(co.name) ${d} NULLS LAST, l.id ASC` };
    default: return { join: none, order: Prisma.sql`ORDER BY l."updatedAt" DESC, l.id ASC` };
  }
}

// ───────────────────── Kontakt / kompaniya ─────────────────────

export interface EntityFilter {
  search?: string; q?: string; name?: string; phone?: string; email?: string;
  assigneeId?: string; period?: string; preset?: string;
}

/** Mas'ul: customJson._assigneeId, bo'lmasa yaratuvchi — DB trigger saqlaydigan assigneeKey ustuni (indekslangan). */
export const ENTITY_ASSIGNEE = (a: string) => Prisma.raw(`${a}."assigneeKey"`);

/** Kontakt/kompaniya WHERE shartlari (alias a — jadval yoki UNION qatlami; ustunlar: name, phone, email, phoneDigits, createdAt, customJson, createdById). */
export function entityConds(q: EntityFilter, userId: string | undefined, a: string): Cond[] {
  const c: Cond[] = [];
  const col = (n: string) => Prisma.raw(`${a}."${n}"`);
  const search = (q.search ?? q.q)?.trim();
  if (search) {
    const p = like(search);
    const pd = phoneLike(search);
    const parts: Cond[] = [Prisma.sql`${col('name')} ILIKE ${p}`, Prisma.sql`${col('email')} ILIKE ${p}`, Prisma.sql`${col('phone')} ILIKE ${p}`];
    if (pd) parts.push(Prisma.sql`${col('phoneDigits')} LIKE ${like(pd)}`);
    c.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
  }
  if (q.name?.trim()) c.push(Prisma.sql`${col('name')} ILIKE ${like(q.name.trim())}`);
  if (q.phone?.trim()) {
    const pd = digitsOf(q.phone);
    c.push(pd ? Prisma.sql`${col('phoneDigits')} LIKE ${like(pd)}` : Prisma.sql`${col('phone')} ILIKE ${like(q.phone.trim())}`);
  }
  if (q.email?.trim()) c.push(Prisma.sql`${col('email')} ILIKE ${like(q.email.trim())}`);
  const asg = q.preset === 'mine' ? userId || '__none__' : q.assigneeId;
  if (asg) c.push(Prisma.sql`${ENTITY_ASSIGNEE(a)} = ${asg}`);
  const { from, to } = periodStart(q.period);
  if (from) c.push(Prisma.sql`${col('createdAt')} >= ${from}`);
  if (to) c.push(Prisma.sql`${col('createdAt')} < ${to}`);
  return c;
}
