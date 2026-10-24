import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { NotificationService } from './notification.service';
import { TelegramClient } from './telegram.client';
import { assertSafeWebhookUrl, webhookUrlProblem } from './webhook-guard';

type Cond = { field: string; op?: string; value?: any; from?: number | string; to?: number | string };
type Action = Record<string, any> & { type: string };

function parse<T>(s: string | null | undefined, fb: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fb; }
}

// Trigger turlari. Hodisa (event) bilan ishga tushadiganlar va vaqt (cron tick) bilan ishlaydiganlar.
export const EVENT_TRIGGERS = ['lead_created', 'stage_enter', 'created_or_enter', 'assignee_changed', 'conversation_created', 'message_in', 'call_in'];
export const TIME_TRIGGERS = ['no_reply_hours', 'before_date_field', 'exact_time', 'daily'];
const ALL_TRIGGERS = [...EVENT_TRIGGERS, ...TIME_TRIGGERS];
// Bosqichsiz (stageKey = null → "Saralanmagan" ustuni) bo'lishi mumkin bo'lmagan triggerlar
const NEED_STAGE = ['stage_enter', 'created_or_enter', 'before_date_field', 'exact_time', 'daily'];
const ACTION_TYPES = [
  'create_task', 'create_lead', 'webhook', 'change_stage', 'edit_tags', 'complete_tasks', 'change_assignee', 'change_field', 'send_message',
  // eski (legacy) nomlar — ishlashda davom etadi
  'add_tag', 'remove_tag', 'set_assignee', 'set_field', 'add_note', 'notify',
];
// event → shu event bilan ishga tushadigan trigger turlari
const EVENT_MATCH: Record<string, string[]> = {
  lead_created: ['lead_created', 'created_or_enter'],
  stage_enter: ['stage_enter', 'created_or_enter'],
  assignee_changed: ['assignee_changed'],
  conversation_created: ['conversation_created'],
  message_in: ['message_in'],
  call_in: ['call_in'],
};
const MAX_DEPTH = 5; // change_stage → stage_enter zanjiri chuqurligi

const BIZ_OFFSET_MS = 5 * 3600_000; // biznes vaqti UTC+5 (CRM bo'ylab)

type Ctx = { a: any; actorName?: string; depth: number };

/**
 * Digital Pipeline dvigateli: hodisa → shartlar → (kechikish navbati) → amallar.
 * Vaqt triggerlari (aniq vaqt, har kuni, sana maydonidan oldin, javobsiz soatlar) har daqiqada tick() orqali.
 */
@Injectable()
export class AutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutomationService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notif: NotificationService,
    private readonly tg: TelegramClient,
  ) {}

  onModuleInit() {
    setTimeout(() => this.tick().catch(() => {}), 20_000).unref?.();
    this.timer = setInterval(() => this.tick().catch(() => {}), 60_000);
    this.timer.unref?.();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ── CRUD ──
  async list() {
    const items = await this.prisma.automation.findMany({ orderBy: [{ order: 'asc' }, { createdAt: 'asc' }] });
    return { automations: items.map((a) => this.view(a)) };
  }
  private view(a: any) {
    return {
      id: a.id,
      name: a.name,
      pipelineId: a.pipelineId,
      trigger: a.trigger,
      stageKey: a.stageKey,
      conditions: parse<Cond[]>(a.conditionsJson, []),
      actions: parse<Action[]>(a.actionsJson, []),
      delay: a.delay,
      schedule: parse<Record<string, any>>(a.scheduleJson, {}),
      lastRunAt: a.lastRunAt ? a.lastRunAt.toISOString() : null,
      active: a.active,
      order: a.order,
    };
  }
  private bad(message: string) {
    return new BadRequestException({ error: 'BAD_AUTOMATION', message });
  }
  private checkTrigger(trigger?: string) {
    if (trigger !== undefined && !ALL_TRIGGERS.includes(trigger)) throw this.bad(`Noma'lum trigger: ${trigger}`);
  }
  private cleanDelay(v: unknown): number {
    const n = Math.round(Number(v) || 0);
    return Math.max(0, Math.min(n, 60 * 24 * 365));
  }
  private cleanActions(actions: unknown): Action[] {
    if (!Array.isArray(actions)) return [];
    const out: Action[] = [];
    for (const raw of actions) {
      if (!raw || typeof raw !== 'object' || !ACTION_TYPES.includes((raw as any).type)) throw this.bad(`Noma'lum amal: ${(raw as any)?.type}`);
      const act = raw as Action;
      if (act.type === 'webhook') {
        const pr = webhookUrlProblem(act.url);
        if (pr) throw this.bad(`Webhook URL: ${pr}`);
        act.url = String(act.url).trim();
      }
      out.push(act);
    }
    return out;
  }
  private checkSchedule(trigger: string, sch: Record<string, any>) {
    if (trigger === 'no_reply_hours' && !(Number(sch.hours) > 0)) throw this.bad("Soat soni ko'rsatilmagan");
    if (trigger === 'before_date_field' && (!sch.field || !(Number(sch.hours) >= 0))) throw this.bad("Sana maydoni va soat soni kerak");
    if (trigger === 'exact_time' && isNaN(new Date(sch.at).getTime())) throw this.bad("Aniq vaqt noto'g'ri");
    if (trigger === 'daily' && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(String(sch.time || ''))) throw this.bad("Vaqt noto'g'ri (HH:MM)");
  }
  // "Har kuni" triggeri yaratilganda bugungi vaqti allaqachon o'tgan bo'lsa — darhol ishlab ketmasin
  private dailyBaseline(trigger: string, sch: Record<string, any>): Date | null {
    if (trigger !== 'daily') return null;
    const sched = this.dailyScheduled(String(sch.time), new Date());
    return sched && sched.getTime() <= Date.now() ? new Date() : null;
  }
  async create(dto: any, userId?: string) {
    const trigger = dto.trigger || 'stage_enter';
    this.checkTrigger(trigger);
    if (NEED_STAGE.includes(trigger) && !dto.stageKey) throw this.bad("Bosqich ko'rsatilmagan");
    const schedule = dto.schedule && typeof dto.schedule === 'object' ? dto.schedule : {};
    this.checkSchedule(trigger, schedule);
    const a = await this.prisma.automation.create({
      data: {
        name: String(dto.name || 'Avtomatlashtirish').trim().slice(0, 200) || 'Avtomatlashtirish',
        pipelineId: dto.pipelineId && dto.pipelineId !== 'main' ? dto.pipelineId : null,
        trigger,
        stageKey: dto.stageKey || null,
        conditionsJson: JSON.stringify(Array.isArray(dto.conditions) ? dto.conditions : []),
        actionsJson: JSON.stringify(this.cleanActions(dto.actions)),
        delay: this.cleanDelay(dto.delay),
        scheduleJson: JSON.stringify(schedule),
        lastRunAt: this.dailyBaseline(trigger, schedule),
        active: dto.active !== false,
        order: Number(dto.order) || 0,
        createdById: userId || null,
      },
    });
    return { automation: this.view(a) };
  }
  async update(id: string, dto: any) {
    this.checkTrigger(dto.trigger);
    const cur = await this.prisma.automation.findUnique({ where: { id } });
    if (!cur) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Avtomatlashtirish topilmadi' });
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = String(dto.name).trim().slice(0, 200) || 'Avtomatlashtirish';
    if (dto.pipelineId !== undefined) data.pipelineId = dto.pipelineId && dto.pipelineId !== 'main' ? dto.pipelineId : null;
    if (dto.trigger !== undefined) data.trigger = dto.trigger;
    if (dto.stageKey !== undefined) data.stageKey = dto.stageKey || null;
    if (dto.conditions !== undefined) data.conditionsJson = JSON.stringify(Array.isArray(dto.conditions) ? dto.conditions : []);
    if (dto.actions !== undefined) data.actionsJson = JSON.stringify(this.cleanActions(dto.actions));
    if (dto.delay !== undefined) data.delay = this.cleanDelay(dto.delay);
    if (dto.schedule !== undefined) data.scheduleJson = JSON.stringify(dto.schedule && typeof dto.schedule === 'object' ? dto.schedule : {});
    if (dto.active !== undefined) data.active = !!dto.active;
    if (dto.order !== undefined) data.order = Number(dto.order) || 0;
    const trigger = (data.trigger as string) ?? cur.trigger;
    const stageKey = data.stageKey !== undefined ? (data.stageKey as string | null) : cur.stageKey;
    const schedule = parse<Record<string, any>>((data.scheduleJson as string) ?? cur.scheduleJson, {});
    if (NEED_STAGE.includes(trigger) && !stageKey) throw this.bad("Bosqich ko'rsatilmagan");
    this.checkSchedule(trigger, schedule);
    if (data.trigger !== undefined || data.scheduleJson !== undefined) data.lastRunAt = this.dailyBaseline(trigger, schedule);
    const a = await this.prisma.automation.update({ where: { id }, data });
    return { automation: this.view(a) };
  }
  async remove(id: string) {
    if (!(await this.prisma.automation.findUnique({ where: { id }, select: { id: true } })))
      throw new NotFoundException({ error: 'NOT_FOUND', message: 'Avtomatlashtirish topilmadi' });
    await this.prisma.automation.delete({ where: { id } }); // navbat yozuvlari cascade bilan o'chadi
    return { ok: true };
  }

  // ── Hodisa kirishi ──
  /** Eski chaqiruvlar bilan moslik: run('stage_enter' | 'lead_created', leadId, actorName). */
  async run(trigger: string, leadId: string, actorName?: string) {
    return this.fire(trigger, leadId, { actorName });
  }

  async fire(event: string, leadId: string, opts: { actorName?: string; depth?: number } = {}) {
    const depth = opts.depth ?? 0;
    try {
      if (depth > MAX_DEPTH) { this.logger.warn(`Avtomatlashtirish zanjiri chuqurligi ${MAX_DEPTH} dan oshdi (${event}, ${leadId}) — to'xtatildi`); return; }
      const triggers = EVENT_MATCH[event];
      if (!triggers) return;
      const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return;
      const all = await this.prisma.automation.findMany({ where: { active: true, trigger: { in: triggers } }, orderBy: { order: 'asc' } });
      for (const a of all) {
        if (!this.inScope(a, lead)) continue;
        if (!this.matches(parse<Cond[]>(a.conditionsJson, []), lead)) continue;
        if (a.delay > 0) {
          await this.prisma.automationJob.create({ data: { automationId: a.id, leadId, runAt: new Date(Date.now() + a.delay * 60_000), depth } });
          continue;
        }
        await this.execute(a, leadId, opts.actorName, depth);
      }
    } catch (e) {
      this.logger.warn('Automation fire xato: ' + (e as Error).message);
    }
  }

  // bosqich bo'yicha (stageKey) yoki "Saralanmagan" ustuni uchun voronka bo'yicha moslik
  private inScope(a: any, lead: any): boolean {
    if (a.stageKey) return a.stageKey === lead.stage;
    return (a.pipelineId || null) === (lead.pipelineId || null);
  }

  // ── Shartlar ──
  private matches(conds: Cond[], lead: any): boolean {
    const tags = parse<string[]>(lead.tagsJson, []);
    const custom = parse<Record<string, unknown>>(lead.customJson, {});
    for (const c of conds) {
      const field = String(c.field || '');
      const isEmpty = (x: unknown) => x === undefined || x === null || String(x).trim() === '';
      // Yangi (amoCRM) shakli
      if (!c.op || c.op === 'any') {
        const list = Array.isArray(c.value) ? c.value.map(String) : c.value !== undefined && c.value !== '' && c.value !== null ? [String(c.value)] : [];
        if (field === 'tags' || field === 'tag') {
          if (list.length && !list.some((t) => tags.includes(t))) return false;
        } else if (field === 'assignee') {
          if (list.length && !list.includes(String(lead.assigneeId || ''))) return false;
        } else if (field === 'budget') {
          const from = c.from === undefined || c.from === '' || c.from === null ? null : Number(c.from);
          const to = c.to === undefined || c.to === '' || c.to === null ? null : Number(c.to);
          if (from !== null && !(lead.value >= from)) return false;
          if (to !== null && !(lead.value <= to)) return false;
        } else if (field === 'source') {
          if (list.length && !list.some((s) => s.toLowerCase() === String(lead.source || '').toLowerCase())) return false;
        } else {
          const key = field.startsWith('cf:') ? field.slice(3) : field; // utm_* va custom maydonlar customJson'da
          const v = custom[key];
          if (list.length) {
            const sv = String(v ?? '').toLowerCase();
            if (!list.some((x) => sv === x.toLowerCase() || (typeof c.value === 'string' && sv.includes(x.toLowerCase())))) return false;
          }
        }
        continue;
      }
      // Eski (legacy) operatorli shart
      let v: any;
      if (field === 'tag') v = tags;
      else if (field === 'custom') v = custom;
      else v = lead[field];
      const target = String(c.value ?? '');
      switch (c.op) {
        case 'eq': if (String(v ?? '') !== target) return false; break;
        case 'ne': if (String(v ?? '') === target) return false; break;
        case 'gt': if (!(Number(v) > Number(target))) return false; break;
        case 'lt': if (!(Number(v) < Number(target))) return false; break;
        case 'contains': if (!String(v ?? '').toLowerCase().includes(target.toLowerCase())) return false; break;
        case 'empty': if (!isEmpty(v)) return false; break;
        case 'not_empty': if (isEmpty(v)) return false; break;
        case 'has_tag': if (!tags.includes(target)) return false; break;
        default: break;
      }
    }
    return true;
  }

  // ── Bajarish ──
  private async execute(a: any, leadId: string, actorName?: string, depth = 0) {
    const actions = parse<Action[]>(a.actionsJson, []);
    const ctx: Ctx = { a, actorName, depth };
    let failed = 0;
    for (const act of actions) {
      try {
        const detail = await this.exec(act, leadId, ctx);
        if (detail) await this.log(leadId, a, detail);
      } catch (e) { // bitta amal xatosi qolganlarini to'xtatmasin
        failed++;
        const msg = (e as Error).message;
        this.logger.warn(`Action "${act?.type}" xato: ${msg}`);
        await this.log(leadId, a, `${act?.type}: xato — ${msg}`);
      }
    }
    return { failed, total: actions.length };
  }

  private async log(leadId: string, a: any, detail: string) {
    await this.activity.record(leadId, 'automation', {
      actorName: 'Avtomatlashtirish',
      text: `Avtomatlashtirish: ${a.name} — ${detail}`,
      data: { automationId: a.id },
    });
  }

  private tpl(s: unknown, lead: any): string {
    return String(s ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => {
      const map: Record<string, unknown> = { name: lead.name, phone: lead.phone, email: lead.email, company: lead.company, budget: lead.value, value: lead.value, source: lead.source };
      return String(map[k] ?? '');
    });
  }

  private endOfBizDay(): Date {
    const biz = new Date(Date.now() + BIZ_OFFSET_MS).toISOString().slice(0, 10);
    return new Date(`${biz}T23:59:59+05:00`);
  }

  private async userExists(id: string): Promise<boolean> {
    return !!(await this.prisma.user.findFirst({ where: { id: String(id), isActive: true }, select: { id: true } }));
  }

  private async nextQueue(stage: string) {
    const m = await this.prisma.lead.aggregate({ where: { stage }, _max: { queue: true } });
    return (m._max.queue ?? -1) + 1;
  }

  private async exec(act: Action, leadId: string, ctx: Ctx): Promise<string | null> {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return null;
    switch (act.type) {
      case 'create_task': {
        const text = this.tpl(act.text ?? act.title, lead).trim() || 'Avtomatik vazifa';
        const n = Number(act.dueValue);
        let dueDate: Date | null;
        if (act.dueMode === 'end_of_day') dueDate = this.endOfBizDay();
        else if (act.dueMode === 'days') dueDate = new Date(Date.now() + (Number.isFinite(n) ? n : 0) * 86_400_000);
        else if (act.dueMode === 'hours') dueDate = new Date(Date.now() + (Number.isFinite(n) ? n : 0) * 3_600_000);
        else if (act.dueMode === 'now') dueDate = new Date();
        else if (Number.isFinite(Number(act.dueInDays)) && act.dueInDays !== undefined && act.dueInDays !== '') dueDate = new Date(Date.now() + Number(act.dueInDays) * 86_400_000);
        else dueDate = new Date();
        let assigneeId = !act.assignee || act.assignee === 'lead' ? lead.assigneeId : act.assignee;
        if (assigneeId && assigneeId !== lead.assigneeId && !(await this.userExists(assigneeId))) assigneeId = lead.assigneeId;
        const t = await this.prisma.leadTask.create({
          data: { leadId, title: text.slice(0, 1000), type: act.taskType || 'task', dueDate, assigneeId: assigneeId || null },
        });
        if (t.assigneeId) await this.notif.notify(t.assigneeId, `Avtomatik vazifa: ${t.title}`, { type: 'task', link: `/leads/detail/${leadId}` });
        return `vazifa "${t.title}" yaratildi`;
      }
      case 'create_lead': {
        const pid = act.pipelineId && act.pipelineId !== 'main' ? String(act.pipelineId) : null;
        const stages = await this.prisma.crmStage.findMany({ where: { pipelineId: pid }, orderBy: { order: 'asc' } });
        const stage = stages.find((s) => s.key === act.stageKey) || stages.find((s) => s.kind === 'open');
        if (!stage) throw new Error('Maqsad bosqich topilmadi');
        let assigneeId = !act.assignee || act.assignee === 'lead' ? lead.assigneeId : act.assignee;
        if (assigneeId && assigneeId !== lead.assigneeId && !(await this.userExists(assigneeId))) assigneeId = lead.assigneeId;
        const created = await this.prisma.lead.create({
          data: {
            name: this.tpl(act.name, lead).trim() || lead.name,
            phone: lead.phone, email: lead.email, company: lead.company, companyId: lead.companyId,
            contactId: act.withContact === false ? null : lead.contactId, // kontakt bilan
            source: lead.source,
            value: act.copyBudget ? lead.value : Number(act.value) || 0,
            tagsJson: act.copyTags ? lead.tagsJson : '[]',
            stage: stage.key, pipelineId: stage.pipelineId || null,
            assigneeId: assigneeId || null,
            queue: await this.nextQueue(stage.key),
          },
        });
        await this.activity.record(created.id, 'created', { actorName: 'Avtomatlashtirish', text: `Avtomatlashtirish: ${ctx.a.name} — bitim "${lead.name}" asosida yaratildi` });
        if (created.assigneeId) await this.notif.notify(created.assigneeId, `Yangi bitim biriktirildi: ${created.name}`, { type: 'lead', link: `/leads/detail/${created.id}` });
        await this.fire('lead_created', created.id, { actorName: ctx.actorName, depth: ctx.depth + 1 });
        return `yangi bitim "${created.name}" yaratildi (${stage.name})`;
      }
      case 'webhook': {
        const url = await assertSafeWebhookUrl(act.url); // SSRF himoyasi
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          redirect: 'manual', // redirect orqali ichki manzilga o'tib ketmasin
          signal: AbortSignal.timeout(8000),
          body: JSON.stringify({
            rule: ctx.a.name,
            event: ctx.a.trigger,
            at: new Date().toISOString(),
            lead: {
              id: lead.id, name: lead.name, phone: lead.phone, email: lead.email, company: lead.company, source: lead.source,
              stage: lead.stage, pipelineId: lead.pipelineId, value: lead.value, assigneeId: lead.assigneeId,
              tags: parse<string[]>(lead.tagsJson, []), custom: parse<Record<string, unknown>>(lead.customJson, {}),
            },
          }),
        });
        return `webhook yuborildi (HTTP ${res.status})`;
      }
      case 'change_stage': {
        const target = await this.prisma.crmStage.findUnique({ where: { key: String(act.stageKey || '') } });
        if (!target) throw new Error('Maqsad bosqich topilmadi');
        if (target.key === lead.stage) return null;
        const data: Record<string, unknown> = { stage: target.key, pipelineId: target.pipelineId || null, unsorted: false, queue: await this.nextQueue(target.key) };
        if (target.kind === 'won') { data.wonAt = new Date(); data.lostAt = null; }
        else if (target.kind === 'lost') { data.lostAt = new Date(); data.wonAt = null; }
        else { data.wonAt = null; data.lostAt = null; }
        await this.prisma.lead.update({ where: { id: leadId }, data });
        await this.activity.record(leadId, target.kind === 'won' || target.kind === 'lost' ? target.kind : 'stage', { actorName: 'Avtomatlashtirish', text: `Bosqich: ${target.name}`, data: { to: target.key } });
        await this.fire('stage_enter', leadId, { actorName: ctx.actorName, depth: ctx.depth + 1 });
        return `bosqich o'zgartirildi: ${target.name}`;
      }
      case 'edit_tags':
      case 'add_tag':
      case 'remove_tag': {
        const add: string[] = act.type === 'add_tag' ? [act.tag] : Array.isArray(act.add) ? act.add : [];
        const rem: string[] = act.type === 'remove_tag' ? [act.tag] : Array.isArray(act.remove) ? act.remove : [];
        const clean = (xs: unknown[]) => xs.map((x) => String(x ?? '').trim()).filter(Boolean);
        const a2 = clean(add), r2 = clean(rem);
        if (!a2.length && !r2.length) return null;
        const tags = parse<string[]>(lead.tagsJson, []);
        const next = [...new Set([...tags, ...a2])].filter((x) => !r2.includes(x));
        await this.prisma.lead.update({ where: { id: leadId }, data: { tagsJson: JSON.stringify(next) } });
        for (const name of a2) await this.prisma.crmTag.upsert({ where: { name }, create: { name }, update: {} }).catch(() => {});
        return [a2.length ? `teg qo'shildi: ${a2.join(', ')}` : '', r2.length ? `teg olib tashlandi: ${r2.join(', ')}` : ''].filter(Boolean).join('; ');
      }
      case 'complete_tasks': {
        const open = await this.prisma.leadTask.findMany({ where: { leadId, done: false } });
        if (!open.length) return 'ochiq vazifalar yo\'q';
        const result = this.tpl(act.result, lead).trim() || null;
        await this.prisma.leadTask.updateMany({ where: { id: { in: open.map((t) => t.id) } }, data: { done: true, doneAt: new Date(), result } });
        await this.activity.record(leadId, 'task_done', { actorName: 'Avtomatlashtirish', text: `Vazifalar yakunlandi (${open.length})${result ? ` — ${result}` : ''}` });
        return `${open.length} ta vazifa yakunlandi${result ? ` (${result})` : ''}`;
      }
      case 'change_assignee':
      case 'set_assignee': {
        let ids: string[] = Array.isArray(act.userIds) ? act.userIds.map(String) : [];
        if (!ids.length && act.userId) ids = [String(act.userId)];
        const legacy = act.assignee;
        let assignee: string | null = null;
        if (act.type === 'set_assignee' && legacy && legacy !== 'round_robin') ids = [String(legacy)];
        const queueMode = act.mode === 'queue' || legacy === 'round_robin' || ids.length > 1;
        if (queueMode || (act.type === 'set_assignee' && legacy === 'round_robin')) assignee = await this.queuePick(ctx.a.id, ids);
        else assignee = ids[0] || null;
        if (!assignee || !(await this.userExists(assignee))) throw new Error('Mas\'ul topilmadi');
        if (assignee === lead.assigneeId) return null;
        const u = await this.prisma.user.findUnique({ where: { id: assignee }, select: { name: true } });
        await this.prisma.lead.update({ where: { id: leadId }, data: { assigneeId: assignee } });
        await this.notif.notify(assignee, `Sizga lid biriktirildi: ${lead.name}`, { type: 'lead', link: `/leads/detail/${leadId}` });
        await this.log(leadId, ctx.a, `mas'ul o'zgartirildi: ${u?.name || assignee}`);
        await this.fire('assignee_changed', leadId, { actorName: ctx.actorName, depth: ctx.depth + 1 });
        return null; // allaqachon yozildi (zanjir tartibini saqlash uchun)
      }
      case 'change_field':
      case 'set_field': {
        const field = String(act.field || '');
        if (!field) throw new Error('Maydon ko\'rsatilmagan');
        const raw = typeof act.value === 'string' ? this.tpl(act.value, lead) : act.value;
        const data: Record<string, unknown> = {};
        if (field === 'hot') data.hot = raw === true || raw === 'true' || raw === '1';
        else if (field === 'value' || field === 'budget') data.value = Number(raw) || 0;
        else if (field === 'name') { if (!String(raw ?? '').trim()) throw new Error('Nom bo\'sh bo\'lmasin'); data.name = String(raw).trim().slice(0, 200); }
        else if (['source', 'company', 'email', 'phone'].includes(field)) data[field] = String(raw ?? '') || null;
        else {
          const key = field.startsWith('cf:') ? field.slice(3) : field;
          const custom = parse<Record<string, unknown>>(lead.customJson, {});
          custom[key] = raw;
          data.customJson = JSON.stringify(custom);
        }
        await this.prisma.lead.update({ where: { id: leadId }, data });
        return `"${field}" maydoni yangilandi`;
      }
      case 'send_message': {
        const text = this.tpl(act.text, lead).trim();
        if (!text) throw new Error('Xabar matni bo\'sh');
        if (!lead.telegramChatId || !this.tg.enabled()) return "xabar yuborilmadi — bitimda chat kanali yo'q (o'tkazib yuborildi)";
        const res = await this.tg.sendMessage(lead.telegramChatId, text.slice(0, 4000));
        if (!res.ok) throw new Error('Telegram: ' + (res.error || 'yuborilmadi'));
        await this.prisma.message.create({
          data: { leadId, channel: 'telegram', direction: 'out', text: text.slice(0, 4000), senderName: 'Avtomatlashtirish', externalId: res.messageId || null },
        });
        return `Telegram xabar yuborildi: ${text.slice(0, 60)}`;
      }
      case 'add_note': {
        const notes = parse<{ text: string; at: string; by: string }[]>(lead.notesJson, []);
        notes.unshift({ text: String(act.text || ''), at: new Date().toISOString(), by: `⚙ ${ctx.a.name}` });
        await this.prisma.lead.update({ where: { id: leadId }, data: { notesJson: JSON.stringify(notes.slice(0, 100)) } });
        return 'izoh qo\'shildi';
      }
      case 'notify': {
        if (lead.assigneeId) await this.notif.notify(lead.assigneeId, act.text || ctx.a.name, { type: 'automation', link: `/leads/detail/${leadId}` });
        return 'bildirishnoma yuborildi';
      }
      default:
        return null;
    }
  }

  // Foydalanuvchilar guruhi ichida navbat bilan (round-robin). Kursor AppSetting'da saqlanadi.
  private async queuePick(automationId: string, ids: string[]): Promise<string | null> {
    let pool = ids;
    if (!pool.length) pool = (await this.prisma.user.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true } })).map((u) => u.id);
    else pool = (await this.prisma.user.findMany({ where: { id: { in: pool }, isActive: true }, select: { id: true } })).map((u) => u.id).sort((x, y) => ids.indexOf(x) - ids.indexOf(y));
    if (!pool.length) return null;
    const key = `automation.rr.${automationId}`;
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    const idx = row ? pool.indexOf(row.value) : -1;
    const next = pool[(idx + 1) % pool.length];
    await this.prisma.appSetting.upsert({ where: { key }, create: { key, value: next }, update: { value: next } });
    return next;
  }

  // ── Cron tick (har daqiqa): kechiktirilgan navbat + vaqt triggerlari ──
  async tick() {
    if (this.ticking) return { skipped: true };
    this.ticking = true;
    const stats = { jobs: 0, time: 0, noReply: 0, beforeDate: 0 };
    try {
      stats.jobs = await this.processJobs();
      stats.time = await this.processTimeTriggers();
      stats.noReply = await this.processNoReply();
      stats.beforeDate = await this.processBeforeDate();
    } catch (e) {
      this.logger.warn('Automation tick xato: ' + (e as Error).message);
    } finally {
      this.ticking = false;
    }
    return stats;
  }

  private async processJobs(): Promise<number> {
    const jobs = await this.prisma.automationJob.findMany({ where: { status: 'pending', runAt: { lte: new Date() } }, orderBy: { runAt: 'asc' }, take: 100, include: { automation: true } });
    let n = 0;
    for (const j of jobs) {
      const claim = await this.prisma.automationJob.updateMany({ where: { id: j.id, status: 'pending' }, data: { status: 'running' } });
      if (!claim.count) continue;
      const finish = (status: string, error?: string) => this.prisma.automationJob.update({ where: { id: j.id }, data: { status, error: error || null, doneAt: new Date() } });
      try {
        const lead = await this.prisma.lead.findUnique({ where: { id: j.leadId } });
        const a = j.automation;
        // avtomatlashtirish o'chirilgan, bitim yo'q yoki bosqichdan chiqib ketgan / shart mos kelmay qolgan — o'tkazib yuboriladi
        if (!lead || !a.active || !this.inScope(a, lead) || !this.matches(parse<Cond[]>(a.conditionsJson, []), lead)) { await finish('skipped'); continue; }
        const r = await this.execute(a, j.leadId, undefined, j.depth);
        await finish(r.failed && r.failed === r.total ? 'failed' : 'done');
        n++;
      } catch (e) {
        await finish('failed', (e as Error).message).catch(() => {});
      }
    }
    return n;
  }

  private dailyScheduled(time: string, now: Date): Date | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(time || '');
    if (!m) return null;
    const day = new Date(now.getTime() + BIZ_OFFSET_MS).toISOString().slice(0, 10);
    return new Date(`${day}T${m[1].padStart(2, '0')}:${m[2]}:00+05:00`);
  }

  private async leadsFor(a: any): Promise<any[]> {
    const where = a.stageKey ? { stage: a.stageKey, unsorted: false } : { pipelineId: a.pipelineId || null, unsorted: true };
    return this.prisma.lead.findMany({ where, take: 1000 });
  }

  // exact_time va daily
  private async processTimeTriggers(): Promise<number> {
    const now = new Date();
    const autos = await this.prisma.automation.findMany({ where: { active: true, trigger: { in: ['exact_time', 'daily'] } } });
    let n = 0;
    for (const a of autos) {
      const sch = parse<Record<string, any>>(a.scheduleJson, {});
      let due = false;
      if (a.trigger === 'exact_time') {
        const at = new Date(sch.at);
        due = !isNaN(at.getTime()) && at <= now && (!a.lastRunAt || a.lastRunAt < at);
      } else {
        const sched = this.dailyScheduled(String(sch.time), now);
        due = !!sched && now >= sched && (!a.lastRunAt || a.lastRunAt < sched);
      }
      if (!due) continue;
      // bir vaqtda faqat bitta tick ishga tushirsin
      const claim = await this.prisma.automation.updateMany({ where: { id: a.id, lastRunAt: a.lastRunAt }, data: { lastRunAt: now } });
      if (!claim.count) continue;
      const conds = parse<Cond[]>(a.conditionsJson, []);
      for (const lead of await this.leadsFor(a)) {
        if (!this.matches(conds, lead)) continue;
        await this.execute(a, lead.id, undefined, 0);
        n++;
      }
    }
    return n;
  }

  // Yagona ishga tushish kafolati: (automationId, dedupeKey) unikal → takror bajarilmaydi
  private async claimOnce(automationId: string, leadId: string, dedupeKey: string): Promise<string | null> {
    try {
      const j = await this.prisma.automationJob.create({ data: { automationId, leadId, runAt: new Date(), status: 'running', dedupeKey } });
      return j.id;
    } catch {
      return null;
    }
  }
  private async finishJob(id: string, r: { failed: number; total: number }) {
    await this.prisma.automationJob.update({ where: { id }, data: { status: r.failed && r.failed === r.total ? 'failed' : 'done', doneAt: new Date() } }).catch(() => {});
  }

  // oxirgi kiruvchi xabardan N soat o'tgan va javob berilmagan
  private async processNoReply(): Promise<number> {
    const autos = await this.prisma.automation.findMany({ where: { active: true, trigger: 'no_reply_hours' } });
    let n = 0;
    for (const a of autos) {
      const hours = Number(parse<Record<string, any>>(a.scheduleJson, {}).hours);
      if (!(hours > 0)) continue;
      const cutoff = new Date(Date.now() - hours * 3_600_000);
      const conds = parse<Cond[]>(a.conditionsJson, []);
      const leads = await this.leadsFor(a);
      if (!leads.length) continue;
      const msgs = await this.prisma.message.findMany({ where: { leadId: { in: leads.map((l) => l.id) } }, orderBy: { createdAt: 'desc' }, select: { id: true, leadId: true, direction: true, createdAt: true } });
      const last = new Map<string, { id: string; direction: string; createdAt: Date }>();
      for (const m of msgs) if (!last.has(m.leadId)) last.set(m.leadId, m);
      for (const lead of leads) {
        const m = last.get(lead.id);
        if (!m || m.direction !== 'in' || m.createdAt > cutoff) continue;
        if (!this.matches(conds, lead)) continue;
        const jobId = await this.claimOnce(a.id, lead.id, `noreply:${m.id}`);
        if (!jobId) continue;
        await this.finishJob(jobId, await this.execute(a, lead.id, undefined, 0));
        n++;
      }
    }
    return n;
  }

  // sana maydonidan N soat oldin (custom sana maydoni yoki nextTaskDate)
  private async processBeforeDate(): Promise<number> {
    const autos = await this.prisma.automation.findMany({ where: { active: true, trigger: 'before_date_field' } });
    let n = 0;
    const now = Date.now();
    for (const a of autos) {
      const sch = parse<Record<string, any>>(a.scheduleJson, {});
      const field = String(sch.field || '');
      const hours = Number(sch.hours);
      if (!field || !(hours >= 0)) continue;
      const conds = parse<Cond[]>(a.conditionsJson, []);
      for (const lead of await this.leadsFor(a)) {
        let d: Date | null = null;
        if (field === 'nextTaskDate') d = lead.nextTaskDate;
        else {
          const raw = parse<Record<string, unknown>>(lead.customJson, {})[field.startsWith('cf:') ? field.slice(3) : field];
          if (raw) { const x = new Date(String(raw)); if (!isNaN(x.getTime())) d = x; }
        }
        if (!d) continue;
        const fireAt = d.getTime() - hours * 3_600_000;
        if (fireAt > now || d.getTime() < now - 6 * 3_600_000) continue; // hali erta yoki juda kech
        if (!this.matches(conds, lead)) continue;
        const jobId = await this.claimOnce(a.id, lead.id, `bdf:${d.toISOString()}`);
        if (!jobId) continue;
        await this.finishJob(jobId, await this.execute(a, lead.id, undefined, 0));
        n++;
      }
    }
    return n;
  }
}
