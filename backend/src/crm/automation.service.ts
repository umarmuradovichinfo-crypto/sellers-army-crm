import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { NotificationService } from './notification.service';

type Cond = { field: string; op: string; value?: string };
type Action = Record<string, any> & { type: string };

function parse<T>(s: string | null | undefined, fb: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fb; }
}

/**
 * Digital Pipeline — bosqichga kirganda / lid yaratilganda / teg qo'shilganda
 * avtomatik amallar (vazifa, teg, mas'ul, maydon, webhook, bildirishnoma).
 */
@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notif: NotificationService,
  ) {}

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
      active: a.active,
      order: a.order,
    };
  }
  private checkTrigger(trigger?: string) {
    if (trigger !== undefined && !['stage_enter', 'lead_created', 'tag_added', 'no_task'].includes(trigger))
      throw new BadRequestException({ error: 'BAD_TRIGGER', message: `Noma'lum trigger: ${trigger}` });
  }
  async create(dto: any, userId?: string) {
    this.checkTrigger(dto.trigger);
    if ((dto.trigger || 'stage_enter') === 'stage_enter' && !dto.stageKey)
      throw new BadRequestException({ error: 'BAD_STAGE', message: 'Bosqich ko\'rsatilmagan' });
    const a = await this.prisma.automation.create({
      data: {
        name: String(dto.name || 'Avtomatlashtirish').trim().slice(0, 200) || 'Avtomatlashtirish',
        pipelineId: dto.pipelineId || null,
        trigger: dto.trigger || 'stage_enter',
        stageKey: dto.stageKey || null,
        conditionsJson: JSON.stringify(Array.isArray(dto.conditions) ? dto.conditions : []),
        actionsJson: JSON.stringify(Array.isArray(dto.actions) ? dto.actions : []),
        active: dto.active !== false,
        order: Number(dto.order) || 0,
        createdById: userId || null,
      },
    });
    return { automation: this.view(a) };
  }
  async update(id: string, dto: any) {
    this.checkTrigger(dto.trigger);
    if (!(await this.prisma.automation.findUnique({ where: { id }, select: { id: true } })))
      throw new NotFoundException({ error: 'NOT_FOUND', message: 'Avtomatlashtirish topilmadi' });
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = String(dto.name).trim().slice(0, 200) || 'Avtomatlashtirish';
    if (dto.pipelineId !== undefined) data.pipelineId = dto.pipelineId || null;
    if (dto.trigger !== undefined) data.trigger = dto.trigger;
    if (dto.stageKey !== undefined) data.stageKey = dto.stageKey || null;
    if (dto.conditions !== undefined) data.conditionsJson = JSON.stringify(dto.conditions || []);
    if (dto.actions !== undefined) data.actionsJson = JSON.stringify(dto.actions || []);
    if (dto.active !== undefined) data.active = !!dto.active;
    if (dto.order !== undefined) data.order = Number(dto.order) || 0;
    const a = await this.prisma.automation.update({ where: { id }, data });
    return { automation: this.view(a) };
  }
  async remove(id: string) {
    if (!(await this.prisma.automation.findUnique({ where: { id }, select: { id: true } })))
      throw new NotFoundException({ error: 'NOT_FOUND', message: 'Avtomatlashtirish topilmadi' });
    await this.prisma.automation.delete({ where: { id } });
    return { ok: true };
  }

  // ── Engine ──
  // trigger ishga tushganda mos qoidalarni topib bajaradi. Rekursiyani oldini olish
  // uchun bosqich o'zgartiruvchi action yo'q.
  async run(trigger: string, leadId: string, actorName?: string) {
    try {
      const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return;
      const all = await this.prisma.automation.findMany({ where: { active: true, trigger }, orderBy: { order: 'asc' } });
      for (const a of all) {
        if (trigger === 'stage_enter' && a.stageKey && a.stageKey !== lead.stage) continue;
        // lead_created qoidasi voronka bo'yicha cheklangan (null = asosiy voronka); boshqalarda pipelineId bo'lsa tekshiriladi
        if (trigger === 'lead_created' ? (a.pipelineId || null) !== (lead.pipelineId || null) : a.pipelineId && a.pipelineId !== (lead.pipelineId || null)) continue;
        const conds = parse<Cond[]>(a.conditionsJson, []);
        if (!this.matches(conds, lead)) continue;
        const actions = parse<Action[]>(a.actionsJson, []);
        for (const act of actions) {
          try { await this.exec(act, leadId, a.name, actorName); } // bitta action xatosi qolganlarini to'xtatmasin
          catch (e) { this.logger.warn(`Action "${act?.type}" xato: ${(e as Error).message}`); }
        }
      }
    } catch (e) {
      this.logger.warn('Automation run xato: ' + (e as Error).message);
    }
  }

  private matches(conds: Cond[], lead: any): boolean {
    for (const c of conds) {
      const tags = parse<string[]>(lead.tagsJson, []);
      let v: any;
      if (c.field === 'tag') v = tags;
      else if (c.field === 'custom') v = parse<Record<string, unknown>>(lead.customJson, {});
      else v = lead[c.field];
      const target = c.value ?? '';
      switch (c.op) {
        case 'eq': if (String(v ?? '') !== target) return false; break;
        case 'ne': if (String(v ?? '') === target) return false; break;
        case 'gt': if (!(Number(v) > Number(target))) return false; break;
        case 'lt': if (!(Number(v) < Number(target))) return false; break;
        case 'contains': if (!String(v ?? '').toLowerCase().includes(target.toLowerCase())) return false; break;
        case 'empty': if (v) return false; break;
        case 'not_empty': if (!v) return false; break;
        case 'has_tag': if (!Array.isArray(tags) || !tags.includes(target)) return false; break;
        default: break;
      }
    }
    return true;
  }

  private async exec(act: Action, leadId: string, ruleName: string, actorName?: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;
    switch (act.type) {
      case 'create_task': {
        const dueInDays = Number(act.dueInDays);
        const dueDate = Number.isFinite(dueInDays) ? new Date(Date.now() + dueInDays * 86400000) : null;
        const assigneeId = act.assignee === 'lead' || !act.assignee ? lead.assigneeId : act.assignee;
        const t = await this.prisma.leadTask.create({
          data: { leadId, title: act.title || 'Avtomatik vazifa', type: act.taskType || 'task', dueDate, assigneeId: assigneeId || null },
        });
        await this.activity.record(leadId, 'automation', { text: `⚙ ${ruleName}: vazifa "${t.title}"`, actorName });
        if (t.assigneeId) await this.notif.notify(t.assigneeId, `Avtomatik vazifa: ${t.title}`, { type: 'task', link: `/leads/detail/${leadId}` });
        break;
      }
      case 'add_tag':
      case 'remove_tag': {
        const tags = parse<string[]>(lead.tagsJson, []);
        const tag = String(act.tag || '').trim();
        if (!tag) break;
        const next = act.type === 'add_tag' ? [...new Set([...tags, tag])] : tags.filter((x) => x !== tag);
        await this.prisma.lead.update({ where: { id: leadId }, data: { tagsJson: JSON.stringify(next) } });
        await this.activity.record(leadId, 'tag', { text: `⚙ ${ruleName}: teg ${act.type === 'add_tag' ? '+' : '−'}${tag}`, actorName });
        break;
      }
      case 'set_assignee': {
        let assignee = act.assignee;
        if (assignee === 'round_robin') assignee = await this.roundRobin();
        if (assignee) {
          await this.prisma.lead.update({ where: { id: leadId }, data: { assigneeId: assignee } });
          await this.activity.record(leadId, 'assignee', { text: `⚙ ${ruleName}: mas'ul belgilandi`, actorName });
          await this.notif.notify(assignee, `Sizga lid biriktirildi: ${lead.name}`, { type: 'lead', link: `/leads/detail/${leadId}` });
        }
        break;
      }
      case 'set_field': {
        const field = String(act.field || '');
        const val = act.value;
        const data: Record<string, unknown> = {};
        if (field === 'hot') data.hot = val === true || val === 'true' || val === '1';
        else if (field === 'value') data.value = Number(val) || 0;
        else if (['source', 'company', 'email', 'phone'].includes(field)) data[field] = String(val ?? '') || null;
        else {
          const custom = parse<Record<string, unknown>>(lead.customJson, {});
          custom[field] = val;
          data.customJson = JSON.stringify(custom);
        }
        await this.prisma.lead.update({ where: { id: leadId }, data });
        await this.activity.record(leadId, 'field', { text: `⚙ ${ruleName}: "${field}" yangilandi`, actorName });
        break;
      }
      case 'add_note': {
        const notes = parse<{ text: string; at: string; by: string }[]>(lead.notesJson, []);
        notes.unshift({ text: String(act.text || ''), at: new Date().toISOString(), by: `⚙ ${ruleName}` });
        await this.prisma.lead.update({ where: { id: leadId }, data: { notesJson: JSON.stringify(notes.slice(0, 100)) } });
        await this.activity.record(leadId, 'note', { text: String(act.text || ''), actorName: `⚙ ${ruleName}` });
        break;
      }
      case 'notify': {
        if (lead.assigneeId) await this.notif.notify(lead.assigneeId, act.text || `${ruleName}`, { type: 'automation', link: `/leads/detail/${leadId}` });
        break;
      }
      case 'webhook': {
        if (act.url && /^https?:\/\//i.test(String(act.url))) {
          fetch(act.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rule: ruleName, lead: { id: lead.id, name: lead.name, phone: lead.phone, stage: lead.stage, value: lead.value } }),
          }).catch(() => {});
          await this.activity.record(leadId, 'automation', { text: `⚙ ${ruleName}: webhook yuborildi`, actorName });
        }
        break;
      }
      default:
        break;
    }
  }

  private async roundRobin(): Promise<string | null> {
    const users = await this.prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
    if (!users.length) return null;
    const counts = await this.prisma.lead.groupBy({ by: ['assigneeId'], _count: { _all: true } });
    const map = new Map(counts.map((c) => [c.assigneeId, c._count._all]));
    let best = users[0].id; let min = Infinity;
    for (const u of users) {
      const n = map.get(u.id) || 0;
      if (n < min) { min = n; best = u.id; }
    }
    return best;
  }
}
