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
  // ── amoCRM filtr paneli (FILTERS-SPEC.md) ──
  /** created | closed | updated | <maxsus sana maydon kaliti> */
  dateField?: string;
  /** all | today | yesterday | this_week | last_week | this_month | last_month | quarter | this_year */
  datePreset?: string;
  from?: string; to?: string;
  /** `pipelineId:stageKey` | `stageKey` | unsorted | won | lost (vergul bilan yoki massiv) */
  stages?: string | string[];
  lostReasons?: string | string[]; // + "none"
  unsortedCategory?: string | string[]; // phone | chat | form | import
  sources?: string | string[];
  assigneeIds?: string | string[]; // + "none"
  createdByIds?: string | string[];
  updatedByIds?: string | string[];
  /** today | tomorrow | week | month | quarter | no_tasks | failed_tasks */
  tasks?: string | string[];
  attention?: string; // ignore | no | yes
  /** maxsus maydonlar: JSON matn, obyekt yoki `cf[key]` kalitlari */
  cf?: unknown;
  utm?: unknown;
  contactName?: string; contactPhone?: string; contactEmail?: string; contactPosition?: string; companyName?: string;
  [k: string]: unknown;
}

export interface LeadCtx {
  userId?: string;
  /** stage kalit -> kind (open|won|lost) */
  kinds: Map<string, string>;
  /** bitim maxsus maydonlari: kalit -> tur */
  fields?: Map<string, string>;
  now?: number;
}

const keysOf = (ctx: LeadCtx, kind: string) => [...ctx.kinds].filter(([, k]) => k === kind).map(([key]) => key);

const inList = (col: Cond, keys: string[]): Cond => (keys.length ? Prisma.sql`${col} IN (${Prisma.join(keys)})` : Prisma.sql`FALSE`);

// ── Sana oraliqlari (biznes vaqti UTC+5) ──
const bizShift = (now: number) => new Date(now + BIZ_TZ_HOURS * 3600_000);
const fromBizUtc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - BIZ_TZ_HOURS * 3600_000);

export const DATE_PRESETS = ['all', 'today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'quarter', 'this_year'];

/** date_preset -> [from, to) (UTC Date). 'all' / noma'lum -> bo'sh. */
export function presetRange(preset?: string, now = Date.now()): { from?: Date; to?: Date } {
  const s = bizShift(now);
  const y = s.getUTCFullYear(), m = s.getUTCMonth(), d = s.getUTCDate();
  const dow = (s.getUTCDay() + 6) % 7; // dushanba = 0
  switch (preset) {
    case 'today': return { from: fromBizUtc(y, m, d), to: fromBizUtc(y, m, d + 1) };
    case 'yesterday': return { from: fromBizUtc(y, m, d - 1), to: fromBizUtc(y, m, d) };
    case 'this_week': return { from: fromBizUtc(y, m, d - dow), to: fromBizUtc(y, m, d - dow + 7) };
    case 'last_week': return { from: fromBizUtc(y, m, d - dow - 7), to: fromBizUtc(y, m, d - dow) };
    case 'this_month': return { from: fromBizUtc(y, m, 1), to: fromBizUtc(y, m + 1, 1) };
    case 'last_month': return { from: fromBizUtc(y, m - 1, 1), to: fromBizUtc(y, m, 1) };
    case 'quarter': { const qm = Math.floor(m / 3) * 3; return { from: fromBizUtc(y, qm, 1), to: fromBizUtc(y, qm + 3, 1) }; }
    case 'this_year': return { from: fromBizUtc(y, 0, 1), to: fromBizUtc(y + 1, 0, 1) };
    default: return {};
  }
}

/** Foydalanuvchi bergan sana (YYYY-MM-DD yoki ISO) -> UTC Date. Sana-only bo'lsa biznes kuni boshi. */
function parseBizDate(v: string | undefined, endOfDay: boolean): Date | undefined {
  if (!v) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (m) return fromBizUtc(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (endOfDay ? 1 : 0));
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : endOfDay ? new Date(d.getTime() + 1) : d;
}

/** Filtrdagi sana bloki (datePreset yoki from/to) -> [from, to). */
export function dateRangeOf(q: Pick<LeadFilter, 'datePreset' | 'from' | 'to'>, now = Date.now()): { from?: Date; to?: Date } {
  if (q.from || q.to) return { from: parseBizDate(String(q.from || ''), false), to: parseBizDate(String(q.to || ''), true) };
  return presetRange(q.datePreset, now);
}

/** Biznes sanasi YYYY-MM-DD (maxsus sana maydonlari matn sifatida solishtiriladi). */
const bizDateStr = (d: Date) => bizShift(d.getTime()).toISOString().slice(0, 10);

const SAFE_KEY = /^[A-Za-z0-9_.\-]{1,80}$/;
const CJ = Prisma.raw(`(l."customJson"::jsonb)`);

/** `cf` / `utm` kabi obyekt parametrlari: JSON matn, obyekt yoki `name[key]` / `name[key][from]` yassi kalitlar. */
export function parseObjParam(q: Record<string, unknown>, name: string): Record<string, any> {
  const out: Record<string, any> = {};
  const v = q[name];
  if (typeof v === 'string' && v.trim().startsWith('{')) { try { Object.assign(out, JSON.parse(v)); } catch { /* e'tiborsiz */ } }
  else if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, v);
  const re = new RegExp(`^${name}\\[([^\\]]+)\\](?:\\[(from|to|preset)\\])?$`);
  for (const [k, val] of Object.entries(q)) {
    const m = re.exec(k);
    if (!m) continue;
    if (m[2]) out[m[1]] = { ...(out[m[1]] && typeof out[m[1]] === 'object' && !Array.isArray(out[m[1]]) ? out[m[1]] : {}), [m[2]]: val };
    else out[m[1]] = val;
  }
  return out;
}

const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter((x) => x !== '') : toList(v));

/** Maxsus maydon sharti (turiga qarab). */
function customFieldCond(key: string, val: any, type: string, now: number): Cond | null {
  if (!SAFE_KEY.test(key) || val == null || val === '') return null;
  const txt = Prisma.sql`(${CJ} ->> ${key}::text)`;
  const node = Prisma.sql`(${CJ} -> ${key}::text)`;
  const isEmpty = Prisma.sql`(${node} IS NULL OR ${node} = 'null'::jsonb OR ${node} = '""'::jsonb OR ${node} = '[]'::jsonb)`;
  const isNum = (t: Cond) => Prisma.sql`${t} ~ '^-?[0-9]+(\\.[0-9]+)?$'`;
  switch (type) {
    case 'select': case 'multiselect': {
      const vals = asList(val);
      if (!vals.length) return null;
      const parts: Cond[] = [];
      const real = vals.filter((x) => x !== 'empty');
      if (vals.includes('empty')) parts.push(isEmpty);
      for (const x of real) {
        parts.push(Prisma.sql`(CASE WHEN jsonb_typeof(${node}) = 'array' THEN jsonb_exists(${node}, ${x}::text) ELSE (${txt} = ${x}::text OR ${x}::text = ANY(string_to_array(${txt}, ', '))) END)`);
      }
      return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
    }
    case 'number': {
      const o = typeof val === 'object' ? val : {};
      const c: Cond[] = [];
      if (o.from !== undefined && o.from !== '' && Number.isFinite(Number(o.from))) c.push(Prisma.sql`(CASE WHEN ${isNum(txt)} THEN ${txt}::numeric END) >= ${Number(o.from)}`);
      if (o.to !== undefined && o.to !== '' && Number.isFinite(Number(o.to))) c.push(Prisma.sql`(CASE WHEN ${isNum(txt)} THEN ${txt}::numeric END) <= ${Number(o.to)}`);
      return c.length ? Prisma.sql`(${Prisma.join(c, ' AND ')})` : null;
    }
    case 'date': {
      if (val === 'empty') return isEmpty;
      const o = typeof val === 'object' ? val : { preset: val };
      const r = dateRangeOf({ datePreset: o.preset, from: o.from, to: o.to }, now);
      const c: Cond[] = [];
      if (r.from) c.push(Prisma.sql`left(${txt}, 10) >= ${bizDateStr(r.from)}`);
      if (r.to) c.push(Prisma.sql`left(${txt}, 10) < ${bizDateStr(r.to)}`);
      if (!c.length) return null;
      c.push(Prisma.sql`${txt} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`);
      return Prisma.sql`(${Prisma.join(c, ' AND ')})`;
    }
    case 'checkbox': {
      const yes = Prisma.sql`(${txt} IN ('true', '1', 'on', 'yes', 'ha', 'Ha'))`;
      const s = String(val).toLowerCase();
      if (['yes', '1', 'true', 'ha', 'on'].includes(s)) return yes;
      if (['no', '0', 'false', "yo'q", 'off'].includes(s)) return Prisma.sql`(${txt} IS NULL OR NOT ${yes})`;
      return null;
    }
    default: {
      const s = String(val).trim();
      if (s === 'empty') return isEmpty;
      return s ? Prisma.sql`${txt} ILIKE ${like(s)}` : null;
    }
  }
}

const UNSORTED_CATEGORY: Record<string, (l: string) => Cond> = {
  phone: (s) => Prisma.sql`${Prisma.raw(s)} ~* '(qo.ng.iroq|telefon|phone|call|звон|тел)'`,
  chat: (s) => Prisma.sql`${Prisma.raw(s)} ~* '(telegram|instagram|chat|whatsapp|messenger|чат)'`,
  form: (s) => Prisma.sql`(l."formId" IS NOT NULL OR ${Prisma.raw(s)} ~* '(forma|form|sayt|web|facebook|meta|google|lead ads|форма)')`,
  import: (s) => Prisma.sql`${Prisma.raw(s)} ~* '(import|импорт)'`,
};

/** Bitimlar WHERE shartlari (jadval alias'i: l). */
export function leadConds(q: LeadFilter, ctx: LeadCtx): Cond[] {
  const c: Cond[] = [];
  const now = ctx.now ?? Date.now();
  const todayStart = bizDayStart(0, now);
  const openTask = (extra: Cond) => Prisma.sql`EXISTS (SELECT 1 FROM lead_tasks t WHERE t."leadId" = l.id AND t.done = FALSE AND ${extra})`;
  const openKeys = keysOf(ctx, 'open');
  const isOpen = (): Cond => Prisma.sql`(${inList(Prisma.sql`l.stage`, openKeys)} AND l.unsorted = FALSE)`;
  const attentionYes = (): Cond => Prisma.sql`(${isOpen()} AND (${openTask(Prisma.sql`t."dueDate" < ${todayStart}`)} OR coalesce(l."lastActivityAt", l."updatedAt", l."createdAt") < ${new Date(now - 7 * DAY)}))`;

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
    case 'attention': c.push(attentionYes()); break;
    default: break;
  }

  // Vazifa holati (kartochkadagi bilan bir xil: eng erta ochiq vazifa bo'yicha)
  if (q.task) {
    const tomorrow = bizDayStart(-1, now);
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

  // amoCRM "Задачи": today | tomorrow | week | month | quarter | no_tasks | failed_tasks (bir nechta bo'lsa — YOKI)
  const tasks = asList(q.tasks);
  if (tasks.length) {
    const parts: Cond[] = [];
    for (const k of tasks) {
      if (k === 'no_tasks') parts.push(Prisma.sql`NOT ${openTask(Prisma.sql`TRUE`)}`);
      else if (k === 'failed_tasks') parts.push(openTask(Prisma.sql`t."dueDate" < ${todayStart}`));
      else {
        const r = k === 'tomorrow'
          ? { from: bizDayStart(-1, now), to: bizDayStart(-2, now) }
          : presetRange(({ today: 'today', week: 'this_week', month: 'this_month', quarter: 'quarter' } as Record<string, string>)[k], now);
        if (r.from && r.to) parts.push(openTask(Prisma.sql`t."dueDate" >= ${r.from} AND t."dueDate" < ${r.to}`));
      }
    }
    if (parts.length) c.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
  }

  // Sana bloki: dateField (created|closed|updated|maxsus sana kaliti) + datePreset / from-to. Eski `period` — faqat yaratilgan sana.
  const legacy = periodStart(q.period);
  const range = q.from || q.to || (q.datePreset && q.datePreset !== 'all') ? dateRangeOf(q, now) : legacy;
  const df = q.dateField || 'created';
  if (range.from || range.to) {
    if (df === 'created' || df === 'closed' || df === 'updated') {
      const col = df === 'created' ? Prisma.sql`l."createdAt"` : df === 'updated' ? Prisma.sql`l."updatedAt"` : Prisma.sql`coalesce(l."wonAt", l."lostAt")`;
      if (range.from) c.push(Prisma.sql`${col} >= ${range.from}`);
      if (range.to) c.push(Prisma.sql`${col} < ${range.to}`);
    } else if (SAFE_KEY.test(df)) {
      const txt = Prisma.sql`(${CJ} ->> ${df}::text)`;
      c.push(Prisma.sql`${txt} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'`);
      if (range.from) c.push(Prisma.sql`left(${txt}, 10) >= ${bizDateStr(range.from)}`);
      if (range.to) c.push(Prisma.sql`left(${txt}, 10) < ${bizDateStr(range.to)}`);
    }
  }

  if (q.assigneeId) c.push(q.assigneeId === 'none' ? Prisma.sql`l."assigneeId" IS NULL` : Prisma.sql`l."assigneeId" = ${q.assigneeId}`);
  const asg = asList(q.assigneeIds);
  if (asg.length) {
    const real = asg.filter((x) => x !== 'none');
    const parts: Cond[] = [];
    if (real.length) parts.push(Prisma.sql`l."assigneeId" IN (${Prisma.join(real)})`);
    if (asg.includes('none')) parts.push(Prisma.sql`l."assigneeId" IS NULL`);
    c.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
  }
  const crt = asList(q.createdByIds);
  if (crt.length) c.push(Prisma.sql`l."createdById" IN (${Prisma.join(crt)})`);
  // "Кем изменена": bitimning oxirgi faoliyatini (Activity) bajargan foydalanuvchi
  const upd = asList(q.updatedByIds);
  if (upd.length) c.push(Prisma.sql`(SELECT a."actorId" FROM crm_activities a WHERE a."leadId" = l.id ORDER BY a."createdAt" DESC, a.id DESC LIMIT 1) IN (${Prisma.join(upd)})`);

  const vf = q.budgetFrom || q.minValue, vt = q.budgetTo || q.maxValue;
  if (vf && Number.isFinite(Number(vf))) c.push(Prisma.sql`l.value >= ${Math.floor(Number(vf))}`);
  if (vt && Number.isFinite(Number(vt))) c.push(Prisma.sql`l.value <= ${Math.floor(Number(vt))}`);
  for (const tg of [...toList(q.tags), ...toList(q.tag)]) c.push(Prisma.sql`l."tagsJson" LIKE ${like(JSON.stringify(tg))}`);

  if (q.pipelineId !== undefined && q.pipelineId !== null && q.pipelineId !== '__any') {
    c.push(q.pipelineId === '' || q.pipelineId === 'main' ? Prisma.sql`l."pipelineId" IS NULL` : Prisma.sql`l."pipelineId" = ${q.pipelineId}`);
  }
  if (q.stage) c.push(Prisma.sql`l.stage = ${q.stage}`);

  // Statuslar: `pipelineId:stageKey` juftliklari, `unsorted`, `won`/`lost` (shu turdagi barcha bosqichlar); tanlanganlar — YOKI
  const stg = asList(q.stages);
  if (stg.length) {
    const parts: Cond[] = [];
    const plain: string[] = [];
    for (const tk of stg) {
      if (tk === 'unsorted') { parts.push(Prisma.sql`l.unsorted = TRUE`); continue; }
      if (tk === 'won' || tk === 'lost' || tk === 'open') { parts.push(Prisma.sql`(l.unsorted = FALSE AND ${inList(Prisma.sql`l.stage`, keysOf(ctx, tk))})`); continue; }
      const i = tk.lastIndexOf(':');
      if (i < 0) { plain.push(tk); continue; }
      const pid = tk.slice(0, i), key = tk.slice(i + 1);
      parts.push(Prisma.sql`(l.unsorted = FALSE AND l.stage = ${key} AND ${pid === '' || pid === 'main' ? Prisma.sql`l."pipelineId" IS NULL` : Prisma.sql`l."pipelineId" = ${pid}`})`);
    }
    if (plain.length) parts.push(Prisma.sql`(l.unsorted = FALSE AND l.stage IN (${Prisma.join(plain)}))`);
    c.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
  }

  const lr = asList(q.lostReasons);
  if (lr.length) {
    const real = lr.filter((x) => x !== 'none');
    const parts: Cond[] = [];
    if (real.length) parts.push(Prisma.sql`l."lostReason" IN (${Prisma.join(real)})`);
    if (lr.includes('none')) parts.push(Prisma.sql`(${inList(Prisma.sql`l.stage`, keysOf(ctx, 'lost'))} AND coalesce(l."lostReason", '') = '')`);
    c.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
  }

  const uc = asList(q.unsortedCategory).filter((k) => UNSORTED_CATEGORY[k]);
  if (uc.length) {
    c.push(Prisma.sql`l.unsorted = TRUE`);
    c.push(Prisma.sql`(${Prisma.join(uc.map((k) => UNSORTED_CATEGORY[k](`coalesce(l.source, '')`)), ' OR ')})`);
  }

  if (q.source) c.push(Prisma.sql`l.source = ${q.source}`);
  const srcs = asList(q.sources);
  if (srcs.length) {
    const real = srcs.filter((x) => x !== 'none' && x !== 'empty');
    const parts: Cond[] = [];
    if (real.length) parts.push(Prisma.sql`l.source IN (${Prisma.join(real)})`);
    if (real.length !== srcs.length) parts.push(Prisma.sql`coalesce(l.source, '') = ''`);
    c.push(Prisma.sql`(${Prisma.join(parts, ' OR ')})`);
  }

  if (q.attention === 'yes') c.push(attentionYes());
  else if (q.attention === 'no') c.push(Prisma.sql`NOT ${attentionYes()}`);

  // Maxsus maydonlar va UTM (customJson)
  for (const [key, val] of Object.entries(parseObjParam(q, 'cf'))) {
    const cc = customFieldCond(key, val, ctx.fields?.get(key) || 'text', now);
    if (cc) c.push(cc);
  }
  for (const [key, val] of Object.entries(parseObjParam(q, 'utm'))) {
    if (!SAFE_KEY.test(key) || val == null || String(val).trim() === '') continue;
    c.push(Prisma.sql`(${CJ} ->> ${key}::text) ILIKE ${like(String(val).trim())}`);
  }

  if (q.hot === 'true') c.push(Prisma.sql`l.hot = TRUE`);
  if (q.contactId) c.push(Prisma.sql`l."contactId" = ${q.contactId}`);
  if (q.companyId) {
    c.push(Prisma.sql`(l."companyId" = ${q.companyId} OR l."contactId" IN (SELECT id FROM crm_contacts WHERE "companyId" = ${q.companyId}))`);
  }
  if (q.name?.trim()) c.push(Prisma.sql`l.name ILIKE ${like(q.name.trim())}`);

  // Kontakt / kompaniya xususiyatlari (bitimning asosiy kontakti va kompaniyasi bo'yicha)
  const contactExists = (cond: Cond) => Prisma.sql`EXISTS (SELECT 1 FROM crm_contacts k WHERE k.id = l."contactId" AND ${cond})`;
  const cn = String(q.contactName || '').trim();
  if (cn) c.push(contactExists(Prisma.sql`k.name ILIKE ${like(cn)}`));
  const cp = String(q.contactPhone || '').trim();
  if (cp) {
    const pd = digitsOf(cp);
    c.push(pd
      ? Prisma.sql`(l."phoneDigits" LIKE ${like(pd)} OR ${contactExists(Prisma.sql`k."phoneDigits" LIKE ${like(pd)}`)})`
      : Prisma.sql`(l.phone ILIKE ${like(cp)} OR ${contactExists(Prisma.sql`k.phone ILIKE ${like(cp)}`)})`);
  }
  const ce = String(q.contactEmail || '').trim();
  if (ce) c.push(Prisma.sql`(l.email ILIKE ${like(ce)} OR ${contactExists(Prisma.sql`k.email ILIKE ${like(ce)}`)})`);
  const cpos = String(q.contactPosition || '').trim();
  if (cpos) c.push(contactExists(Prisma.sql`k.position ILIKE ${like(cpos)}`));
  const co = String(q.companyName || '').trim();
  if (co) {
    c.push(Prisma.sql`(l.company ILIKE ${like(co)}
      OR EXISTS (SELECT 1 FROM crm_companies cc WHERE cc.name ILIKE ${like(co)} AND (cc.id = l."companyId" OR cc.id = (SELECT k."companyId" FROM crm_contacts k WHERE k.id = l."contactId"))))`);
  }

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
  const by = (expr: Prisma.Sql, join = none) => ({ join, order: Prisma.sql`ORDER BY ${expr} ${d} NULLS LAST, l.id ASC` });
  switch (sort) {
    case 'name': case 'n': return { join: none, order: Prisma.sql`ORDER BY l.name ${d}, l.id ASC` };
    case 'createdAt': return { join: none, order: Prisma.sql`ORDER BY l."createdAt" ${d}, l.id ASC` };
    case 'updatedAt': return { join: none, order: Prisma.sql`ORDER BY l."updatedAt" ${d}, l.id ASC` };
    case 'closedAt': return by(Prisma.sql`coalesce(l."wonAt", l."lostAt")`);
    case 'value': case 'budget': return { join: none, order: Prisma.sql`ORDER BY l.value ${d}, l.id ASC` };
    case 'last_message': return by(Prisma.sql`(SELECT max(m."createdAt") FROM crm_messages m WHERE m."leadId" = l.id)`);
    case 'last_event': return by(Prisma.sql`coalesce((SELECT max(a."createdAt") FROM crm_activities a WHERE a."leadId" = l.id), l."updatedAt")`);
    case 'source': return by(Prisma.sql`lower(l.source)`);
    case 'company': return by(Prisma.sql`lower(coalesce(l.company, (SELECT cc.name FROM crm_companies cc WHERE cc.id = l."companyId")))`);
    case 'email': return by(Prisma.sql`lower(l.email)`);
    case 'phone': return by(Prisma.sql`l."phoneDigits"`);
    case 'tags': return by(Prisma.sql`l."tagsJson"`);
    case 'stage':
      return { join: Prisma.sql`LEFT JOIN crm_stages so ON so.key = l.stage`, order: Prisma.sql`ORDER BY so."order" ${d} NULLS LAST, l.stage ${d}, l.id ASC` };
    case 'assignee':
      return { join: Prisma.sql`LEFT JOIN "User" uo ON uo.id = l."assigneeId"`, order: Prisma.sql`ORDER BY lower(uo.name) ${d} NULLS LAST, l.id ASC` };
    case 'contact':
      return { join: Prisma.sql`LEFT JOIN crm_contacts co ON co.id = l."contactId"`, order: Prisma.sql`ORDER BY lower(co.name) ${d} NULLS LAST, l.id ASC` };
    default:
      if (sort && sort.startsWith('cf:') && SAFE_KEY.test(sort.slice(3))) return by(Prisma.sql`lower(${CJ} ->> ${sort.slice(3)}::text)`);
      return { join: none, order: Prisma.sql`ORDER BY l."updatedAt" DESC, l.id ASC` };
  }
}

/** Voronka ustunlari: sort berilmasa qo'lda tartib (queue), aks holda leadOrder. */
export function columnOrder(sort?: string, dir?: string): { join: Prisma.Sql; order: Prisma.Sql; manual: boolean } {
  if (!sort || sort === 'queue') return { join: Prisma.sql``, order: Prisma.sql`ORDER BY l.queue ASC, l.id ASC`, manual: true };
  return { ...leadOrder(sort, dir), manual: false };
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
