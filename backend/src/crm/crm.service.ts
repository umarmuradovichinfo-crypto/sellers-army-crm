import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { colorFromString } from '../common/utils/color';
import { initialsOf } from '../common/utils/initials';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { and, columnOrder, Cond, LeadCtx, LeadFilter, leadConds, leadOrder, parsePaging } from './list-query';
import { ActivityService } from './activity.service';
import { AutomationService } from './automation.service';
import { NotificationService } from './notification.service';
import { assertNewTagsAllowed } from './tags-lock';
import {
  AddNoteDto,
  CreateLeadDto,
  CreateLeadTaskDto,
  CreateStageDto,
  UpdateLeadDto,
  UpdateLeadTaskDto,
  UpdateStageDto,
} from './dto/crm.dto';

type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  companyId: string | null;
  contactId: string | null;
  source: string | null;
  value: number;
  pipelineId: string | null;
  stage: string;
  queue: number;
  assigneeId: string | null;
  tagsJson: string;
  customJson: string;
  itemsJson: string;
  unsorted: boolean;
  formId: string | null;
  hot: boolean;
  nextTask: string | null;
  nextTaskDate: Date | null;
  notesJson: string;
  lostReason: string | null;
  wonAt: Date | null;
  lostAt: Date | null;
  lastActivityAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function parse<T>(s: string | null, fb: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fb; }
}

function digits(p?: string | null): string {
  return (p || '').replace(/\D/g, '');
}

function fmtSum(v: number): string {
  v = Number(v) || 0;
  if (v >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + ' mlrd';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' mln';
  if (v >= 1_000) return Math.round(v / 1_000) + ' ming';
  return String(v);
}
// Voqealar jurnali uchun aniq summa (amoCRM: '7 501 000'), yaxlitlamasdan
function fmtExact(v: number): string {
  return String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new BadRequestException({ error: 'BAD_DATE', message: "Sana noto'g'ri" });
  return d;
}

function slugify(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'bosqich';
}

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly automation: AutomationService,
    private readonly notif: NotificationService,
  ) {}

  private async userMap(ids: (string | null)[]) {
    const real = [...new Set(ids.filter(Boolean) as string[])];
    if (!real.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { id: { in: real } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private card(l: LeadRow, kind: string, names: Map<string, string>) {
    const aName = l.assigneeId ? names.get(l.assigneeId) || null : null;
    return {
      id: l.id,
      n: l.name,
      tag: l.source || '—',
      sum: fmtSum(l.value),
      value: l.value,
      ini: aName ? initialsOf(aName) : initialsOf(l.name),
      c: colorFromString(l.assigneeId || l.id),
      task: l.nextTask || undefined,
      hot: l.hot || undefined,
      won: kind === 'won' || undefined,
      lost: kind === 'lost' || undefined,
      // raw
      phone: l.phone,
      email: l.email,
      company: l.company,
      companyId: l.companyId,
      source: l.source,
      pipelineId: l.pipelineId,
      assigneeId: l.assigneeId,
      assigneeName: aName,
      tags: parse<string[]>(l.tagsJson, []),
      custom: parse<Record<string, unknown>>(l.customJson, {}),
      items: parse<unknown[]>(l.itemsJson, []),
      unsorted: l.unsorted || undefined,
      stage: l.stage,
      lostReason: l.lostReason,
      nextTask: l.nextTask,
      nextTaskDate: l.nextTaskDate ? l.nextTaskDate.toISOString() : null,
      createdAt: l.createdAt.toISOString(),
    };
  }

  // ── Pipeline (voronka) ko'rinishi ──
  /** Kartochkalarni boyitish: mas'ul nomi, kontakt nomi, eng yaqin ochiq vazifa holati. */
  private async buildCards(rows: LeadRow[], kindOf: (stage: string) => string) {
    const names = await this.userMap(rows.map((l) => l.assigneeId));
    const ids = rows.map((l) => l.id);
    const openTasks = ids.length
      ? await this.prisma.leadTask.findMany({ where: { done: false, leadId: { in: ids } }, orderBy: { dueDate: 'asc' } })
      : [];
    const nextTaskByLead = new Map<string, { title: string; dueDate: Date | null }>();
    for (const t of openTasks) if (!nextTaskByLead.has(t.leadId)) nextTaskByLead.set(t.leadId, { title: t.title, dueDate: t.dueDate });

    // Kartochkadagi asosiy kontakt ismi (amoCRM: ko'k qator = kontakt, ostida lid nomi)
    const contactIds = [...new Set(rows.map((l) => l.contactId).filter(Boolean))] as string[];
    const contacts = contactIds.length
      ? await this.prisma.contact.findMany({ where: { id: { in: contactIds } }, select: { id: true, name: true } })
      : [];
    const contactNames = new Map(contacts.map((c) => [c.id, c.name]));

    // amoCRM qoidasi: vazifasiz yoki muddati o'tgan lid — qizil (e'tibor kerak),
    // bugungi vazifa — yashil, kelajakdagi — neytral sana. Biznes vaqti UTC+5.
    const bizDate = (d: Date) => new Date(d.getTime() + 5 * 3600_000).toISOString().slice(0, 10);
    const today = bizDate(new Date());
    const tomorrow = bizDate(new Date(Date.now() + 86_400_000));
    const taskStatusOf = (nt?: { title: string; dueDate: Date | null }) => {
      if (!nt) return { kind: 'none', label: "Vazifa yo'q", title: null as string | null };
      if (!nt.dueDate) return { kind: 'future', label: 'Muddatsiz', title: nt.title };
      const ds = bizDate(nt.dueDate);
      if (ds < today) return { kind: 'overdue', label: "Muddati o'tgan", title: nt.title };
      if (ds === today) return { kind: 'today', label: 'Bugun', title: nt.title };
      if (ds === tomorrow) return { kind: 'future', label: 'Ertaga', title: nt.title };
      return { kind: 'future', label: ds.slice(8, 10) + '.' + ds.slice(5, 7), title: nt.title };
    };
    const fmtTaskWhen = (d: Date | null) => {
      if (!d) return '';
      const ds = bizDate(d);
      if (ds < today) return "muddati o'tgan";
      if (ds === today) return 'bugun';
      return ds.slice(5).replace('-', '.');
    };

    return rows.map((l) => {
      const nt = nextTaskByLead.get(l.id);
      const c = {
        ...this.card(l, kindOf(l.stage), names),
        contactName: l.contactId ? contactNames.get(l.contactId) || null : null,
        taskStatus: taskStatusOf(nt),
      };
      if (!nt) return c;
      const w = fmtTaskWhen(nt.dueDate);
      return { ...c, task: w ? `${nt.title} · ${w}` : nt.title, taskOpen: true };
    });
  }

  private async leadCtx(userId?: string): Promise<LeadCtx> {
    const [stages, fields] = await Promise.all([
      this.prisma.crmStage.findMany({ select: { key: true, kind: true } }),
      this.prisma.crmField.findMany({ where: { entity: 'lead' }, select: { key: true, type: true } }),
    ]);
    return { userId, kinds: new Map(stages.map((s) => [s.key, s.kind])), fields: new Map(fields.map((f) => [f.key, f.type])) };
  }

  /** Tartiblangan ID'lar (raw SQL) bo'yicha to'liq qatorlarni shu tartibda qaytaradi. */
  private async rowsByIds(ids: string[]): Promise<LeadRow[]> {
    if (!ids.length) return [];
    const rows = (await this.prisma.lead.findMany({ where: { id: { in: ids } } })) as LeadRow[];
    const m = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => m.get(id)).filter(Boolean) as LeadRow[];
  }

  /**
   * Voronka. `limit` berilmasa — eski xulq (barcha kartalar); `limit=N` — har bosqichdan dastlabki N ta karta
   * + bosqich bo'yicha jami son/summa (aggregate); `limit=0` — faqat bosqichlar va jamilar.
   * Filtr parametrlari (preset, search, period, assigneeId, budgetFrom/To, tags, task, name) ro'yxatdagi bilan bir xil.
   */
  async getPipeline(pipelineId?: string, q: LeadFilter & { limit?: string; sort?: string; dir?: string } = {}, userId?: string) {
    const pipelines = await this.prisma.crmPipeline.findMany({ orderBy: { order: 'asc' } });
    // Tanlangan voronka: berilgan id, aks holda standart (null) yoki birinchi
    const activePid = pipelineId || null;
    const allStages = await this.prisma.crmStage.findMany({ orderBy: { order: 'asc' } });
    const stages = allStages.filter((s) => (s.pipelineId || null) === activePid);
    const stageKeys = stages.map((s) => s.key);
    const ctx: LeadCtx = { ...(await this.leadCtx(userId)), kinds: new Map(allStages.map((s) => [s.key, s.kind])) };
    const kindOf = (k: string) => ctx.kinds.get(k) || 'open';

    const lim = q.limit !== undefined && q.limit !== '' && Number.isFinite(Number(q.limit)) ? Math.max(0, Math.min(Math.floor(Number(q.limit)), 200)) : null;
    const base: Cond[] = [Prisma.sql`l.unsorted = FALSE`, activePid ? Prisma.sql`l."pipelineId" = ${activePid}` : Prisma.sql`l."pipelineId" IS NULL`];
    const scope = [...base]; // bosqich bo'yicha so'rovlar uchun (stage = X alohida beriladi — indeksdan to'g'ri foydalanish uchun)
    if (stageKeys.length) base.push(Prisma.sql`l.stage IN (${Prisma.join(stageKeys)})`); else base.push(Prisma.sql`FALSE`);
    // pipelineId/stage/unsorted bu yerda belgilangan — foydalanuvchi filtri ularni qayta yozmasin
    const { pipelineId: _p, stage: _s, unsorted: _u, sort: _so, dir: _d, limit: _l, ...userFilter } = q as any;
    const fconds = leadConds(userFilter, ctx);
    const colOrder = columnOrder(q.sort, q.dir);
    const hasFilter = fconds.length > 0;

    const aggOf = async (extra: Cond[]) => {
      const rows = await this.prisma.$queryRaw<{ stage: string; c: number; s: number }[]>(
        Prisma.sql`SELECT l.stage, count(*)::int AS c, coalesce(sum(l.value), 0)::float8 AS s FROM leads l WHERE ${and([...base, ...extra])} GROUP BY l.stage`,
      );
      return new Map(rows.map((r) => [r.stage, { c: Number(r.c), s: Number(r.s) }]));
    };
    const [aggAll, aggF] = await Promise.all([aggOf([]), hasFilter ? aggOf(fconds) : Promise.resolve(null)]);
    const agg = aggF || aggAll;

    const pageOf = async (stageKey: string) => {
      if (lim === 0) return { ids: [] as string[], more: false };
      const rows = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT l.id FROM leads l ${colOrder.join} WHERE ${and([...scope, ...fconds, Prisma.sql`l.stage = ${stageKey}`])} ${colOrder.order}${lim === null ? Prisma.empty : Prisma.sql` LIMIT ${lim + 1}`}`,
      );
      const more = lim !== null && rows.length > lim;
      return { ids: rows.slice(0, lim ?? rows.length).map((r) => r.id), more };
    };
    const pages = await Promise.all(stages.map((s) => pageOf(s.key)));
    const allRows = await this.rowsByIds(pages.flatMap((p) => p.ids));
    const cards = await this.buildCards(allRows, kindOf);
    const cardById = new Map(cards.map((c) => [c.id, c]));
    const rowById = new Map(allRows.map((r) => [r.id, r]));

    const stagesOut = stages.map((s, i) => {
      const a = agg.get(s.key) || { c: 0, s: 0 };
      const leads = pages[i].ids.map((id) => cardById.get(id)).filter(Boolean) as any[];
      const lastRow = pages[i].ids.length ? rowById.get(pages[i].ids[pages[i].ids.length - 1]) : undefined;
      return {
        id: s.key,
        name: s.name,
        color: s.color,
        kind: s.kind,
        isSystem: s.isSystem,
        hints: parse<Record<string, string>>(s.hintsJson, {}),
        sum: fmtSum(a.s),
        count: a.c,
        sumValue: a.s,
        nextCursor: pages[i].more && lastRow ? (colOrder.manual ? `${lastRow.queue}:${lastRow.id}` : `o:${pages[i].ids.length}`) : null,
        leads,
      };
    });

    const sumKind = (kind: string, field: 'c' | 's') =>
      stages.filter((s) => s.kind === kind).reduce((a, s) => a + (aggAll.get(s.key)?.[field] || 0), 0);
    const stats = [
      { lab: 'Faol lidlar', v: String(sumKind('open', 'c')) },
      { lab: 'Voronka summasi', v: fmtSum(sumKind('open', 's')) },
      { lab: 'Yopilgan (sotuv)', v: String(sumKind('won', 'c')) },
      { lab: 'Sotuv summasi', v: fmtSum(sumKind('won', 's')) },
    ];

    return { stages: stagesOut, stats, pipelines, pipelineId: activePid };
  }

  /** Voronka ustunining keyingi sahifasi: kursor `${queue}:${id}` (keyset, drag-drop'dan keyin ham barqaror). */
  async stageLeads(q: LeadFilter & { stage?: string; pipelineId?: string; cursor?: string; limit?: string; sort?: string; dir?: string }, userId?: string) {
    if (!q.stage) throw new BadRequestException({ error: 'NO_STAGE', message: 'stage majburiy' });
    const stage = await this.prisma.crmStage.findUnique({ where: { key: q.stage } });
    if (!stage) throw new NotFoundException({ error: 'BAD_STAGE', message: 'Bosqich topilmadi' });
    const ctx = await this.leadCtx(userId);
    const { pipelineId: _p, stage: _s, unsorted: _u, sort: _so, dir: _d, limit: _l, cursor: _c, ...userFilter } = q as any;
    const pid = stage.pipelineId || null;
    const colOrder = columnOrder(q.sort, q.dir);
    const conds: Cond[] = [
      Prisma.sql`l.unsorted = FALSE`, Prisma.sql`l.stage = ${stage.key}`,
      pid ? Prisma.sql`l."pipelineId" = ${pid}` : Prisma.sql`l."pipelineId" IS NULL`,
      ...leadConds(userFilter, ctx),
    ];
    const off = /^o:(\d+)$/.exec(q.cursor || '');
    const m = colOrder.manual ? /^(-?\d+):(.+)$/.exec(q.cursor || '') : null;
    if (m) conds.push(Prisma.sql`(l.queue, l.id) > (${Number(m[1])}, ${m[2]})`);
    const offset = !colOrder.manual && off ? Number(off[1]) : 0;
    const limit = Math.max(1, Math.min(Number(q.limit) || 50, 200));
    const ids = await this.prisma.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT l.id FROM leads l ${colOrder.join} WHERE ${and(conds)} ${colOrder.order} LIMIT ${limit + 1} OFFSET ${offset}`,
    );
    const more = ids.length > limit;
    const rows = await this.rowsByIds(ids.slice(0, limit).map((r) => r.id));
    const leads = await this.buildCards(rows, (k) => ctx.kinds.get(k) || 'open');
    const last = rows[rows.length - 1];
    return { leads, nextCursor: more && last ? (colOrder.manual ? `${last.queue}:${last.id}` : `o:${offset + limit}`) : null, stage: stage.key };
  }

  async listMembers() {
    const users = await this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
    return { members: users };
  }

  private ensureSuper(user?: AuthUser) {
    if (!user || user.role !== 'super_admin')
      throw new ForbiddenException({ error: 'FORBIDDEN', message: "Bosqichlarni faqat super admin boshqaradi" });
  }

  // ── Bosqichlar ──
  async listStages() {
    return { stages: await this.prisma.crmStage.findMany({ orderBy: { order: 'asc' } }) };
  }
  async createStage(dto: CreateStageDto & { pipelineId?: string }, user?: AuthUser) {
    this.ensureSuper(user);
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
    let key = slugify(name); let i = 1;
    while (await this.prisma.crmStage.findUnique({ where: { key } })) key = `${slugify(name)}-${i++}`;
    const agg = await this.prisma.crmStage.aggregate({ _max: { order: true } });
    const stage = await this.prisma.crmStage.create({
      data: { key, name, color: dto.color || '#3F77DD', kind: dto.kind || 'open', order: (agg._max.order ?? -1) + 1, pipelineId: dto.pipelineId || null },
    });
    return { stage };
  }
  async updateStage(key: string, dto: UpdateStageDto, user?: AuthUser) {
    this.ensureSuper(user);
    const st = await this.prisma.crmStage.findUnique({ where: { key } });
    if (!st) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Bosqich topilmadi' });
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const n = String(dto.name).trim();
      if (!n) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
      data.name = n.slice(0, 100);
    }
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.order !== undefined) data.order = dto.order;
    if (dto.hints !== undefined) {
      const h = dto.hints || {};
      const clean: Record<string, string> = {};
      for (const k of ['novice', 'experienced', 'master']) clean[k] = String((h as any)[k] ?? '').slice(0, 1000);
      data.hintsJson = JSON.stringify(clean);
    }
    const stage = await this.prisma.crmStage.update({ where: { key }, data });
    return { stage };
  }
  async deleteStage(key: string, user?: AuthUser) {
    this.ensureSuper(user);
    const st = await this.prisma.crmStage.findUnique({ where: { key } });
    if (!st) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Bosqich topilmadi' });
    if (st.isSystem) throw new BadRequestException({ error: 'SYSTEM', message: "Tizim bosqichini o'chirib bo'lmaydi" });
    // Shu voronkada shu turdagi oxirgi bosqichni o'chirib bo'lmaydi (voronka yutuq/yo'qotishsiz qolmasin)
    const siblings = await this.prisma.crmStage.findMany({ where: { pipelineId: st.pipelineId ?? null, key: { not: key } }, orderBy: { order: 'asc' } });
    if (!siblings.some((x) => x.kind === st.kind))
      throw new BadRequestException({ error: 'LAST_OF_KIND', message: "Voronkadagi bu turdagi oxirgi bosqichni o'chirib bo'lmaydi" });
    // Bitimlar shu voronkaning birinchi ochiq bosqichiga o'tadi (yo'q bo'lsa — asosiy voronkadagi 'new')
    const target = siblings.find((x) => x.kind === 'open');
    await this.prisma.$transaction([
      this.prisma.lead.updateMany({
        where: { stage: key },
        data: target ? { stage: target.key } : { stage: 'new', pipelineId: null },
      }),
      this.prisma.automation.deleteMany({ where: { stageKey: key } }),
      this.prisma.crmStage.delete({ where: { key } }),
    ]);
    return { success: true, movedTo: target?.key || 'new' };
  }

  // ── Lidlar ──
  private async nextQueue(stage: string) {
    const m = await this.prisma.lead.aggregate({ where: { stage }, _max: { queue: true } });
    return (m._max.queue ?? -1) + 1;
  }

  // Dublikat aniqlash (telefon oxirgi 9 raqam yoki email)
  async findDuplicates(phone?: string, email?: string, excludeId?: string) {
    const tail = digits(phone).slice(-9);
    const mail = (email || '').trim().toLowerCase();
    const or: Record<string, unknown>[] = [];
    if (tail.length >= 7) or.push({ phoneTail: tail }); // indekslangan (leads_phoneTail_idx)
    if (mail) or.push({ emailNorm: mail }); // indekslangan (leads_emailNorm_idx)
    if (!or.length) return { duplicates: [] };
    const duplicates = await this.prisma.lead.findMany({
      where: { OR: or, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true, name: true, phone: true, email: true, stage: true },
      take: 10,
    });
    return { duplicates };
  }

  private itemsValue(items: any[]): number {
    if (!Array.isArray(items)) return 0;
    return items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  }

  async createLead(dto: CreateLeadDto & { email?: string; pipelineId?: string; custom?: Record<string, unknown>; items?: any[] }, user?: AuthUser) {
    if (Array.isArray(dto.tags)) await assertNewTagsAllowed(this.prisma, dto.tags, user);
    const stage = dto.stage || 'new';
    const items = Array.isArray((dto as any).items) ? (dto as any).items : [];
    const value = items.length ? this.itemsValue(items) : (Number(dto.value) || 0);
    // amoCRM tez qo'shish: kontakt nomi berilsa — kontakt yaratib bitimga bog'lanadi
    let contactId = dto.contactId || null;
    if (!contactId && dto.contactName?.trim()) {
      const c = await this.prisma.contact.create({ data: { name: dto.contactName.trim(), phone: dto.phone || null, email: (dto as any).email || null, createdById: user?.id || null } });
      contactId = c.id;
    }
    const lead = (await this.prisma.lead.create({
      data: {
        name: dto.name,
        phone: dto.phone || null,
        email: (dto as any).email || null,
        company: dto.company || null,
        companyId: (dto as any).companyId || null,
        source: dto.source || null,
        value,
        itemsJson: JSON.stringify(items),
        stage,
        pipelineId: (dto as any).pipelineId || null,
        assigneeId: dto.assigneeId || null,
        tagsJson: JSON.stringify(Array.isArray(dto.tags) ? dto.tags : []),
        customJson: JSON.stringify((dto as any).custom || {}),
        hot: !!dto.hot,
        nextTask: dto.nextTask || null,
        nextTaskDate: toDate(dto.nextTaskDate),
        queue: await this.nextQueue(stage),
        createdById: user?.id || null,
        contactId,
      },
    })) as LeadRow;
    await this.activity.record(lead.id, 'created', { actorId: user?.id, actorName: user?.name, text: `Lid yaratildi: ${lead.name}` });
    if (lead.assigneeId) await this.notif.notify(lead.assigneeId, `Yangi lid biriktirildi: ${lead.name}`, { type: 'lead', link: `/leads/detail/${lead.id}` });
    await this.automation.run('lead_created', lead.id, user?.name);
    const fresh = (await this.prisma.lead.findUnique({ where: { id: lead.id } })) as LeadRow;
    const names = await this.userMap([fresh.assigneeId]);
    const st = await this.prisma.crmStage.findUnique({ where: { key: fresh.stage } });
    return { lead: this.card(fresh, st?.kind || 'open', names) };
  }

  async getLead(id: string) {
    const l = (await this.prisma.lead.findUnique({ where: { id } })) as LeadRow | null;
    if (!l) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    const names = await this.userMap([l.assigneeId]);
    const st = await this.prisma.crmStage.findUnique({ where: { key: l.stage } });
    const [activity, company, contact] = await Promise.all([
      this.activity.listForLead(id),
      l.companyId ? this.prisma.company.findUnique({ where: { id: l.companyId }, select: { id: true, name: true, phone: true, email: true, website: true } }) : Promise.resolve(null),
      l.contactId ? this.prisma.contact.findUnique({ where: { id: l.contactId }, select: { id: true, name: true, phone: true, email: true, position: true, companyId: true, customJson: true } }) : Promise.resolve(null),
    ]);
    // qo'shimcha kontaktlar (amoCRM: bitimga bir nechta kontakt), asosiysi birinchi
    const extra = await this.prisma.leadContact.findMany({
      where: { leadId: id }, orderBy: { createdAt: 'asc' },
      select: { contact: { select: { id: true, name: true, phone: true, email: true, position: true, companyId: true, customJson: true } } },
    });
    const all = [contact, ...extra.map((x) => x.contact)].filter((c): c is NonNullable<typeof contact> => !!c);
    // kontakt kartochkasidagi "Kompaniya" qatori uchun
    const coIds = [...new Set(all.map((c) => c.companyId).filter(Boolean))] as string[];
    const coNames = new Map((coIds.length ? await this.prisma.company.findMany({ where: { id: { in: coIds } }, select: { id: true, name: true } }) : []).map((c) => [c.id, c.name]));
    // kontakt eslatmalari bitim lentasida ham ko'rinadi (amoCRM: o'ngda kontakt nomi bilan)
    const contacts = all.map(({ customJson, ...c }) => {
      const notes = parse<any>(customJson, {})?.notes;
      return { ...c, companyName: c.companyId ? coNames.get(c.companyId) || null : null, main: c.id === l.contactId, notes: Array.isArray(notes) ? notes.slice(-50) : [] };
    });
    return {
      lead: {
        ...this.card(l, st?.kind || 'open', names),
        notes: parse<unknown[]>(l.notesJson, []),
        activity,
        companyName: company?.name || null,
        companyInfo: company,
        contactId: l.contactId || null,
        contact: contacts.find((c) => c.main) || null,
        contacts,
      },
    };
  }

  async updateLead(id: string, dto: UpdateLeadDto & { email?: string; pipelineId?: string; custom?: Record<string, unknown>; lostReason?: string }, user?: AuthUser) {
    const existing = (await this.prisma.lead.findUnique({ where: { id } })) as LeadRow | null;
    if (!existing) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    if (Array.isArray(dto.tags)) await assertNewTagsAllowed(this.prisma, dto.tags, user, parse<string[]>(existing.tagsJson, []));
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined && dto.name !== existing.name) { data.name = dto.name; }
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if ((dto as any).email !== undefined) data.email = (dto as any).email || null;
    if (dto.company !== undefined) data.company = dto.company || null;
    if ((dto as any).companyId !== undefined) data.companyId = (dto as any).companyId || null;
    if ((dto as any).contactId !== undefined) data.contactId = (dto as any).contactId || null;
    if (dto.source !== undefined && dto.source !== existing.source) { data.source = dto.source || null; }
    if (dto.value !== undefined && Number(dto.value) !== existing.value) { data.value = Number(dto.value) || 0; }
    if ((dto as any).items !== undefined) {
      const items = Array.isArray((dto as any).items) ? (dto as any).items : [];
      data.itemsJson = JSON.stringify(items);
      data.value = this.itemsValue(items); // pozitsiyalardan summa
    }
    if ((dto as any).pipelineId !== undefined) data.pipelineId = (dto as any).pipelineId || null;
    if (dto.tags !== undefined) data.tagsJson = JSON.stringify(Array.isArray(dto.tags) ? dto.tags : []);
    if ((dto as any).custom !== undefined) data.customJson = JSON.stringify((dto as any).custom || {});
    if (dto.hot !== undefined) data.hot = !!dto.hot;
    if (dto.nextTask !== undefined) data.nextTask = dto.nextTask || null;
    if (dto.nextTaskDate !== undefined) data.nextTaskDate = toDate(dto.nextTaskDate);
    if ((dto as any).lostReason !== undefined) data.lostReason = (dto as any).lostReason || null;

    let assigneeChanged = false;
    if (dto.assigneeId !== undefined && (dto.assigneeId || null) !== existing.assigneeId) {
      data.assigneeId = dto.assigneeId || null;
      assigneeChanged = true;
    }

    let stageChanged = false;
    if (dto.stage !== undefined && dto.stage !== existing.stage) {
      const tgKind = (await this.prisma.crmStage.findUnique({ where: { key: dto.stage }, select: { kind: true } }))?.kind;
      if (tgKind !== 'lost') await this.assertRequiredFields(existing, dto.stage, (dto as any).custom);
      data.stage = dto.stage;
      stageChanged = true;
      if ((dto as any).pipelineId === undefined) {
        const tg = await this.prisma.crmStage.findUnique({ where: { key: dto.stage } });
        if (tg) data.pipelineId = tg.pipelineId || null;
      }
      await this.applyStageClose(dto.stage, data, (dto as any).lostReason);
    }

    const l = (await this.prisma.lead.update({ where: { id }, data })) as LeadRow;

    // amoCRM: har bir o'zgargan maydon alohida voqea — "Для поля «X» установлено значение «Y»" (oldingi qiymat bilan)
    const fmtV = (v: unknown) => (v == null || v === '' ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Ha' : "Yo'q") : String(v));
    const fieldChanges: { field: string; label: string; from: string; to: string }[] = [];
    if (data.name !== undefined && existing.name !== l.name) fieldChanges.push({ field: 'name', label: 'Nomi', from: existing.name, to: l.name });
    if (dto.source !== undefined && (existing.source || '') !== (l.source || '')) fieldChanges.push({ field: 'source', label: 'Manba', from: existing.source || '', to: l.source || '' });
    if (data.value !== undefined && existing.value !== l.value) fieldChanges.push({ field: 'value', label: 'Byudjet', from: fmtExact(existing.value), to: fmtExact(l.value) });
    if ((dto as any).custom !== undefined) {
      const before = parse<Record<string, unknown>>(existing.customJson, {});
      const after = parse<Record<string, unknown>>(l.customJson, {});
      const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((k) => !k.startsWith('_') && fmtV(before[k]) !== fmtV(after[k]));
      if (keys.length) {
        const defs = await this.prisma.crmField.findMany({ where: { entity: 'lead', key: { in: keys } }, select: { key: true, label: true } });
        const lbl = new Map(defs.map((d) => [d.key, d.label]));
        for (const k of keys) fieldChanges.push({ field: k, label: lbl.get(k) || k, from: fmtV(before[k]), to: fmtV(after[k]) });
      }
    }
    for (const c of fieldChanges)
      await this.activity.record(id, 'field', { actorId: user?.id, actorName: user?.name, text: `«${c.label}»: ${c.to || '—'}`, data: c });
    if (dto.tags !== undefined) {
      const a = parse<string[]>(existing.tagsJson, []), b = parse<string[]>(l.tagsJson, []);
      if (a.join('|') !== b.join('|')) await this.activity.record(id, 'tag', { actorId: user?.id, actorName: user?.name, text: `Teglar: ${b.join(', ') || '—'}`, data: { field: 'tags', label: 'Teglar', from: a.join(', '), to: b.join(', ') } });
    }
    if (assigneeChanged) {
      const nm = await this.userMap([existing.assigneeId, l.assigneeId]);
      const from = existing.assigneeId ? nm.get(existing.assigneeId) || '' : '', to = l.assigneeId ? nm.get(l.assigneeId) || '' : '';
      await this.activity.record(id, 'assignee', { actorId: user?.id, actorName: user?.name, text: `Mas'ul: ${to || '—'}`, data: { field: 'assignee', label: "Mas'ul", from, to } });
      if (l.assigneeId) await this.notif.notify(l.assigneeId, `Sizga lid biriktirildi: ${l.name}`, { type: 'lead', link: `/leads/detail/${id}` });
    }
    if (stageChanged) {
      const st = await this.prisma.crmStage.findUnique({ where: { key: l.stage } });
      await this.recordStageActivity(id, l, st?.kind || 'open', user, existing.stage);
      await this.automation.fire('stage_enter', id, { actorName: user?.name });
    }
    if (assigneeChanged) await this.automation.fire('assignee_changed', id, { actorName: user?.name });

    const fresh = (await this.prisma.lead.findUnique({ where: { id } })) as LeadRow;
    const names = await this.userMap([fresh.assigneeId]);
    const st = await this.prisma.crmStage.findUnique({ where: { key: fresh.stage } });
    return { lead: { ...this.card(fresh, st?.kind || 'open', names), notes: parse<unknown[]>(fresh.notesJson, []) } };
  }

  /**
   * amoCRM "Обязательно": bitim maqsad bosqichga o'tkazilganda shu bosqich uchun majburiy maydonlar bo'sh bo'lsa — o'tkazilmaydi.
   * custom — yangi qiymatlar ham hisobga olinadi (bir so'rovda to'ldirib o'tkazish mumkin).
   */
  private async assertRequiredFields(lead: { customJson: string }, stageKey: string, customPatch?: Record<string, unknown>) {
    const fields = await this.prisma.crmField.findMany({ where: { entity: 'lead', active: true }, select: { key: true, label: true, requiredStagesJson: true } });
    const need = fields.filter((f) => parse<string[]>(f.requiredStagesJson, []).includes(stageKey));
    if (!need.length) return;
    const custom = { ...parse<Record<string, unknown>>(lead.customJson, {}), ...(customPatch || {}) };
    const empty = (v: unknown) => v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length) || v === false;
    const missing = need.filter((f) => empty(custom[f.key]));
    if (missing.length)
      throw new BadRequestException({ error: 'REQUIRED_FIELDS', message: `Bosqichga o'tish uchun majburiy maydonlarni to'ldiring: ${missing.map((f) => f.label).join(', ')}`, fields: missing.map((f) => f.key) });
  }

  // won/lost bosqichga o'tganda wonAt/lostAt belgilash
  private async applyStageClose(stageKey: string, data: Record<string, unknown>, lostReason?: string) {
    const st = await this.prisma.crmStage.findUnique({ where: { key: stageKey } });
    if (!st) return;
    if (st.kind === 'won') { data.wonAt = new Date(); data.lostAt = null; }
    else if (st.kind === 'lost') { data.lostAt = new Date(); data.wonAt = null; if (lostReason !== undefined) data.lostReason = lostReason || null; }
    else { data.wonAt = null; data.lostAt = null; }
  }

  private async recordStageActivity(id: string, lead: LeadRow, kind: string, user?: AuthUser, fromStage?: string) {
    const st = await this.prisma.crmStage.findUnique({ where: { key: lead.stage } });
    const stageName = st?.name || lead.stage;
    const prev = fromStage ? await this.prisma.crmStage.findUnique({ where: { key: fromStage }, select: { name: true } }) : null;
    // data.to — analitika (sotuv tahlili: bosqichga yetganlar va bosqichdagi vaqt) uchun bosqich kaliti; fromName/toName — voqealar ro'yxati
    const data = { to: lead.stage, from: fromStage || null, fromName: prev?.name || '', toName: stageName };
    if (kind === 'won') await this.activity.record(id, 'won', { actorId: user?.id, actorName: user?.name, text: `🏆 Sotuv yopildi: ${fmtSum(lead.value)} so'm`, data });
    else if (kind === 'lost') await this.activity.record(id, 'lost', { actorId: user?.id, actorName: user?.name, text: `Yo'qotildi${lead.lostReason ? ` — ${lead.lostReason}` : ''}`, data });
    else await this.activity.record(id, 'stage', { actorId: user?.id, actorName: user?.name, text: `Bosqich: ${stageName}`, data });
  }

  /** Bitimga kontakt biriktirish: asosiy kontakt bo'lmasa — asosiy bo'ladi, aks holda qo'shimcha. */
  async addLeadContact(id: string, dto: { contactId?: string; name?: string; phone?: string; email?: string }, user?: AuthUser) {
    const l = await this.prisma.lead.findUnique({ where: { id }, select: { id: true, contactId: true } });
    if (!l) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    let contactId = dto.contactId || null;
    if (contactId) {
      if (!(await this.prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Kontakt topilmadi' });
    } else {
      const name = String(dto.name || '').trim();
      if (!name) throw new BadRequestException({ error: 'BAD_REQUEST', message: 'Kontakt nomi kerak' });
      contactId = (await this.prisma.contact.create({ data: { name: name.slice(0, 200), phone: dto.phone || null, email: dto.email || null, createdById: user?.id || null } })).id;
    }
    if (l.contactId === contactId) return this.getLead(id);
    if (!l.contactId) await this.prisma.lead.update({ where: { id }, data: { contactId } });
    else await this.prisma.leadContact.upsert({ where: { leadId_contactId: { leadId: id, contactId } }, create: { leadId: id, contactId }, update: {} });
    const c = await this.prisma.contact.findUnique({ where: { id: contactId }, select: { name: true } });
    await this.activity.record(id, 'updated', { actorId: user?.id, actorName: user?.name, text: `Kontakt biriktirildi: ${c?.name || ''}` });
    return this.getLead(id);
  }

  /** Kontaktni bitimdan uzish. Asosiy uzilsa — birinchi qo'shimcha kontakt asosiy bo'ladi. */
  async removeLeadContact(id: string, contactId: string, user?: AuthUser) {
    const l = await this.prisma.lead.findUnique({ where: { id }, select: { id: true, contactId: true } });
    if (!l) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    if (l.contactId === contactId) {
      const next = await this.prisma.leadContact.findFirst({ where: { leadId: id }, orderBy: { createdAt: 'asc' } });
      await this.prisma.$transaction([
        this.prisma.lead.update({ where: { id }, data: { contactId: next?.contactId || null } }),
        ...(next ? [this.prisma.leadContact.delete({ where: { leadId_contactId: { leadId: id, contactId: next.contactId } } })] : []),
      ]);
    } else {
      await this.prisma.leadContact.deleteMany({ where: { leadId: id, contactId } });
    }
    const c = await this.prisma.contact.findUnique({ where: { id: contactId }, select: { name: true } });
    await this.activity.record(id, 'updated', { actorId: user?.id, actorName: user?.name, text: `Kontakt uzildi: ${c?.name || ''}` });
    return this.getLead(id);
  }

  /** Qo'shimcha kontaktni asosiy qilish (amoCRM: kontaktni birinchi o'ringa ko'chirish). */
  async setMainLeadContact(id: string, contactId: string) {
    const l = await this.prisma.lead.findUnique({ where: { id }, select: { contactId: true } });
    if (!l) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    if (l.contactId === contactId) return this.getLead(id);
    if (!(await this.prisma.leadContact.findUnique({ where: { leadId_contactId: { leadId: id, contactId } } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Kontakt bitimga biriktirilmagan' });
    await this.prisma.$transaction([
      this.prisma.leadContact.delete({ where: { leadId_contactId: { leadId: id, contactId } } }),
      ...(l.contactId ? [this.prisma.leadContact.create({ data: { leadId: id, contactId: l.contactId } })] : []),
      this.prisma.lead.update({ where: { id }, data: { contactId } }),
    ]);
    return this.getLead(id);
  }

  async deleteLead(id: string) {
    const l = await this.prisma.lead.findUnique({ where: { id } });
    if (!l) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    await this.prisma.activity.deleteMany({ where: { leadId: id } });
    await this.prisma.lead.delete({ where: { id } });
    void this.activity.hook('delete_lead', { leadId: id, name: l.name });
    return { success: true };
  }

  async moveLead(id: string, stageKey: string, position?: number, user?: AuthUser, lostReason?: string) {
    const target = await this.prisma.crmStage.findUnique({ where: { key: stageKey } });
    if (!target) throw new NotFoundException({ error: 'BAD_STAGE', message: "Noto'g'ri bosqich" });
    const before = await this.prisma.lead.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    const changed = before.stage !== stageKey;
    if (changed && target.kind !== 'lost') await this.assertRequiredFields(before, stageKey);

    await this.prisma.$transaction(async (tx) => {
      const closeData: Record<string, unknown> = { stage: stageKey, pipelineId: target.pipelineId || null };
      if (changed) {
        if (target.kind === 'won') { closeData.wonAt = new Date(); closeData.lostAt = null; }
        else if (target.kind === 'lost') { closeData.lostAt = new Date(); closeData.wonAt = null; if (lostReason !== undefined) closeData.lostReason = lostReason || null; }
        else { closeData.wonAt = null; closeData.lostAt = null; }
      }
      await tx.lead.update({ where: { id }, data: closeData });
      // Tartib: odatda faqat kerakli joydan keyingilarni 1 ga suramiz (butun bosqichni qayta raqamlash katta bazada sekin).
      // Faqat navbat qiymatlari to'qnashgan (teng) bo'lsa — bosqich bo'yicha zich qayta raqamlash.
      const cond = { stage: stageKey, id: { not: id } };
      const order = [{ queue: 'asc' as const }, { id: 'asc' as const }];
      let queue: number;
      const pos = position == null ? null : Math.max(0, position);
      const near = pos == null ? [] : await tx.lead.findMany({ where: { ...cond, unsorted: false }, orderBy: order, skip: Math.max(0, pos - 1), take: pos > 0 ? 2 : 1, select: { queue: true } });
      const at = pos == null ? undefined : pos > 0 ? near[1] : near[0];
      const tie = pos != null && pos > 0 && near.length === 2 && near[0].queue === near[1].queue;
      if (tie) {
        const others = await tx.lead.findMany({ where: cond, orderBy: order, select: { id: true, unsorted: true } });
        const visible = others.filter((o) => !o.unsorted); // pozitsiya ko'rinadigan kartalar bo'yicha (saralanmaganlar hisobga olinmaydi)
        const anchor = visible[pos!];
        const ids = others.map((o) => o.id);
        ids.splice(anchor ? ids.indexOf(anchor.id) : ids.length, 0, id);
        for (let i = 0; i < ids.length; i++) await tx.lead.update({ where: { id: ids[i] }, data: { queue: i } });
        return;
      }
      if (at) {
        queue = at.queue;
        await tx.lead.updateMany({ where: { ...cond, queue: { gte: queue } }, data: { queue: { increment: 1 } } });
      } else {
        const m = await tx.lead.aggregate({ where: cond, _max: { queue: true } });
        queue = (m._max.queue ?? -1) + 1;
      }
      await tx.lead.update({ where: { id }, data: { queue } });
    });

    if (changed) {
      const fresh = (await this.prisma.lead.findUnique({ where: { id } })) as LeadRow;
      await this.recordStageActivity(id, fresh, target.kind, user, before.stage);
      await this.automation.fire('stage_enter', id, { actorName: user?.name });
    }
    return { id, stageId: stageKey };
  }

  async addNote(id: string, dto: AddNoteDto, user?: AuthUser) {
    const l = (await this.prisma.lead.findUnique({ where: { id } })) as LeadRow | null;
    if (!l) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    const notes = parse<{ text: string; at: string; by: string }[]>(l.notesJson, []);
    const text = String(dto.text || '').slice(0, 2000);
    notes.unshift({ text, at: new Date().toISOString(), by: user?.name || '—' });
    await this.prisma.lead.update({ where: { id }, data: { notesJson: JSON.stringify(notes.slice(0, 100)) } });
    await this.activity.record(id, 'note', { actorId: user?.id, actorName: user?.name, text });
    return { notes };
  }

  // ── Ommaviy amallar (mass actions) ──
  async bulk(dto: { ids?: string[]; action: string; value?: any; all?: boolean; filter?: LeadFilter; excludeIds?: string[] }, user?: AuthUser) {
    let ids = Array.isArray(dto.ids) ? dto.ids : [];
    if (dto.all) {
      // "Barchasini belgilash": filtrga mos hamma bitimlar (barcha sahifalar), excludeIds bundan mustasno
      const ctx = await this.leadCtx(user?.id);
      const found = await this.prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT l.id FROM leads l WHERE ${and(leadConds(dto.filter || {}, ctx))}`,
      );
      const ex = new Set(Array.isArray(dto.excludeIds) ? dto.excludeIds : []);
      ids = found.map((r) => r.id).filter((id) => !ex.has(id));
    }
    if (!ids.length) throw new BadRequestException({ error: 'NO_IDS', message: 'Lid tanlanmagan' });
    let affected = 0;
    const CHUNK = 5000; // Postgres bind-parametr limiti (32767) dan oshmaslik uchun
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    switch (dto.action) {
      case 'stage': {
        // Paketli ko'chirish (har bitim uchun alohida tranzaksiya o'rniga): bosqich/yopilish sanalari + navbat oxiriga + faoliyat yozuvi
        const target = await this.prisma.crmStage.findUnique({ where: { key: String(dto.value) } });
        if (!target) throw new NotFoundException({ error: 'BAD_STAGE', message: "Noto'g'ri bosqich" });
        let base = await this.nextQueue(target.key);
        const stageName = target.name;
        for (const part of chunks) {
          const before = await this.prisma.lead.findMany({ where: { id: { in: part } }, select: { id: true, stage: true, value: true, lostReason: true } });
          const found = before.map((b) => b.id);
          if (!found.length) continue;
          const changed = before.filter((b) => b.stage !== target.key);
          if (changed.length) {
            const data: Record<string, unknown> = { stage: target.key, pipelineId: target.pipelineId || null, lastActivityAt: new Date() };
            if (target.kind === 'won') { data.wonAt = new Date(); data.lostAt = null; }
            else if (target.kind === 'lost') data.lostAt = new Date(), data.wonAt = null;
            else { data.wonAt = null; data.lostAt = null; }
            await this.prisma.lead.updateMany({ where: { id: { in: changed.map((c) => c.id) } }, data });
            await this.prisma.activity.createMany({
              data: changed.map((c) => ({
                leadId: c.id, type: target.kind === 'won' ? 'won' : target.kind === 'lost' ? 'lost' : 'stage', actorId: user?.id || null, actorName: user?.name || null, dataJson: '{}',
                text: target.kind === 'won' ? `🏆 Sotuv yopildi: ${fmtSum(c.value)} so'm` : target.kind === 'lost' ? "Yo'qotildi" : `Bosqich: ${stageName}`,
              })),
            });
          }
          // navbat: qo'shilish tartibida bosqich oxiriga
          await this.prisma.$executeRaw(Prisma.sql`UPDATE leads SET queue = ${base} + sub.rn FROM (SELECT id, (row_number() OVER (ORDER BY queue, id))::int AS rn FROM leads WHERE id IN (${Prisma.join(found)})) sub WHERE leads.id = sub.id`);
          base += found.length;
          affected += found.length;
          for (let i = 0; i < changed.length; i += 20) {
            await Promise.all(changed.slice(i, i + 20).map((c) => this.automation.fire('stage_enter', c.id, { actorName: user?.name })));
          }
        }
        break;
      }
      case 'assignee': {
        for (const part of chunks) {
          const r = await this.prisma.lead.updateMany({ where: { id: { in: part } }, data: { assigneeId: dto.value || null, lastActivityAt: new Date() } });
          affected += r.count;
          await this.prisma.activity.createMany({
            data: part.map((leadId) => ({ leadId, type: 'assignee', actorId: user?.id || null, actorName: user?.name || null, text: `Mas'ul (ommaviy)`, dataJson: '{}' })),
          });
        }
        for (const id of ids) await this.automation.fire('assignee_changed', id, { actorName: user?.name });
        if (dto.value) await this.notif.notify(dto.value, `Sizga ${affected} ta lid biriktirildi`, { type: 'lead', link: '/leads/pipeline' });
        break;
      }
      case 'add_tag': {
        const tag = String(dto.value || '').trim();
        if (tag) await assertNewTagsAllowed(this.prisma, [tag], user);
        if (tag) {
          for (const part of chunks) {
            const leads = await this.prisma.lead.findMany({ where: { id: { in: part } }, select: { id: true, tagsJson: true } });
            for (const l of leads) {
              const tags = [...new Set([...parse<string[]>(l.tagsJson, []), tag])];
              await this.prisma.lead.update({ where: { id: l.id }, data: { tagsJson: JSON.stringify(tags) } });
              affected++;
            }
          }
        }
        break;
      }
      case 'hot': {
        for (const part of chunks) affected += (await this.prisma.lead.updateMany({ where: { id: { in: part } }, data: { hot: !!dto.value } })).count;
        break;
      }
      case 'delete': {
        for (const part of chunks) {
          await this.prisma.activity.deleteMany({ where: { leadId: { in: part } } });
          affected += (await this.prisma.lead.deleteMany({ where: { id: { in: part } } })).count;
        }
        break;
      }
      default:
        throw new BadRequestException({ error: 'BAD_ACTION', message: 'Noma`lum amal' });
    }
    return { ok: true, affected };
  }

  // ── List ko'rinishi + kengaytirilgan filtr ──
  /**
   * Bitimlar ro'yxati. Parametrlar: limit, cursor, sort (name|createdAt|value|stage|assignee|contact|updatedAt), dir (asc|desc),
   * search, preset, period, assigneeId, budgetFrom/To, tags, pipelineId, stage, task, contactId, companyId, unsorted ...
   * `limit` berilsa — sahifalangan javob: { leads, nextCursor, total, totalSum }.
   * `limit` berilmasa — eski shakl (birinchi 500 ta), total/totalSum qo'shimcha maydon sifatida.
   * total/totalSum filtrga mos barcha bitimlar bo'yicha (SQL aggregate).
   */
  async listLeads(q: LeadFilter & { limit?: string; cursor?: string; sort?: string; dir?: string }, userId?: string) {
    const ctx = await this.leadCtx(userId);
    const where = and(leadConds(q, ctx));
    const { paged, limit, offset } = parsePaging(q, 500, 200);
    const { join, order } = leadOrder(q.sort, q.dir);
    const [idRows, aggRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT l.id FROM leads l ${join} WHERE ${where} ${order} LIMIT ${limit + (paged ? 1 : 0)} OFFSET ${offset}`),
      this.prisma.$queryRaw<{ c: number; s: number }[]>(Prisma.sql`SELECT count(*)::int AS c, coalesce(sum(l.value), 0)::float8 AS s FROM leads l WHERE ${where}`),
    ]);
    const more = paged && idRows.length > limit;
    const leads = await this.rowsByIds(idRows.slice(0, limit).map((r) => r.id));
    const stages = await this.prisma.crmStage.findMany();
    const kindByKey = new Map(stages.map((s) => [s.key, s.kind]));
    const nameByKey = new Map(stages.map((s) => [s.key, s.name]));
    const colorByKey = new Map(stages.map((s) => [s.key, s.color]));
    const names = await this.userMap(leads.map((l) => l.assigneeId));
    const cIds = [...new Set(leads.map((l) => l.contactId).filter(Boolean))] as string[];
    const cs = cIds.length ? await this.prisma.contact.findMany({ where: { id: { in: cIds } }, select: { id: true, name: true, phone: true, email: true, companyId: true } }) : [];
    const cMap = new Map(cs.map((c) => [c.id, c]));
    const coIds = [...new Set([...leads.map((l) => l.companyId), ...cs.map((c) => c.companyId)].filter(Boolean))] as string[];
    const cos = coIds.length ? await this.prisma.company.findMany({ where: { id: { in: coIds } }, select: { id: true, name: true } }) : [];
    const coName = new Map(cos.map((c) => [c.id, c.name]));
    return {
      leads: leads.map((l) => {
        const c = l.contactId ? cMap.get(l.contactId) : undefined;
        return {
          ...this.card(l, kindByKey.get(l.stage) || 'open', names),
          stageName: nameByKey.get(l.stage) || l.stage,
          stageColor: colorByKey.get(l.stage) || null,
          contactId: l.contactId || null,
          companyId: l.companyId || null,
          contactName: c?.name || null,
          contactPhone: c?.phone || null,
          contactEmail: c?.email || null,
          companyName: (l.companyId && coName.get(l.companyId)) || (c?.companyId && coName.get(c.companyId)) || l.company || null,
          updatedAt: l.updatedAt.toISOString(),
          closedAt: (l.wonAt || l.lostAt) ? (l.wonAt || l.lostAt)!.toISOString() : null,
        };
      }),
      nextCursor: more ? String(offset + limit) : null,
      total: Number(aggRows[0]?.c || 0),
      totalSum: Number(aggRows[0]?.s || 0),
    };
  }

  // ── CSV eksport / import ──
  /** Filtr (listLeads bilan bir xil parametrlar + sort/dir) bo'yicha CSV; filtrsiz — hamma bitimlar. */
  async exportCsv(q: LeadFilter & { sort?: string; dir?: string } = {}, userId?: string): Promise<string> {
    const ctx = await this.leadCtx(userId);
    const { join, order } = leadOrder(q.sort || 'createdAt', q.dir || 'desc');
    const idRows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT l.id FROM leads l ${join} WHERE ${and(leadConds(q, ctx))} ${order}`);
    const leads = await this.rowsByIds(idRows.map((r) => r.id));
    const names = await this.userMap(leads.map((l) => l.assigneeId));
    const stages = await this.prisma.crmStage.findMany();
    const stName = new Map(stages.map((s) => [s.key, s.name]));
    const head = ['Ism', 'Telefon', 'Email', 'Kompaniya', 'Manba', 'Byudjet', 'Bosqich', 'Mas`ul', 'Teglar', 'Yaratilgan'];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = leads.map((l) => [
      l.name, l.phone || '', l.email || '', l.company || '', l.source || '', l.value,
      stName.get(l.stage) || l.stage, l.assigneeId ? names.get(l.assigneeId) || '' : '',
      parse<string[]>(l.tagsJson, []).join('; '), l.createdAt.toISOString().slice(0, 10),
    ].map(esc).join(','));
    return [head.map(esc).join(','), ...rows].join('\n');
  }

  async importLeads(rows: any[], user?: AuthUser) {
    let created = 0, skipped = 0;
    for (const r of rows) {
      const name = String(r.name || r.Ism || '').trim();
      if (!name) { skipped++; continue; }
      const phone = String(r.phone || r.Telefon || '').trim() || null;
      const dup = phone ? (await this.findDuplicates(phone)).duplicates.length > 0 : false;
      if (dup) { skipped++; continue; }
      await this.prisma.lead.create({
        data: {
          name,
          phone,
          email: String(r.email || r.Email || '').trim() || null,
          company: String(r.company || r.Kompaniya || '').trim() || null,
          source: String(r.source || r.Manba || '').trim() || null,
          value: Number(r.value || r.Byudjet) || 0,
          stage: 'new',
          queue: await this.nextQueue('new'),
          createdById: user?.id || null,
        },
      });
      created++;
    }
    return { ok: true, created, skipped };
  }

  // ── Lidlarni birlashtirish (dublikat) ──
  /** Manbalar ro'yxati (filtr uchun): bitimlardagi noyob Lead.source qiymatlari + standart integratsiya manbalari. */
  async listSources() {
    const rows = await this.prisma.$queryRaw<{ s: string; c: number }[]>(Prisma.sql`SELECT l.source AS s, count(*)::int AS c FROM leads l WHERE coalesce(l.source, '') <> '' GROUP BY 1 ORDER BY 2 DESC, 1`);
    const have = new Set(rows.map((r) => r.s));
    const std = ['Facebook', 'Sayt formasi', 'Telegram', "Qo'ng'iroq", 'Import'];
    return { sources: [...rows.map((r) => ({ name: r.s, count: Number(r.c) })), ...std.filter((n) => !have.has(n)).map((name) => ({ name, count: 0 }))] };
  }

  /** Dublikat guruhlari: by = phone (oxirgi 9 raqam) | email | name. Faqat 2+ bitimli guruhlar, eng kattalari birinchi. */
  async duplicateGroups(by: string) {
    const key = by === 'email' ? Prisma.sql`l."emailNorm"` : by === 'name' ? Prisma.sql`lower(btrim(l.name))` : Prisma.sql`l."phoneTail"`;
    const valid = by === 'email' ? Prisma.sql`l."emailNorm" <> ''` : by === 'name' ? Prisma.sql`btrim(l.name) <> ''` : Prisma.sql`length(l."phoneTail") >= 7`;
    const groups = await this.prisma.$queryRaw<{ k: string; ids: string[]; c: number }[]>(Prisma.sql`
      SELECT g.k, g.ids, g.c FROM (
        SELECT ${key} AS k, array_agg(l.id ORDER BY l."createdAt", l.id) AS ids, count(*)::int AS c
        FROM leads l WHERE l.unsorted = FALSE AND ${key} IS NOT NULL AND ${valid} GROUP BY 1 HAVING count(*) > 1
      ) g ORDER BY g.c DESC, g.k LIMIT 200`);
    const rows = await this.rowsByIds(groups.flatMap((g) => g.ids));
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const stages = await this.prisma.crmStage.findMany({ select: { key: true, name: true } });
    const stName = new Map(stages.map((x) => [x.key, x.name]));
    const names = await this.userMap(rows.map((r) => r.assigneeId));
    return {
      by,
      total: groups.length,
      groups: groups.map((g) => ({
        key: g.k,
        count: g.c,
        leads: g.ids.map((id) => rowById.get(id)).filter(Boolean).map((l) => ({
          id: l!.id, name: l!.name, phone: l!.phone, email: l!.email, value: l!.value, source: l!.source,
          stageName: stName.get(l!.stage) || l!.stage, assigneeName: l!.assigneeId ? names.get(l!.assigneeId) || null : null,
          tags: parse<string[]>(l!.tagsJson, []), createdAt: l!.createdAt.toISOString(),
        })),
      })),
    };
  }

  async mergeLeads(keepId: string, mergeIds: string[], user?: AuthUser) {
    const keep = (await this.prisma.lead.findUnique({ where: { id: keepId } })) as LeadRow | null;
    if (!keep) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Asosiy lid topilmadi' });
    const ids = (mergeIds || []).filter((id) => id && id !== keepId);
    if (!ids.length) throw new BadRequestException({ error: 'NO_IDS', message: 'Birlashtiriladigan lid yo`q' });
    const others = (await this.prisma.lead.findMany({ where: { id: { in: ids } } })) as LeadRow[];

    // bog'liqlarni asosiy lidga ko'chiramiz
    await this.prisma.leadTask.updateMany({ where: { leadId: { in: ids } }, data: { leadId: keepId } });
    await this.prisma.activity.updateMany({ where: { leadId: { in: ids } }, data: { leadId: keepId } });
    await this.prisma.callLog.updateMany({ where: { leadId: { in: ids } }, data: { leadId: keepId } });

    // bo'sh maydonlarni to'ldiramiz + teglar/izohlarni birlashtiramiz
    const data: Record<string, unknown> = {};
    for (const o of others) {
      if (!keep.phone && o.phone) data.phone = o.phone;
      if (!keep.email && o.email) data.email = o.email;
      if (!keep.company && o.company) data.company = o.company;
      if (!keep.source && o.source) data.source = o.source;
      if (!keep.value && o.value) data.value = o.value;
    }
    const tags = new Set(parse<string[]>(keep.tagsJson, []));
    const notes = parse<{ text: string; at: string; by: string }[]>(keep.notesJson, []);
    for (const o of others) {
      parse<string[]>(o.tagsJson, []).forEach((t) => tags.add(t));
      notes.push(...parse<{ text: string; at: string; by: string }[]>(o.notesJson, []));
    }
    data.tagsJson = JSON.stringify([...tags]);
    data.notesJson = JSON.stringify(notes.sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, 100));
    await this.prisma.lead.update({ where: { id: keepId }, data });

    await this.prisma.lead.deleteMany({ where: { id: { in: ids } } });
    await this.activity.record(keepId, 'updated', { actorId: user?.id, actorName: user?.name, text: `${ids.length} ta dublikat birlashtirildi` });
    return { ok: true, merged: ids.length };
  }

  // ── Saralanmagan (unsorted) inbox ──
  async listUnsorted(q: LeadFilter = {}, userId?: string) {
    // Filtr (leadConds) saralanmaganlarga ham qo'llanadi; filtrsiz — hammasi (eng yangi 200 ta)
    const ctx = await this.leadCtx(userId);
    const { pipelineId: _p, stage: _s, unsorted: _u, ...userFilter } = q as any;
    const where = and([Prisma.sql`l.unsorted = TRUE`, ...leadConds(userFilter, ctx)]);
    const [idRows, aggRows] = await Promise.all([
      this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT l.id FROM leads l WHERE ${where} ORDER BY l."createdAt" DESC, l.id ASC LIMIT 200`),
      this.prisma.$queryRaw<{ c: number }[]>(Prisma.sql`SELECT count(*)::int AS c FROM leads l WHERE ${where}`),
    ]);
    const leads = await this.rowsByIds(idRows.map((r) => r.id));
    const names = await this.userMap(leads.map((l) => l.assigneeId));
    const forms = await this.prisma.crmForm.findMany({ select: { id: true, title: true } });
    const formName = new Map(forms.map((f) => [f.id, f.title]));
    return {
      leads: leads.map((l) => ({
        ...this.card(l, 'open', names),
        formName: l.formId ? formName.get(l.formId) || null : null,
        createdAt: l.createdAt.toISOString(),
      })),
      total: Number(aggRows[0]?.c || 0),
    };
  }
  async acceptUnsorted(id: string, dto: { assigneeId?: string; stageKey?: string; pipelineId?: string }, user?: AuthUser) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    const data: Record<string, unknown> = { unsorted: false };
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId || null;
    if (dto.stageKey) data.stage = dto.stageKey;
    if (dto.pipelineId !== undefined) data.pipelineId = dto.pipelineId || null;
    await this.prisma.lead.update({ where: { id }, data });
    await this.activity.record(id, 'updated', { actorId: user?.id, actorName: user?.name, text: 'Saralanmagandan qabul qilindi' });
    if (dto.stageKey && dto.stageKey !== lead.stage) await this.automation.fire('stage_enter', id, { actorName: user?.name });
    if (data.assigneeId) await this.notif.notify(data.assigneeId as string, `Sizga lid biriktirildi: ${lead.name}`, { type: 'lead', link: `/leads/detail/${id}` });
    return { ok: true };
  }

  // ── Vazifalar (zadacha) ──
  private taskView(t: {
    id: string; leadId: string; title: string; type: string; dueDate: Date | null;
    done: boolean; doneAt: Date | null; result?: string | null; assigneeId: string | null; createdById?: string | null;
  }, extra?: { leadName?: string; stage?: string; pipelineId?: string | null; assigneeName?: string | null }) {
    return {
      id: t.id,
      leadId: t.leadId,
      title: t.title,
      type: t.type,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      done: t.done,
      doneAt: t.doneAt ? t.doneAt.toISOString() : null,
      result: t.result ?? null,
      assigneeId: t.assigneeId,
      assigneeName: extra?.assigneeName ?? null,
      leadName: extra?.leadName,
      stage: extra?.stage,
      pipelineId: extra?.pipelineId ?? null,
      createdById: t.createdById ?? null, // vazifalar filtrida "Mualliflar"
    };
  }

  async listLeadTasks(leadId: string) {
    const tasks = await this.prisma.leadTask.findMany({
      where: { leadId },
      orderBy: [{ done: 'asc' }, { dueDate: 'asc' }],
    });
    const names = await this.userMap(tasks.map((t) => t.assigneeId));
    return { tasks: tasks.map((t) => this.taskView(t, { assigneeName: t.assigneeId ? names.get(t.assigneeId) || null : null })) };
  }

  // amoCRM Zadachalar ro'yxati — holat/mas'ul/tur filtrlari bilan
  async listAllTasks(q?: { status?: string; assigneeId?: string; type?: string }) {
    const status = q?.status;
    const where: Record<string, unknown> = {};
    if (status === 'open' || status === 'overdue') where.done = false;
    else if (status === 'done') where.done = true;
    if (status === 'overdue') where.dueDate = { not: null, lt: new Date() };
    if (q?.assigneeId) where.assigneeId = q.assigneeId === 'none' ? null : q.assigneeId;
    if (q?.type) where.type = q.type;
    const tasks = await this.prisma.leadTask.findMany({
      where,
      orderBy: [{ done: 'asc' }, { dueDate: 'asc' }],
      include: { lead: { select: { name: true, stage: true, pipelineId: true } } },
      take: 800,
    });
    const names = await this.userMap(tasks.map((t) => t.assigneeId));
    return {
      tasks: tasks.map((t) =>
        this.taskView(t, {
          leadName: t.lead?.name,
          stage: t.lead?.stage,
          pipelineId: t.lead?.pipelineId ?? null,
          assigneeName: t.assigneeId ? names.get(t.assigneeId) || null : null,
        }),
      ),
    };
  }

  async createTask(leadId: string, dto: CreateLeadTaskDto, user?: AuthUser) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    const title = (dto.title || '').trim();
    if (!title) throw new BadRequestException({ error: 'VALIDATION_ERROR', message: 'Vazifa nomi majburiy' });
    if (title.length > 1000) throw new BadRequestException({ error: 'VALIDATION_ERROR', message: 'Vazifa matni juda uzun (1000 belgigacha)' });
    const t = await this.prisma.leadTask.create({
      data: {
        leadId,
        title,
        type: dto.type || 'task',
        dueDate: toDate(dto.dueDate),
        assigneeId: dto.assigneeId || lead.assigneeId || user?.id || null,
        createdById: user?.id || null,
      },
    });
    await this.activity.record(leadId, 'task_created', { actorId: user?.id, actorName: user?.name, text: `Vazifa: ${t.title}` });
    if (t.assigneeId && t.assigneeId !== user?.id) await this.notif.notify(t.assigneeId, `Yangi vazifa: ${t.title}`, { type: 'task', link: `/leads/detail/${leadId}` });
    return { task: this.taskView(t) };
  }

  async updateTask(id: string, dto: UpdateLeadTaskDto, user?: AuthUser) {
    const existing = await this.prisma.leadTask.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Vazifa topilmadi' });
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) {
      const title = (dto.title || '').trim();
      if (!title) throw new BadRequestException({ error: 'VALIDATION_ERROR', message: 'Vazifa nomi majburiy' });
      if (title.length > 1000) throw new BadRequestException({ error: 'VALIDATION_ERROR', message: 'Vazifa matni juda uzun (1000 belgigacha)' });
      data.title = title;
    }
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.dueDate !== undefined) data.dueDate = toDate(dto.dueDate);
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId || null;
    if ((dto as any).result !== undefined) data.result = (dto as any).result || null;
    if (dto.done !== undefined) {
      data.done = !!dto.done;
      data.doneAt = dto.done ? new Date() : null;
    }
    const t = await this.prisma.leadTask.update({ where: { id }, data });
    if (dto.done === true && !existing.done) {
      const res = (dto as any).result ? ` — ${(dto as any).result}` : '';
      await this.activity.record(existing.leadId, 'task_done', { actorId: user?.id, actorName: user?.name, text: `Vazifa bajarildi: ${t.title}${res}` });
    }
    return { task: this.taskView(t) };
  }

  async deleteTask(id: string, user?: AuthUser) {
    const t = await this.prisma.leadTask.findUnique({ where: { id } });
    if (!t) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Vazifa topilmadi' });
    // amoCRM: o'chirilgan vazifa "Удаленные"da qoladi va tiklanadi
    await this.prisma.$transaction([
      this.prisma.deletedTask.upsert({
        where: { id: t.id },
        create: { id: t.id, leadId: t.leadId, title: t.title, type: t.type, dueDate: t.dueDate, done: t.done, doneAt: t.doneAt, result: t.result ?? null, assigneeId: t.assigneeId, createdById: t.createdById, createdAt: t.createdAt, deletedById: user?.id || null },
        update: { deletedAt: new Date(), deletedById: user?.id || null },
      }),
      this.prisma.leadTask.delete({ where: { id } }),
    ]);
    return { success: true };
  }

  // ── Vazifa turlari (amoCRM "Управление типами задач"): standart 4 ta + o'z turlari (AppSetting 'task_types') ──
  async getTaskTypes() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: 'task_types' } });
    let custom: any[] = [];
    try { const v = JSON.parse(row?.value || '[]'); custom = Array.isArray(v) ? v : []; } catch { /* */ }
    return { custom };
  }
  async saveTaskTypes(body: { custom?: unknown }) {
    const ICONS = ['clock', 'phone', 'users', 'send', 'check', 'star', 'calendar', 'note', 'dollar', 'external', 'telegram', 'instagram'];
    const RESERVED = ['call', 'meeting', 'task', 'message'];
    const custom = (Array.isArray(body?.custom) ? body.custom : []).slice(0, 30).map((x: any, i: number) => {
      const label = String(x?.label || '').trim().slice(0, 40);
      let key = String(x?.key || '').trim().slice(0, 40);
      if (!key || RESERVED.includes(key)) key = `t_${Date.now().toString(36)}${i}`;
      return { key, label, icon: ICONS.includes(x?.icon) ? x.icon : 'clock' };
    }).filter((x) => x.label);
    const value = JSON.stringify(custom);
    await this.prisma.appSetting.upsert({ where: { key: 'task_types' }, update: { value }, create: { key: 'task_types', value } });
    return { custom };
  }

  async listDeletedTasks() {
    const rows = await this.prisma.deletedTask.findMany({ orderBy: { deletedAt: 'desc' }, take: 500 });
    const leadIds = [...new Set(rows.map((r) => r.leadId))];
    const leads = leadIds.length ? await this.prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } }) : [];
    const leadName = new Map(leads.map((l) => [l.id, l.name]));
    const names = await this.userMap(rows.map((r) => r.assigneeId));
    return {
      tasks: rows.map((r) => ({
        ...this.taskView(r, { leadName: leadName.get(r.leadId), assigneeName: r.assigneeId ? names.get(r.assigneeId) || null : null }),
        deletedAt: r.deletedAt.toISOString(), leadExists: leadName.has(r.leadId),
      })),
    };
  }

  async restoreTask(id: string) {
    const r = await this.prisma.deletedTask.findUnique({ where: { id } });
    if (!r) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Vazifa topilmadi' });
    if (!(await this.prisma.lead.findUnique({ where: { id: r.leadId }, select: { id: true } })))
      throw new BadRequestException({ error: 'LEAD_GONE', message: "Vazifaning bitimi o'chirilgan — tiklab bo'lmaydi" });
    await this.prisma.$transaction([
      this.prisma.leadTask.create({ data: { id: r.id, leadId: r.leadId, title: r.title, type: r.type, dueDate: r.dueDate, done: r.done, doneAt: r.doneAt, result: r.result, assigneeId: r.assigneeId, createdById: r.createdById, createdAt: r.createdAt } }),
      this.prisma.deletedTask.delete({ where: { id } }),
    ]);
    return { success: true };
  }
}
