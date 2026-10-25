import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { AutomationService } from './automation.service';
import { ChatService } from './chat.service';

/*
 * amoCRM Salesbot. Bot — qadamlar grafi:
 *   message    — xabar (+ tugmalar); tugma yoki «javobni kutish» bo'lsa mijoz javobini kutadi
 *   action     — amallar (bosqich, mas'ul, teg, vazifa, maydon… — avtomatlashtirish amallari)
 *   note       — ichki xabar (operatorlarga eslatma)
 *   condition  — shartlar bo'yicha tarmoqlar + «aks holda»
 *   validator  — oxirgi javobni tekshirish (email, telefon, raqam); noto'g'ri bo'lsa xato matni va qayta kutish
 *   pause      — kutish (daqiqa/soat/kun)
 *   distribute — mas'ulni navbat bilan taqsimlash
 *   start_bot  — boshqa botni ishga tushirish
 *   stop       — botni to'xtatish
 */
export type BotStep = Record<string, any> & { id: string; type: string };

const STEP_TYPES = ['message', 'action', 'note', 'condition', 'validator', 'pause', 'distribute', 'start_bot', 'stop'];
const TRIGGER_TYPES = ['stage_enter', 'lead_created', 'message_in'];
const MAX_STEPS = 40; // bitta yurishda (cheksiz aylanishdan himoya)
const ACTIVE = ['running', 'waiting', 'paused'];

const parse = <T>(s: string | null | undefined, fb: T): T => { try { return JSON.parse(s || '') as T; } catch { return fb; } };
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();
const BOT_USER: AuthUser = { id: '', name: 'Salesbot', email: '', initials: 'SB', role: 'bot', permissions: [] };

@Injectable()
export class SalesbotService implements OnModuleInit {
  private readonly logger = new Logger('Salesbot');

  constructor(
    private readonly prisma: PrismaService,
    private readonly automation: AutomationService,
    private readonly chat: ChatService,
    private readonly activity: ActivityService,
  ) {}

  onModuleInit() {
    this.automation.salesbot = {
      onEvent: (event, leadId) => this.onEvent(event, leadId),
      onReply: (leadId, text) => this.onReply(leadId, text),
      run: (botId, leadId) => this.start(botId, leadId).then(() => undefined),
    };
    // pauzadan qaytish
    const t = setInterval(() => this.tick().catch((e) => this.logger.warn('tick: ' + (e as Error).message)), 30_000);
    t.unref?.();
  }

  // ── CRUD ──
  private view(b: any, stats?: { total: number; active: number; done: number }) {
    return {
      id: b.id, name: b.name, active: b.active, startId: b.startId,
      steps: parse<BotStep[]>(b.stepsJson, []), triggers: parse<any[]>(b.triggersJson, []),
      createdAt: b.createdAt, updatedAt: b.updatedAt,
      ...(stats ? { stats: { ...stats, conversion: stats.total ? Math.round((stats.done / stats.total) * 100) : 0 } } : {}),
    };
  }

  async list() {
    const bots = await this.prisma.salesbot.findMany({ orderBy: { createdAt: 'desc' } });
    const rows = await this.prisma.salesbotRun.groupBy({ by: ['botId', 'state'], _count: { _all: true } });
    const st = new Map<string, { total: number; active: number; done: number }>();
    for (const r of rows) {
      const s = st.get(r.botId) || { total: 0, active: 0, done: 0 };
      s.total += r._count._all;
      if (ACTIVE.includes(r.state)) s.active += r._count._all;
      if (r.state === 'done') s.done += r._count._all;
      st.set(r.botId, s);
    }
    return { bots: bots.map((b) => this.view(b, st.get(b.id) || { total: 0, active: 0, done: 0 })) };
  }

  async get(id: string) {
    const b = await this.prisma.salesbot.findUnique({ where: { id } });
    if (!b) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Bot topilmadi' });
    return { bot: this.view(b) };
  }

  private clean(dto: any) {
    const steps: BotStep[] = Array.isArray(dto.steps) ? dto.steps : [];
    const ids = new Set<string>();
    for (const s of steps) {
      if (!s || typeof s.id !== 'string' || !STEP_TYPES.includes(s.type)) throw new BadRequestException({ error: 'BAD_STEP', message: `Noma'lum qadam: ${s?.type}` });
      if (ids.has(s.id)) throw new BadRequestException({ error: 'BAD_STEP', message: 'Qadam ID takrorlangan' });
      ids.add(s.id);
    }
    const triggers = (Array.isArray(dto.triggers) ? dto.triggers : []).filter((t: any) => t && TRIGGER_TYPES.includes(t.type));
    const startId = dto.startId && ids.has(dto.startId) ? dto.startId : null;
    return { stepsJson: JSON.stringify(steps).slice(0, 500_000), triggersJson: JSON.stringify(triggers), startId };
  }

  async create(dto: any, user?: AuthUser) {
    const name = String(dto?.name || '').trim().slice(0, 200) || 'Salesbot';
    const b = await this.prisma.salesbot.create({ data: { name, active: dto?.active !== false, ...this.clean(dto || {}), createdById: user?.id || null } });
    return { bot: this.view(b) };
  }

  async update(id: string, dto: any) {
    await this.get(id);
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = String(dto.name).trim().slice(0, 200) || 'Salesbot';
    if (dto.active !== undefined) data.active = !!dto.active;
    if (dto.steps !== undefined) Object.assign(data, this.clean(dto));
    const b = await this.prisma.salesbot.update({ where: { id }, data });
    return { bot: this.view(b) };
  }

  async remove(id: string) {
    await this.prisma.salesbotRun.updateMany({ where: { botId: id, state: { in: ACTIVE } }, data: { state: 'stopped' } });
    await this.prisma.salesbot.delete({ where: { id } }).catch(() => undefined);
    return { ok: true };
  }

  async leadRuns(leadId: string) {
    const runs = await this.prisma.salesbotRun.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' }, take: 20 });
    const bots = await this.prisma.salesbot.findMany({ where: { id: { in: [...new Set(runs.map((r) => r.botId))] } }, select: { id: true, name: true } });
    const bn = new Map(bots.map((b) => [b.id, b.name]));
    return { runs: runs.map((r) => ({ id: r.id, botId: r.botId, botName: bn.get(r.botId) || '—', state: r.state, error: r.error, createdAt: r.createdAt })) };
  }

  async stopLead(leadId: string) {
    const r = await this.prisma.salesbotRun.updateMany({ where: { leadId, state: { in: ACTIVE } }, data: { state: 'stopped' } });
    return { stopped: r.count };
  }

  // ── Ishga tushirish ──
  async start(botId: string, leadId: string) {
    const bot = await this.prisma.salesbot.findUnique({ where: { id: botId } });
    if (!bot) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Bot topilmadi' });
    if (!(await this.prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Bitim topilmadi' });
    // bitta bitimda bitta bot bir vaqtda bir marta
    await this.prisma.salesbotRun.updateMany({ where: { leadId, botId, state: { in: ACTIVE } }, data: { state: 'stopped' } });
    const run = await this.prisma.salesbotRun.create({ data: { botId, leadId, stepId: bot.startId, state: 'running' } });
    await this.activity.record(leadId, 'automation', { actorName: 'Salesbot', text: `Salesbot ishga tushdi: ${bot.name}`, data: { botId } });
    await this.advance(run.id, bot.startId);
    return { runId: run.id };
  }

  private async onEvent(event: string, leadId: string) {
    if (!TRIGGER_TYPES.includes(event)) return;
    const bots = await this.prisma.salesbot.findMany({ where: { active: true } });
    if (!bots.length) return;
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { stage: true, pipelineId: true } });
    if (!lead) return;
    for (const b of bots) {
      const hit = parse<any[]>(b.triggersJson, []).some((t) => t.type === event && (event !== 'stage_enter' || (
        (t.pipelineId || 'main') === (lead.pipelineId || 'main') && (!t.stageKey || t.stageKey === lead.stage))));
      if (!hit) continue;
      const busy = await this.prisma.salesbotRun.count({ where: { leadId, botId: b.id, state: { in: ACTIVE } } });
      if (busy) continue;
      await this.start(b.id, leadId).catch((e) => this.logger.warn(`start ${b.id}: ${(e as Error).message}`));
    }
  }

  /** Mijoz javobi: shu bitimda javob kutayotgan bot bo'lsa davom ettiradi. */
  private async onReply(leadId: string, text: string): Promise<boolean> {
    const run = await this.prisma.salesbotRun.findFirst({ where: { leadId, state: 'waiting' }, orderBy: { updatedAt: 'desc' } });
    if (!run) return false;
    const bot = await this.prisma.salesbot.findUnique({ where: { id: run.botId } });
    const steps = parse<BotStep[]>(bot?.stepsJson, []);
    const step = steps.find((s) => s.id === run.stepId);
    if (!bot || !step) { await this.finish(run.id, 'error', 'Qadam topilmadi'); return true; }
    const vars = { ...parse<Record<string, any>>(run.varsJson, {}), lastReply: text };
    await this.prisma.salesbotRun.update({ where: { id: run.id }, data: { varsJson: JSON.stringify(vars), state: 'running' } });
    let next: string | null = null;
    if (step.type === 'message') {
      const btns: any[] = Array.isArray(step.buttons) ? step.buttons : [];
      const t = norm(text);
      const hit = btns.find((b, i) => norm(b.label) === t || t === String(i + 1));
      next = hit ? hit.next || null : btns.length ? step.elseNext || step.next || null : step.next || null;
    } else if (step.type === 'validator') {
      const r = await this.validate(run.id, step, leadId, text);
      if (r === undefined) return true; // xato matni yuborildi — qayta javob kutilmoqda
      next = r;
    }
    await this.advance(run.id, next);
    return true;
  }

  private async tick() {
    const due = await this.prisma.salesbotRun.findMany({ where: { state: 'paused', resumeAt: { lte: new Date() } }, take: 50 });
    for (const r of due) {
      const bot = await this.prisma.salesbot.findUnique({ where: { id: r.botId } });
      const step = parse<BotStep[]>(bot?.stepsJson, []).find((s) => s.id === r.stepId);
      await this.prisma.salesbotRun.update({ where: { id: r.id }, data: { state: 'running', resumeAt: null } });
      await this.advance(r.id, step?.next || null);
    }
  }

  private async finish(runId: string, state: 'done' | 'stopped' | 'error', error?: string) {
    await this.prisma.salesbotRun.update({ where: { id: runId }, data: { state, error: error || null } });
  }

  /** Qadamlarni bajarish: kutish/pauza yoki oxirigacha. */
  private async advance(runId: string, stepId: string | null) {
    const run = await this.prisma.salesbotRun.findUnique({ where: { id: runId } });
    if (!run) return;
    const bot = await this.prisma.salesbot.findUnique({ where: { id: run.botId } });
    const steps = new Map(parse<BotStep[]>(bot?.stepsJson, []).map((s) => [s.id, s]));
    let cur = stepId;
    for (let i = 0; i < MAX_STEPS; i++) {
      if (!cur) return this.finish(runId, 'done');
      const step = steps.get(cur);
      if (!step) return this.finish(runId, 'error', 'Qadam topilmadi');
      await this.prisma.salesbotRun.update({ where: { id: runId }, data: { stepId: step.id } });
      try {
        const r = await this.exec(run.id, run.leadId, step, bot!.name);
        if (r === 'wait' || r === 'pause' || r === 'end') return;
        cur = r;
      } catch (e) {
        const msg = (e as Error).message || 'xato';
        await this.activity.record(run.leadId, 'automation', { actorName: 'Salesbot', text: `Salesbot (${bot!.name}): xato — ${msg}`, data: { botId: run.botId } });
        return this.finish(runId, 'error', msg.slice(0, 300));
      }
    }
    return this.finish(runId, 'error', 'Qadamlar soni chegaradan oshdi (aylanish)');
  }

  /** Qadam natijasi: keyingi qadam ID, null (tugadi), 'wait' | 'pause' | 'end'. */
  private async exec(runId: string, leadId: string, step: BotStep, botName: string): Promise<string | null | 'wait' | 'pause' | 'end'> {
    const vars = parse<Record<string, any>>((await this.prisma.salesbotRun.findUnique({ where: { id: runId } }))?.varsJson, {});
    switch (step.type) {
      case 'message': {
        const btns: any[] = Array.isArray(step.buttons) ? step.buttons.filter((b: any) => String(b?.label || '').trim()) : [];
        const text = await this.render(String(step.text || ''), leadId, vars);
        const body = btns.length ? `${text}\n\n${btns.map((b, i) => `${i + 1}. ${b.label}`).join('\n')}` : text;
        // kanal yo'q yoki yuborilmadi — amoCRM kabi bot to'xtamaydi, lentaga yoziladi
        if (body.trim()) await this.chat.sendMessage(leadId, body, BOT_USER).catch((e) => this.activity.record(leadId, 'automation', { actorName: 'Salesbot', text: `Salesbot (${botName}): xabar yuborilmadi — ${(e as Error).message}` }));
        if (btns.length || step.wait) {
          await this.prisma.salesbotRun.update({ where: { id: runId }, data: { state: 'waiting' } });
          return 'wait';
        }
        return step.next || null;
      }
      case 'action':
        await this.automation.runActions(Array.isArray(step.actions) ? step.actions : [], leadId, `Salesbot: ${botName}`);
        return step.next || null;
      case 'note':
        await this.automation.runActions([{ type: 'add_note', text: await this.render(String(step.text || ''), leadId, vars) }], leadId, `Salesbot: ${botName}`);
        return step.next || null;
      case 'condition': {
        const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
        for (const br of Array.isArray(step.branches) ? step.branches : []) {
          if (this.matches(br.rules || [], lead, vars)) return br.next || null;
        }
        return step.elseNext || null;
      }
      case 'validator': {
        const r = await this.validate(runId, step, leadId, String(vars.lastReply ?? ''));
        return r === undefined ? 'wait' : r;
      }
      case 'pause': {
        const n = Math.max(1, Number(step.amount) || 1);
        const ms = n * (step.unit === 'day' ? 86_400_000 : step.unit === 'hour' ? 3_600_000 : 60_000);
        await this.prisma.salesbotRun.update({ where: { id: runId }, data: { state: 'paused', resumeAt: new Date(Date.now() + ms) } });
        return 'pause';
      }
      case 'distribute': {
        const users: string[] = (Array.isArray(step.userIds) ? step.userIds : []).filter(Boolean);
        if (users.length) {
          const key = `bot_rr:${step.id}`;
          const row = await this.prisma.appSetting.findUnique({ where: { key } });
          const idx = (Number(row?.value) || 0) % users.length;
          await this.automation.runActions([{ type: 'change_assignee', userId: users[idx] }], leadId, `Salesbot: ${botName}`);
          await this.prisma.appSetting.upsert({ where: { key }, create: { key, value: String(idx + 1) }, update: { value: String(idx + 1) } });
        }
        return step.next || null;
      }
      case 'start_bot':
        await this.finish(runId, 'done');
        if (step.botId) await this.start(String(step.botId), leadId);
        return 'end';
      case 'stop':
        await this.finish(runId, 'stopped');
        return 'end';
      default:
        return step.next || null;
    }
  }

  /** undefined — xato matni yuborildi va qayta javob kutilmoqda; aks holda keyingi qadam. */
  private async validate(runId: string, step: BotStep, leadId: string, text: string): Promise<string | null | undefined> {
    const v = String(text || '').trim();
    const ok = step.kind === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
      : step.kind === 'phone' ? v.replace(/\D/g, '').length >= 9
        : step.kind === 'number' ? /^-?\d+([.,]\d+)?$/.test(v)
          : v.length > 0;
    if (ok) {
      // to'g'ri qiymatni bitim maydoniga yozish (ixtiyoriy)
      if (step.saveTo) await this.automation.runActions([{ type: 'change_field', field: step.saveTo, value: v }], leadId, 'Salesbot').catch(() => undefined);
      return step.validNext || step.next || null;
    }
    if (step.invalidNext) return step.invalidNext;
    if (step.errorText) await this.chat.sendMessage(leadId, String(step.errorText), BOT_USER).catch(() => undefined);
    await this.prisma.salesbotRun.update({ where: { id: runId }, data: { state: 'waiting', stepId: step.id } });
    return undefined;
  }

  private matches(rules: any[], lead: any, vars: Record<string, any>): boolean {
    if (!lead) return false;
    const custom = parse<Record<string, any>>(lead.customJson, {});
    const tags = parse<string[]>(lead.tagsJson, []);
    return rules.every((r) => {
      const f = String(r.field || '');
      const val = f === 'reply' ? vars.lastReply : f === 'stage' ? lead.stage : f === 'tag' ? tags : f === 'value' ? lead.value
        : f === 'source' ? lead.source : f === 'assignee' ? lead.assigneeId : f.startsWith('cf:') ? custom[f.slice(3)] : undefined;
      const target = String(r.value ?? '');
      switch (r.op) {
        case 'eq': return Array.isArray(val) ? val.map(norm).includes(norm(target)) : norm(val) === norm(target);
        case 'ne': return Array.isArray(val) ? !val.map(norm).includes(norm(target)) : norm(val) !== norm(target);
        case 'contains': return (Array.isArray(val) ? val.join(' ') : norm(val)).toLowerCase().includes(norm(target));
        case 'gt': return Number(val) > Number(target);
        case 'lt': return Number(val) < Number(target);
        case 'empty': return val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length);
        case 'not_empty': return !(val === undefined || val === null || val === '' || (Array.isArray(val) && !val.length));
        default: return false;
      }
    });
  }

  /** {{name}}, {{phone}}, {{reply}} kabi o'zgaruvchilar. */
  private async render(text: string, leadId: string, vars: Record<string, any>) {
    if (!text.includes('{{')) return text;
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    const map: Record<string, unknown> = { name: lead?.name, phone: lead?.phone, email: lead?.email, company: lead?.company, budget: lead?.value, reply: vars.lastReply };
    return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => String(map[k] ?? ''));
  }
}
