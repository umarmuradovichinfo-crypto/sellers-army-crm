import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * CRM analitika — voronka konversiyasi, win/loss, manba/sotuvchi kesimi,
 * yo'qotish sabablari. Davr (from/to) va voronka (pipelineId) bo'yicha filtr.
 */
@Injectable()
export class CrmAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(params: { from?: string; to?: string; pipelineId?: string }) {
    const where: Record<string, any> = {};
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from);
      if (params.to) where.createdAt.lte = new Date(params.to + 'T23:59:59');
    }
    if (params.pipelineId) where.pipelineId = params.pipelineId;

    const [stages, leads, users] = await Promise.all([
      this.prisma.crmStage.findMany({ orderBy: { order: 'asc' } }),
      this.prisma.lead.findMany({ where }),
      this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);

    const stageList = params.pipelineId ? stages.filter((s) => (s.pipelineId || null) === params.pipelineId) : stages;
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

  // Davr filtri (createdAt/startedAt uchun)
  private range(field: string, from?: string, to?: string): Record<string, any> {
    if (!from && !to) return {};
    const r: Record<string, any> = {};
    if (from) r.gte = new Date(from);
    if (to) r.lte = new Date(to + 'T23:59:59');
    return { [field]: r };
  }

  private async userNames() {
    const users = await this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  // ── Qo'ng'iroqlar hisoboti (CallLog) ──
  async calls(params: { from?: string; to?: string }) {
    const where = this.range('startedAt', params.from, params.to);
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
  async events(params: { from?: string; to?: string; type?: string; userId?: string; limit?: number }) {
    const where: Record<string, any> = { ...this.range('createdAt', params.from, params.to) };
    if (params.type) where.type = params.type;
    if (params.userId) where.actorId = params.userId;

    const [rows, byTypeRaw] = await Promise.all([
      this.prisma.activity.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.min(params.limit || 100, 300) }),
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
  async timeline(params: { from?: string; to?: string; pipelineId?: string; granularity?: string }) {
    const from = params.from ? new Date(params.from) : new Date(Date.now() - 90 * 86400000);
    const to = params.to ? new Date(params.to + 'T23:59:59') : new Date();
    const week = params.granularity === 'week';
    const pipeWhere = params.pipelineId ? { pipelineId: params.pipelineId } : {};

    const [created, wonLeads] = await Promise.all([
      this.prisma.lead.findMany({ where: { ...pipeWhere, createdAt: { gte: from, lte: to } }, select: { createdAt: true } }),
      this.prisma.lead.findMany({ where: { ...pipeWhere, wonAt: { gte: from, lte: to } }, select: { wonAt: true, value: true } }),
    ]);

    // Bucket kaliti (kun yoki hafta boshi)
    const bucketKey = (d: Date) => {
      const x = new Date(d);
      x.setHours(0, 0, 0, 0);
      if (week) x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // dushanba
      return x.toISOString().slice(0, 10);
    };
    const map = new Map<string, { created: number; won: number; wonSum: number }>();
    // Bo'sh bucketlarni ham to'ldiramiz
    for (let d = new Date(bucketKey(from)); d <= to; d.setDate(d.getDate() + (week ? 7 : 1))) {
      map.set(bucketKey(d), { created: 0, won: 0, wonSum: 0 });
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
  async employees(params: { from?: string; to?: string; pipelineId?: string }) {
    const leadWhere: Record<string, any> = { ...this.range('createdAt', params.from, params.to) };
    if (params.pipelineId) leadWhere.pipelineId = params.pipelineId;

    const [stages, leads, nameById, callLogs, tasks, openTasks, notes] = await Promise.all([
      this.prisma.crmStage.findMany({ select: { key: true, kind: true } }),
      this.prisma.lead.findMany({ where: leadWhere }),
      this.userNames(),
      this.prisma.callLog.findMany({ where: this.range('startedAt', params.from, params.to), select: { userId: true } }),
      this.prisma.leadTask.findMany({
        where: { done: true, ...this.range('doneAt', params.from, params.to) },
        select: { assigneeId: true },
      }),
      this.prisma.leadTask.findMany({ where: { done: false }, select: { assigneeId: true } }),
      this.prisma.activity.findMany({ where: { type: 'note', ...this.range('createdAt', params.from, params.to) }, select: { actorId: true } }),
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
