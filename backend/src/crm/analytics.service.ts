import { BadRequestException, Injectable } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RightsService } from '../common/rights/rights.service';
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
// O'rtacha (bo'sh ro'yxat — 0), 1 kasr xonagacha
function avg(xs: number[]): number {
  return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0;
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
  constructor(private readonly prisma: PrismaService, private readonly rights: RightsService) {}

  /**
   * Analitika filtri: bitimlar ro'yxatidagi BARCHA parametrlar (list-query.leadConds) + voronka (pipelineId) + userIds (mas'ullar).
   * `stripDates` — sana bloki tashqarida alohida (timeline/employees) ishlatilganda.
   */
  private async filteredLeads(q: Record<string, any>, userId?: string, stripDates = false): Promise<{ rows: any[]; ctx: LeadCtx }> {
    const [stages, fields] = await Promise.all([
      this.prisma.crmStage.findMany({ select: { key: true, kind: true } }),
      this.prisma.crmField.findMany({ where: { entity: 'lead' }, select: { key: true, type: true } }),
    ]);
    const ctx: LeadCtx = { userId, ownerIds: await this.rights.ownersById(userId, 'leads', 'view'), kinds: new Map(stages.map((s) => [s.key, s.kind])), fields: new Map(fields.map((f) => [f.key, f.type])) };
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

  /**
   * amoCRM ish stoli «filtr vidjeti»: voronka/ro'yxat filtridan yaratilgan vidjet ma'lumoti.
   * view: number (son, summa, davrdagi o'sish) | chart (ko'rsatkich bo'yicha guruhlar, top 5 + «Boshqalar») | list (10 ta bitim).
   * compareBy: stage | assignee | lostReason | cf:<kalit>. from/to — ish stoli davri (o'sish uchun), userIds — «Meniki».
   */
  async widgetData(q: { filter?: string; view?: string; compareBy?: string; from?: string; to?: string; userIds?: string }, userId?: string) {
    let f: Record<string, any> = {};
    try { f = JSON.parse(q.filter || '{}') || {}; } catch { f = {}; }
    if (q.userIds) f.userIds = q.userIds;
    const { rows } = await this.filteredLeads(f, userId);
    const from = q.from ? parseFrom(q.from) : null;
    const to = q.to ? parseTo(q.to) : null;
    const inPeriod = (d: Date) => (!from || d >= from) && (!to || d <= to);
    const sum = (ls: any[]) => ls.reduce((a, l) => a + (Number(l.value) || 0), 0);
    const base = { count: rows.length, sum: sum(rows), delta: rows.filter((l) => inPeriod(new Date(l.createdAt))).length };
    if (q.view === 'list') {
      const stages = await this.prisma.crmStage.findMany({ select: { key: true, name: true, color: true } });
      const st = new Map(stages.map((x) => [x.key, x]));
      const users = await this.prisma.user.findMany({ select: { id: true, name: true } });
      const un = new Map(users.map((u) => [u.id, u.name]));
      const items = [...rows].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 10).map((l) => ({
        id: l.id, name: l.name, value: Number(l.value) || 0, stage: st.get(l.stage)?.name || l.stage, color: st.get(l.stage)?.color || null,
        assignee: l.assigneeId ? un.get(l.assigneeId) || null : null, createdAt: new Date(l.createdAt).toISOString(),
      }));
      return { ...base, items };
    }
    if (q.view !== 'chart') return base;
    const by = q.compareBy || 'stage';
    const groups = new Map<string, { key: string; label: string; color: string | null; rows: any[] }>();
    const add = (key: string, label: string, color: string | null, l: any) => {
      if (!groups.has(key)) groups.set(key, { key, label, color, rows: [] });
      groups.get(key)!.rows.push(l);
    };
    if (by === 'stage') {
      const stages = await this.prisma.crmStage.findMany({ select: { key: true, name: true, color: true } });
      const st = new Map(stages.map((x) => [x.key, x]));
      for (const l of rows) add(l.stage, st.get(l.stage)?.name || l.stage, st.get(l.stage)?.color || null, l);
    } else if (by === 'assignee') {
      const users = await this.prisma.user.findMany({ select: { id: true, name: true } });
      const un = new Map(users.map((u) => [u.id, u.name]));
      for (const l of rows) add(l.assigneeId || '-', l.assigneeId ? un.get(l.assigneeId) || '—' : "Mas'ulsiz", null, l);
    } else if (by === 'lostReason') {
      for (const l of rows) add(l.lostReason || '-', l.lostReason || "Sabab ko'rsatilmagan", null, l);
    } else if (by.startsWith('cf:')) {
      const key = by.slice(3);
      for (const l of rows) {
        let v: any;
        try { v = JSON.parse(l.customJson || '{}')[key]; } catch { v = undefined; }
        const vals = Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v];
        if (!vals.length) add('-', "Qiymat yo'q", null, l);
        for (const x of vals) add(String(x), String(x), null, l);
      }
    }
    const all = [...groups.values()].map((g) => ({ key: g.key, label: g.label, color: g.color, count: g.rows.length, sum: sum(g.rows), delta: g.rows.filter((l) => inPeriod(new Date(l.createdAt))).length }))
      .sort((a, b) => b.count - a.count);
    const top = all.slice(0, 5);
    const rest = all.slice(5);
    return { ...base, groups: top, other: rest.length ? { count: rest.reduce((a, g) => a + g.count, 0), sum: rest.reduce((a, g) => a + g.sum, 0) } : { count: 0, sum: 0 } };
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

  /**
   * Sotuv tahlili pastki bloklari (amoCRM /stats/pipeline):
   *  - flow: tanlangan bitimlar (all | active | closed) har bir bosqichga yetganlar soni/summasi, % va bosqichdagi o'rtacha kunlar;
   *  - unsorted: saralanmagan arizalar — kelganlar (kanal bo'yicha), bitimga o'tganlar, o'rtacha ishlov vaqti;
   *  - forecast: faol bitimlar va 30/60/90 kunlik prognoz (yutish ulushi va o'rtacha sikl bo'yicha).
   * Bosqich tarixi: Activity (stage|won|lost, data.to = bosqich kaliti; eski yozuvlar — "Bosqich: NOM" matni bo'yicha).
   */
  async pipelineFlow(params: Record<string, any>, userId?: string) {
    const pv = pipeVal(params.pipelineId || 'main') ?? null;
    const { rows: leads } = await this.filteredLeads({ ...params, pipelineId: params.pipelineId || 'main' }, userId);
    const stages = await this.prisma.crmStage.findMany({ where: { pipelineId: pv }, orderBy: { order: 'asc' } });
    const open = stages.filter((s) => s.kind === 'open');
    const kindOf = new Map(stages.map((s) => [s.key, s.kind]));
    const orderOf = new Map(open.map((s, i) => [s.key, i]));
    const keyByName = new Map(stages.map((s) => [s.name.toLowerCase(), s.key]));
    const ids = leads.map((l) => l.id);
    const acts = ids.length ? await this.prisma.activity.findMany({
      where: { leadId: { in: ids }, type: { in: ['stage', 'won', 'lost', 'updated'] } },
      orderBy: { createdAt: 'asc' }, select: { leadId: true, type: true, text: true, dataJson: true, createdAt: true },
    }) : [];
    const byLead = new Map<string, typeof acts>();
    for (const a of acts) { const k = a.leadId as string; if (!byLead.has(k)) byLead.set(k, []); byLead.get(k)!.push(a); }
    const stageOfAct = (a: { type: string; text: string | null; dataJson: string }) => {
      try { const d = JSON.parse(a.dataJson || '{}'); if (d.to) return String(d.to); } catch { /* */ }
      const m = /^Bosqich:\s*(.+)$/.exec(a.text || '');
      return m ? keyByName.get(m[1].trim().toLowerCase()) : undefined;
    };
    const DAY = 86400000;
    const now = Date.now();
    type Info = { lead: any; maxOrder: number; unsorted: boolean; acceptedAt?: Date; dwell: Map<string, number> };
    const infos: Info[] = leads.map((l) => {
      const hist = byLead.get(l.id) || [];
      const accepted = hist.find((a) => a.type === 'updated' && /saralanmagandan qabul/i.test(a.text || ''));
      // bosqichlar ketma-ketligi: [bosqich, kirgan vaqt]
      const seq: [string, number][] = [];
      for (const a of hist) { const k = a.type === 'updated' ? undefined : stageOfAct(a); if (k) seq.push([k, a.createdAt.getTime()]); }
      const start = (accepted?.createdAt || l.createdAt).getTime();
      const first = seq.length ? null : l.stage;
      const timeline: [string, number][] = first ? [[first, start]] : seq.length && seq[0][1] > start + 1000 && orderOf.has(seq[0][0]) && (orderOf.get(seq[0][0]) as number) > 0 ? [[open[0]?.key, start], ...seq] : seq;
      const dwell = new Map<string, number>();
      timeline.forEach(([k, at], i) => {
        if (!k || !orderOf.has(k)) return;
        const end = i + 1 < timeline.length ? timeline[i + 1][1] : (kindOf.get(l.stage) === 'open' ? now : at);
        dwell.set(k, (dwell.get(k) || 0) + Math.max(0, end - at));
      });
      const kind = kindOf.get(l.stage) || 'open';
      let maxOrder = -1;
      for (const [k] of timeline) if (orderOf.has(k)) maxOrder = Math.max(maxOrder, orderOf.get(k) as number);
      if (kind === 'open' && orderOf.has(l.stage)) maxOrder = Math.max(maxOrder, orderOf.get(l.stage) as number);
      if (kind === 'won') maxOrder = open.length - 1;
      if (maxOrder < 0) maxOrder = 0;
      return { lead: l, maxOrder, unsorted: !!accepted || !!l.formId, acceptedAt: accepted?.createdAt, dwell };
    });

    const tabOf = (i: Info) => (kindOf.get(i.lead.stage) === 'won' || kindOf.get(i.lead.stage) === 'lost' ? 'closed' : 'active');
    const flow: Record<string, any> = {};
    for (const tab of ['all', 'active', 'closed'] as const) {
      const set = infos.filter((i) => tab === 'all' || tabOf(i) === tab);
      const total = set.length;
      const row = (list: Info[]) => ({ count: list.length, sum: list.reduce((a, i) => a + (i.lead.value || 0), 0), pct: total ? Math.round((list.length / total) * 100) : 0 });
      const unsortedList = set.filter((i) => i.unsorted);
      flow[tab] = {
        total,
        unsorted: { ...row(unsortedList), avgDays: avg(unsortedList.filter((i) => i.acceptedAt).map((i) => (i.acceptedAt!.getTime() - i.lead.createdAt.getTime()) / DAY)) },
        stages: open.map((s, idx) => {
          const reached = set.filter((i) => i.maxOrder >= idx)
          return { key: s.key, ...row(reached), avgDays: avg(reached.map((i) => (i.dwell.get(s.key) || 0) / DAY).filter((d) => d > 0)) };
        }),
        won: row(set.filter((i) => kindOf.get(i.lead.stage) === 'won')),
        lost: row(set.filter((i) => kindOf.get(i.lead.stage) === 'lost')),
        avgDays: avg(set.map((i) => {
          const end = i.lead.wonAt || i.lead.lostAt || null;
          return ((end ? new Date(end).getTime() : now) - i.lead.createdAt.getTime()) / DAY;
        })),
      };
    }

    // Saralanmagan arizalar: davrda kelganlar (hozir saralanmaganlar + qabul qilinganlar), kanal bo'yicha
    const { from, to } = dateRangeOf(params);
    const inRange = (d: Date) => (!from || d >= from) && (!to || d < to);
    const pending = await this.prisma.lead.findMany({ where: { unsorted: true, pipelineId: pv }, select: { createdAt: true, source: true, formId: true } });
    const acceptedLeads = infos.filter((i) => i.acceptedAt);
    const chanOf = (src: string | null, formId: string | null) => {
      const t = String(src || '').toLowerCase();
      if (/qo.ng.iroq|telefon|phone|call|звон/.test(t)) return 'phone';
      if (/telegram|instagram|chat|whatsapp|messenger|чат/.test(t)) return 'chat';
      if (formId || /forma|form|sayt|web|facebook|meta|google|lead ads/.test(t)) return 'form';
      return 'other';
    };
    const incoming = [
      ...pending.filter((p) => inRange(p.createdAt)).map((p) => chanOf(p.source, p.formId)),
      ...acceptedLeads.filter((i) => inRange(i.lead.createdAt)).map((i) => chanOf(i.lead.source, i.lead.formId)),
    ];
    const byChannel: Record<string, number> = {};
    for (const c of incoming) byChannel[c] = (byChannel[c] || 0) + 1;
    const unsorted = {
      incoming: incoming.length,
      byChannel,
      converted: acceptedLeads.filter((i) => inRange(i.lead.createdAt)).length,
      avgDays: avg(acceptedLeads.map((i) => (i.acceptedAt!.getTime() - i.lead.createdAt.getTime()) / DAY)),
    };

    // Prognoz: faol bitimlar × yutish ulushi; yopilish kutilgan sana = yaratilgan + o'rtacha sikl
    const closed = infos.filter((i) => tabOf(i) === 'closed');
    const won = closed.filter((i) => kindOf.get(i.lead.stage) === 'won');
    const winRate = closed.length ? won.length / closed.length : 0;
    const cycle = avg(won.filter((i) => i.lead.wonAt).map((i) => (new Date(i.lead.wonAt).getTime() - i.lead.createdAt.getTime()) / DAY)) || 30;
    const active = infos.filter((i) => tabOf(i) === 'active');
    // Har oyna alohida: 30 kungacha (muddati o'tganlar ham shu yerda), 30–60, 60–90 kun
    const horizon = (days: number) => {
      const lo = days === 30 ? -Infinity : now + (days - 30) * DAY;
      const due = active.filter((i) => { const d = i.lead.createdAt.getTime() + cycle * DAY; return d > lo && d <= now + days * DAY; });
      return { count: Math.round(due.length * winRate), sum: Math.round(due.reduce((a, i) => a + (i.lead.value || 0), 0) * winRate) };
    };
    const forecast = {
      enough: won.length >= 5, // amoCRM: kam ma'lumotda "Мало данных для построения графика"
      active: { count: active.length, sum: active.reduce((a, i) => a + (i.lead.value || 0), 0) },
      d30: horizon(30), d60: horizon(60), d90: horizon(90),
      cycleDays: Math.round(cycle),
      winRate: Math.round(winRate * 100),
    };
    return { stages: open.map((s) => ({ key: s.key, name: s.name, color: s.color })), flow, unsorted, forecast };
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
  /**
   * amoCRM «Аналитика → Список событий»: bitim faoliyati + qo'ng'iroqlar (Входящий/Исходящий звонок) + chat xabarlari
   * (Входящее/Исходящее сообщение) + yopilgan suhbatlar (Беседа закрыта) — bitta lentada, eng yangisi birinchi.
   * Filtrlar (amoCRM kabi): preset (all|mine|today|yesterday|month), davr, menejerlar, obyekt, voqea turlari, «значение до/после».
   */
  async events(params: {
    from?: string; to?: string; datePreset?: string; preset?: string; type?: string; types?: string; userId?: string; userIds?: string;
    entity?: string; before?: string; after?: string; limit?: number; me?: string;
  }) {
    const limit = Math.min(Math.max(Math.floor(params.limit || 0) || 100, 1), 300);
    const preset = params.preset || '';
    const datePreset = preset === 'today' ? 'today' : preset === 'yesterday' ? 'yesterday' : preset === 'month' ? 'this_month' : params.datePreset;
    const rangeOf = (field: string) => this.range(field, { from: params.from, to: params.to, datePreset });
    const users = (params.userIds || params.userId || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (preset === 'mine' && params.me) users.splice(0, users.length, params.me);
    const typeList = (params.types || params.type || '').split(',').map((x) => x.trim()).filter(Boolean);
    const want = (t: string) => !typeList.length || typeList.includes(t);
    const entity = params.entity || '';
    const isTaskType = (t: string) => t.startsWith('task_');
    const okEntity = (t: string) => !entity || (entity === 'task' ? isTaskType(t) : entity === 'lead' ? !isTaskType(t) : true);
    const CALL_TYPES = ['call_in', 'call_out'], MSG_TYPES = ['message_in', 'message_out'];

    // 1) bitim faoliyati
    const actWhere: Record<string, any> = { ...rangeOf('createdAt') };
    if (users.length) actWhere.actorId = { in: users };
    // «email» — chat xabarlari jurnali: xabarlar o'z manbasidan chiqadi (takrorlanmasin); suhbat yopilishi faoliyatdan «Беседа закрыта»
    const actTypes = typeList.filter((t) => ![...CALL_TYPES, ...MSG_TYPES, 'conv_closed', 'email'].includes(t) && okEntity(t));
    if (typeList.includes('conv_closed') && entity !== 'task') actTypes.push('updated');
    const and: any[] = [{ type: { not: 'email' } }];
    if (typeList.length) and.push({ type: { in: actTypes.length ? actTypes : ['__none__'] } });
    else if (entity === 'task') and.push({ type: { startsWith: 'task_' } });
    else if (entity === 'lead') and.push({ NOT: { type: { startsWith: 'task_' } } });
    // «updated» faqat suhbat yopilishi uchun so'ralgan bo'lsa — boshqa «updated» yozuvlari chiqmasin
    if (typeList.includes('conv_closed') && !typeList.includes('updated')) and.push({ OR: [{ type: { not: 'updated' } }, { text: 'Suhbat yopildi' }] });
    actWhere.AND = and;
    // 2) qo'ng'iroqlar  3) xabarlar  4) yopilgan suhbatlar — obyekti «Сделка» (vazifa filtrida chiqmaydi)
    const callDirs = entity === 'task' ? [] : [want('call_in') && 'in', want('call_out') && 'out'].filter(Boolean) as string[];
    const msgDirs = entity === 'task' ? [] : [want('message_in') && 'in', want('message_out') && 'out'].filter(Boolean) as string[];
    const callWhere: Record<string, any> = { ...rangeOf('startedAt'), direction: { in: callDirs }, status: { not: 'ringing' } };
    if (users.length) callWhere.userId = { in: users };
    // xabar muallifi (xodim) bazada saqlanmaydi — menejer filtri bo'lsa xabarlar chiqmaydi
    const msgWhere: Record<string, any> = { ...rangeOf('createdAt'), direction: { in: users.length ? [] : msgDirs } };

    const [acts, calls, msgs, actCount, callCount, msgCount, byTypeRaw] = await Promise.all([
      this.prisma.activity.findMany({ where: actWhere, orderBy: { createdAt: 'desc' }, take: limit }),
      callDirs.length ? this.prisma.callLog.findMany({ where: callWhere, orderBy: { startedAt: 'desc' }, take: limit }) : [],
      msgDirs.length && !users.length ? this.prisma.message.findMany({ where: msgWhere, orderBy: { createdAt: 'desc' }, take: limit }) : [],
      this.prisma.activity.count({ where: actWhere }),
      callDirs.length ? this.prisma.callLog.count({ where: callWhere }) : 0,
      msgDirs.length && !users.length ? this.prisma.message.count({ where: msgWhere }) : 0,
      this.prisma.activity.groupBy({ by: ['type'], where: actWhere, _count: { _all: true } }),
    ]);

    const leadIds = [...new Set([...acts, ...calls, ...msgs].map((r: any) => r.leadId).filter((x): x is string => !!x))];
    const userIds = [...new Set(calls.map((c) => c.userId).filter((x): x is string => !!x))];
    const [leads, people] = await Promise.all([
      leadIds.length ? this.prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } }) : [],
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    ]);
    const leadName = new Map<string, string>(leads.map((l: { id: string; name: string }) => [l.id, l.name] as [string, string]));
    const userName = new Map<string, string>(people.map((u: { id: string; name: string }) => [u.id, u.name] as [string, string]));
    const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

    const items: any[] = [
      ...acts.map((r) => ({
        id: r.id, type: r.type === 'updated' && r.text === 'Suhbat yopildi' ? 'conv_closed' : r.type, entity: isTaskType(r.type) ? 'task' : 'lead', text: r.text || '', actorName: r.actorName || '',
        leadId: r.leadId, createdAt: r.createdAt,
        ...(() => {
          try {
            const d = JSON.parse(r.dataJson || '{}');
            // ichki chat: «Значение после» — xabar matni, oluvchi nomi «Название» yonida emas, matn oldida
            if (r.type === 'team_chat') return { text: `→ ${d.toName || '—'}: ${r.text || ''}` };
            if (r.type === 'created') return { text: '' }; // amoCRM: «Новая сделка» — qiymat ustunlari bo'sh
            if (d.fromName !== undefined || d.toName !== undefined) return { from: d.fromName || '', to: d.toName || '', fieldLabel: 'Bosqich' };
            if (d.label) return { from: d.from ?? '', to: d.to ?? '', fieldLabel: d.label };
          } catch { /* */ }
          return {};
        })(),
      })),
      ...calls.map((c) => {
        const who = c.userId ? userName.get(c.userId) || '' : '';
        return {
          id: `call:${c.id}`, type: c.direction === 'in' ? 'call_in' : 'call_out', entity: 'lead', leadId: c.leadId, createdAt: c.startedAt,
          actorName: who || 'OnlinePBX',
          // amoCRM: «00:31 998909656655 к CLOSER | DIYORBEK»
          text: `${mmss(c.durationSec || 0)} ${c.phone}${who ? ` ${c.direction === 'in' ? '→' : '←'} ${who}` : ''}`,
          call: { id: c.id, status: c.status, durationSec: c.durationSec, phone: c.phone, hasRecording: !!(c.externalId || c.recordUrl) },
        };
      }),
      ...msgs.map((m) => ({
        id: `msg:${m.id}`, type: m.direction === 'in' ? 'message_in' : 'message_out', entity: 'lead', leadId: m.leadId, createdAt: m.createdAt,
        actorName: m.direction === 'in' ? m.senderName || '' : m.senderName || '', text: m.text.slice(0, 300), channel: m.channel,
      })),
    ];
    const has = (v: unknown, q?: string) => !q || String(v ?? '').toLowerCase().includes(q.toLowerCase());
    const filtered = items
      .filter((x) => has(x.from, params.before) && has(x.to ?? x.text, params.after))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, limit)
      .map((x) => ({ ...x, createdAt: new Date(x.createdAt).toISOString(), leadName: x.leadId ? leadName.get(x.leadId) || null : null }));

    const byType = [
      ...byTypeRaw.map((g) => ({ type: g.type, count: g._count._all })),
      ...(callCount ? [{ type: 'calls', count: callCount }] : []),
      ...(msgCount ? [{ type: 'messages', count: msgCount }] : []),
    ].sort((a, b) => b.count - a.count);
    return { items: filtered, total: actCount + callCount + msgCount, byType };
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
