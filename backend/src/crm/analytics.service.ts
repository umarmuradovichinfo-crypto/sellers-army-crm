import { BadRequestException, Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { and, dateRangeOf, LeadCtx, LeadFilter, leadConds } from './list-query';

// Davr chegarasini xavfsiz o'qish: noto'g'ri sana 500 emas, 400 qaytaradi
function parseFrom(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (isNaN(d.getTime())) throw new BadRequestException({ error: 'INVALID_DATE', message: `Noto'g'ri sana: ${v}` });
  return d;
}
function parseTo(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + 'T23:59:59' : v);
  if (isNaN(d.getTime())) throw new BadRequestException({ error: 'INVALID_DATE', message: `Noto'g'ri sana: ${v}` });
  return d;
}

// 'main' = asosiy voronka (pipelineId = null), boshqa qiymat — voronka id'si
function pipeVal(id?: string): string | null | undefined {
  if (!id) return undefined;
  return id === 'main' ? null : id;
}
function userList(v?: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => userList(x));
  return String(v || '').split(',').map((x) => x.trim()).filter(Boolean);
}

/**
 * CRM analitika — voronka konversiyasi, win/loss, manba/sotuvchi kesimi,
 * yo'qotish sabablari. Davr (from/to) va voronka (pipelineId) bo'yicha filtr.
 */
@Injectable()
export class CrmAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Analitika filtri: bitimlar ro'yxatidagi BARCHA parametrlar (list-query.leadConds) + voronka (pipelineId) + userIds (mas'ullar).
   * `stripDates` — sana bloki tashqarida alohida (timeline/employees) ishlatilganda.
   */
  private async filteredLeads(q: Record<string, any>, userId?: string, stripDates = false): Promise<{ rows: any[]; ctx: LeadCtx }> {
    const [stages, fields] = await Promise.all([
      this.prisma.crmStage.findMany({ select: { key: true, kind: true } }),
      this.prisma.crmField.findMany({ where: { entity: 'lead' }, select: { key: true, type: true } }),
    ]);
    const ctx: LeadCtx = { userId, kinds: new Map(stages.map((s) => [s.key, s.kind])), fields: new Map(fields.map((f) => [f.key, f.type])) };
    parseFrom(q.from); parseTo(q.to); // noto'g'ri sana -> 400
    const f: Record<string, any> = { ...q };
    delete f.unsorted; delete f.limit;
    if (f.pipelineId === '' || f.pipelineId === undefined) delete f.pipelineId;
    const uids = userList(f.userIds);
    delete f.userIds;
    if (uids.length) f.assigneeIds = [...userList(f.assigneeIds), ...uids];
    if (stripDates) { delete f.from; delete f.to; delete f.datePreset; delete f.dateField; delete f.period; }
    const rows = await this.prisma.$queryRaw<any[]>(
      Prisma.sql`SELECT l.* FROM leads l WHERE ${and([Prisma.sql`l.unsorted = FALSE`, ...leadConds(f as LeadFilter, ctx)])}`,
    );
    return { rows, ctx };
  }

  async overview(params: Record<string, any>, userId?: string) {
    // «Saralanmagan» arizalar hali bitim emas (voronka bilan bir xil)
    const pv = pipeVal(params.pipelineId);
    const { rows: leads } = await this.filteredLeads(params, userId);
    const [stages, users] = await Promise.all([
      this.prisma.crmStage.findMany({ orderBy: { order: 'asc' } }),
      this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);

    const stageList = pv !== undefined ? stages.filter((s) => (s.pipelineId || null) === pv) : stages;
    const kindByKey = new Map(stages.map((s) => [s.key, s.kind]));

    // Voronka: har bosqich bo'yicha lid soni + summa + konversiya
    const total = leads.length;
    const funnel = stageList.map((s) => {
      const sl = leads.filter((l) => l.stage === s.key);
      return {
        key: s.key,
        name: s.name,
        color: s.color,
        kind: s.kind,
        count: sl.length,
        sum: sl.reduce((a, l) => a + l.value, 0),
        pct: total ? Math.round((sl.length / total) * 100) : 0,
        convFromPrev: 100, // pastda to'ldiriladi
      };
    });
    // Bosqichdan-bosqichga konversiya (amoCRM voronkasi)
    funnel.forEach((f, i) => {
      const prev = funnel[i - 1];
      f.convFromPrev = i === 0 ? 100 : prev.count ? Math.round((f.count / prev.count) * 100) : 0;
    });

    // Win / loss
    const won = leads.filter((l) => kindByKey.get(l.stage) === 'won');
    const lost = leads.filter((l) => kindByKey.get(l.stage) === 'lost');
    const open = leads.filter((l) => kindByKey.get(l.stage) === 'open' || !kindByKey.has(l.stage));
    const closed = won.length + lost.length;
    const winRate = closed ? Math.round((won.length / closed) * 100) : 0;

    // Manba kesimi
    const bySourceMap = new Map<string, { count: number; won: number; sum: number }>();
    for (const l of leads) {
      const k = l.source || '—';
      const e = bySourceMap.get(k) || { count: 0, won: 0, sum: 0 };
      e.count++;
      if (kindByKey.get(l.stage) === 'won') { e.won++; e.sum += l.value; }
      bySourceMap.set(k, e);
    }
    const bySource = [...bySourceMap.entries()]
      .map(([source, v]) => ({ source, ...v, conv: v.count ? Math.round((v.won / v.count) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);

    // Sotuvchi kesimi (KPI)
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    const byEmpMap = new Map<string, { leads: number; won: number; lost: number; sum: number }>();
    for (const l of leads) {
      const k = l.assigneeId || '—';
      const e = byEmpMap.get(k) || { leads: 0, won: 0, lost: 0, sum: 0 };
      e.leads++;
      if (kindByKey.get(l.stage) === 'won') { e.won++; e.sum += l.value; }
      if (kindByKey.get(l.stage) === 'lost') e.lost++;
      byEmpMap.set(k, e);
    }
    const byEmployee = [...byEmpMap.entries()]
      .map(([id, v]) => ({
        id,
        name: id === '—' ? 'Biriktirilmagan' : nameById.get(id) || id,
        ...v,
        conv: v.won + v.lost ? Math.round((v.won / (v.won + v.lost)) * 100) : 0,
      }))
      .sort((a, b) => b.won - a.won);

    // Yo'qotish sabablari
    const lostReasonMap = new Map<string, number>();
    for (const l of lost) {
      const k = l.lostReason || 'Sabab ko\'rsatilmagan';
      lostReasonMap.set(k, (lostReasonMap.get(k) || 0) + 1);
    }
    const lostReasons = [...lostReasonMap.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);

    return {
      cards: {
        total,
        open: open.length,
        openSum: open.reduce((a, l) => a + l.value, 0),
        won: won.length,
        wonSum: won.reduce((a, l) => a + l.value, 0),
        lost: lost.length,
        winRate,
        avgCheck: won.length ? Math.round(won.reduce((a, l) => a + l.value, 0) / won.length) : 0,
        avgDays: (() => {
          const w = won.filter((l) => l.wonAt);
          return w.length ? Math.round(w.reduce((a, l) => a + (l.wonAt!.getTime() - l.createdAt.getTime()) / 86400000, 0) / w.length) : 0;
        })(),
      },
      funnel,
      bySource,
      byEmployee,
      lostReasons,
    };
  }

  // Davr filtri (createdAt/startedAt uchun): from/to yoki datePreset (biznes vaqti UTC+5), to — chegara ichida emas
  private range(field: string, p: { from?: string; to?: string; datePreset?: string }): Record<string, any> {
    parseFrom(p.from); parseTo(p.to); // noto'g'ri sana -> 400
    const { from, to } = dateRangeOf(p);
    if (!from && !to) return {};
    const r: Record<string, any> = {};
    if (from) r.gte = from;
    if (to) r.lt = to;
    return { [field]: r };
  }

  private async userNames() {
    const users = await this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  // ── Qo'ng'iroqlar hisoboti (CallLog) ──
  async calls(params: { from?: string; to?: string; datePreset?: string }) {
    const where = this.range('startedAt', params);
    const [logs, nameById] = await Promise.all([
      this.prisma.callLog.findMany({ where }),
      this.userNames(),
    ]);
    const isMissed = (s: string) => s === 'missed' || s === 'failed';
    const isAnswered = (s: string) => s === 'answered' || s === 'completed';

    const totalDuration = logs.reduce((a, c) => a + (c.durationSec || 0), 0);
    const answered = logs.filter((c) => isAnswered(c.status));

    const empMap = new Map<string, { count: number; answered: number; missed: number; totalDur: number; inCount: number; outCount: number; inDur: number; outDur: number }>();
    const dayMap = new Map<string, { in: number; out: number; missed: number }>();
    for (const c of logs) {
      const ek = c.userId || '—';
      const e = empMap.get(ek) || { count: 0, answered: 0, missed: 0, totalDur: 0, inCount: 0, outCount: 0, inDur: 0, outDur: 0 };
      e.count++;
      if (c.direction === 'in') { e.inCount++; e.inDur += c.durationSec || 0; } else { e.outCount++; e.outDur += c.durationSec || 0; }
      if (isAnswered(c.status)) e.answered++;
      if (isMissed(c.status)) e.missed++;
      e.totalDur += c.durationSec || 0;
      empMap.set(ek, e);

      const dk = c.startedAt.toISOString().slice(0, 10);
      const d = dayMap.get(dk) || { in: 0, out: 0, missed: 0 };
      if (c.direction === 'in') d.in++;
      else d.out++;
      if (isMissed(c.status)) d.missed++;
      dayMap.set(dk, d);
    }

    return {
      total: logs.length,
      inbound: logs.filter((c) => c.direction === 'in').length,
      outbound: logs.filter((c) => c.direction !== 'in').length,
      missed: logs.filter((c) => isMissed(c.status)).length,
      answered: answered.length,
      totalDuration,
      avgDuration: answered.length ? Math.round(totalDuration / answered.length) : 0,
      byEmployee: [...empMap.entries()]
        .map(([id, v]) => ({
          id,
          name: id === '—' ? 'Biriktirilmagan' : nameById.get(id) || id,
          count: v.count,
          answered: v.answered,
          missed: v.missed,
          totalDur: v.totalDur,
          inCount: v.inCount,
          outCount: v.outCount,
          inDur: v.inDur,
          outDur: v.outDur,
          avgDur: v.answered ? Math.round(v.totalDur / v.answered) : 0,
        }))
        .sort((a, b) => b.count - a.count),
      byDay: [...dayMap.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  // ── Hodisalar hisoboti (Activity log) ──
  async events(params: { from?: string; to?: string; datePreset?: string; type?: string; userId?: string; limit?: number }) {
    const where: Record<string, any> = { ...this.range('createdAt', params) };
    if (params.type) where.type = params.type;
    if (params.userId) where.actorId = params.userId;

    const [rows, byTypeRaw] = await Promise.all([
      this.prisma.activity.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(Math.floor(params.limit || 0) || 100, 1), 300) }),
      this.prisma.activity.groupBy({ by: ['type'], where, _count: { _all: true } }),
    ]);

    const leadIds = [...new Set(rows.map((r) => r.leadId).filter((x): x is string => !!x))];
    const leads = leadIds.length
      ? await this.prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } })
      : [];
    const leadName = new Map(leads.map((l) => [l.id, l.name]));

    return {
      items: rows.map((r) => ({
        id: r.id,
        type: r.type,
        text: r.text || '',
        actorName: r.actorName || '',
        leadId: r.leadId,
        leadName: r.leadId ? leadName.get(r.leadId) || null : null,
        createdAt: r.createdAt.toISOString(),
      })),
      byType: byTypeRaw
        .map((g) => ({ type: g.type, count: g._count._all }))
        .sort((a, b) => b.count - a.count),
    };
  }

  // ── Sotuv dinamikasi (vaqt qatori) ──
  async timeline(params: Record<string, any>, userId?: string) {
    const r = dateRangeOf(params);
    const to = r.to ? new Date(r.to.getTime() - 1) : new Date();
    let from = r.from ?? new Date(Date.now() - 90 * 86400000);
    const minFrom = new Date(to.getTime() - 800 * 86400000); // juda keng davr — minglab bucket yaratmaslik uchun
    if (from < minFrom) from = minFrom;
    const week = params.granularity === 'week';
    // Sana bloki x o'qini belgilaydi; qolgan filtrlar bitimlar to'plamini cheklaydi
    const { rows } = await this.filteredLeads(params, userId, true);
    const inRange = (d: Date | null) => !!d && d >= from && d <= to;
    const created = rows.filter((l) => inRange(l.createdAt));
    const wonLeads = rows.filter((l) => inRange(l.wonAt));

    // Bucket kaliti (kun yoki hafta boshi) — biznes vaqti UTC+5 bo'yicha (server vaqt zonasiga bog'liq emas)
    const DAYMS = 86_400_000;
    const dayNum = (d: Date) => Math.floor((d.getTime() + 5 * 3600_000) / DAYMS);
    const keyOf = (n: number) => new Date(n * DAYMS).toISOString().slice(0, 10);
    const bucketNum = (d: Date) => (week ? dayNum(d) - ((dayNum(d) + 3) % 7) : dayNum(d)); // dushanba
    const bucketKey = (d: Date) => keyOf(bucketNum(d));
    const map = new Map<string, { created: number; won: number; wonSum: number }>();
    // Bo'sh bucketlarni ham to'ldiramiz
    for (let n = bucketNum(from); n <= dayNum(to); n += week ? 7 : 1) {
      map.set(keyOf(n), { created: 0, won: 0, wonSum: 0 });
    }
    for (const l of created) {
      const k = bucketKey(l.createdAt);
      const e = map.get(k) || { created: 0, won: 0, wonSum: 0 };
      e.created++;
      map.set(k, e);
    }
    for (const l of wonLeads) {
      if (!l.wonAt) continue;
      const k = bucketKey(l.wonAt);
      const e = map.get(k) || { created: 0, won: 0, wonSum: 0 };
      e.won++;
      e.wonSum += l.value;
      map.set(k, e);
    }

    return {
      granularity: week ? 'week' : 'day',
      buckets: [...map.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  // ── Chuqur sotuvchi hisoboti (lid + qo'ng'iroq + vazifa) ──
  async employees(params: Record<string, any>, userId?: string) {
    const [stages, { rows: leads }, nameById, callLogs, tasks, openTasks, notes] = await Promise.all([
      this.prisma.crmStage.findMany({ select: { key: true, kind: true } }),
      this.filteredLeads(params, userId),
      this.userNames(),
      this.prisma.callLog.findMany({ where: this.range('startedAt', params), select: { userId: true } }),
      this.prisma.leadTask.findMany({
        where: { done: true, ...this.range('doneAt', params) },
        select: { assigneeId: true },
      }),
      this.prisma.leadTask.findMany({ where: { done: false }, select: { assigneeId: true } }),
      this.prisma.activity.findMany({ where: { type: 'note', ...this.range('createdAt', params) }, select: { actorId: true } }),
    ]);
    const kindByKey = new Map(stages.map((s) => [s.key, s.kind]));

    const rows = new Map<string, { leads: number; leadSum: number; won: number; lost: number; sum: number; calls: number; tasksDone: number; tasksOpen: number; notes: number }>();
    const ensure = (id: string) =>
      rows.get(id) || rows.set(id, { leads: 0, leadSum: 0, won: 0, lost: 0, sum: 0, calls: 0, tasksDone: 0, tasksOpen: 0, notes: 0 }).get(id)!;
    for (const t of openTasks) ensure(t.assigneeId || '—').tasksOpen++;
    for (const n of notes) ensure((n as any).actorId || '—').notes++;
    for (const l of leads) {
      const e = ensure(l.assigneeId || '—');
      e.leads++;
      e.leadSum += l.value;
      if (kindByKey.get(l.stage) === 'won') { e.won++; e.sum += l.value; }
      if (kindByKey.get(l.stage) === 'lost') e.lost++;
    }
    for (const c of callLogs) ensure(c.userId || '—').calls++;
    for (const t of tasks) ensure(t.assigneeId || '—').tasksDone++;

    return [...rows.entries()]
      .map(([id, v]) => ({
        id,
        name: id === '—' ? 'Biriktirilmagan' : nameById.get(id) || id,
        leads: v.leads,
        leadSum: v.leadSum,
        notes: v.notes,
        tasksOpen: v.tasksOpen,
        won: v.won,
        lost: v.lost,
        sum: v.sum,
        conv: v.won + v.lost ? Math.round((v.won / (v.won + v.lost)) * 100) : 0,
        avgCheck: v.won ? Math.round(v.sum / v.won) : 0,
        calls: v.calls,
        tasksDone: v.tasksDone,
      }))
      .sort((a, b) => b.won - a.won);
  }
}
