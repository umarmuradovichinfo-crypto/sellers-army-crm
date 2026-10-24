import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { colorFromString } from '../common/utils/color';
import { initialsOf } from '../common/utils/initials';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { AutomationService } from './automation.service';
import { NotificationService } from './notification.service';
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
  async getPipeline(pipelineId?: string) {
    const pipelines = await this.prisma.crmPipeline.findMany({ orderBy: { order: 'asc' } });
    // Tanlangan voronka: berilgan id, aks holda standart (null) yoki birinchi
    const activePid = pipelineId || null;
    const [allStages, leads] = await Promise.all([
      this.prisma.crmStage.findMany({ orderBy: { order: 'asc' } }),
      this.prisma.lead.findMany({ orderBy: [{ stage: 'asc' }, { queue: 'asc' }] }) as Promise<LeadRow[]>,
    ]);
    const stages = allStages.filter((s) => (s.pipelineId || null) === activePid);
    const stageKeys = new Set(stages.map((s) => s.key));
    const pipeLeads = leads.filter((l) => !l.unsorted && stageKeys.has(l.stage) && (l.pipelineId || null) === activePid);
    const names = await this.userMap(pipeLeads.map((l) => l.assigneeId));

    const openTasks = await this.prisma.leadTask.findMany({
      where: { done: false, leadId: { in: pipeLeads.map((l) => l.id) } },
      orderBy: { dueDate: 'asc' },
    });
    const nextTaskByLead = new Map<string, { title: string; dueDate: Date | null }>();
    for (const t of openTasks) if (!nextTaskByLead.has(t.leadId)) nextTaskByLead.set(t.leadId, { title: t.title, dueDate: t.dueDate });

    // Kartochkadagi asosiy kontakt ismi (amoCRM: ko'k qator = kontakt, ostida lid nomi)
    const contactIds = [...new Set(pipeLeads.map((l) => l.contactId).filter(Boolean))] as string[];
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

    const stagesOut = stages.map((s) => {
      const sl = pipeLeads.filter((l) => l.stage === s.key);
      return {
        id: s.key,
        name: s.name,
        color: s.color,
        kind: s.kind,
        isSystem: s.isSystem,
        sum: fmtSum(sl.reduce((a, l) => a + l.value, 0)),
        leads: sl.map((l) => {
          const nt = nextTaskByLead.get(l.id);
          const c = {
            ...this.card(l, s.kind, names),
            contactName: l.contactId ? contactNames.get(l.contactId) || null : null,
            taskStatus: taskStatusOf(nt),
          };
          if (!nt) return c;
          const w = fmtTaskWhen(nt.dueDate);
          return { ...c, task: w ? `${nt.title} · ${w}` : nt.title, taskOpen: true };
        }),
      };
    });

    const open = pipeLeads.filter((l) => stages.find((s) => s.key === l.stage)?.kind === 'open');
    const wonStage = stages.filter((s) => s.kind === 'won').map((s) => s.key);
    const won = pipeLeads.filter((l) => wonStage.includes(l.stage));
    const stats = [
      { lab: 'Faol lidlar', v: String(open.length) },
      { lab: 'Voronka summasi', v: fmtSum(open.reduce((a, l) => a + l.value, 0)) },
      { lab: 'Yopilgan (sotuv)', v: String(won.length) },
      { lab: 'Sotuv summasi', v: fmtSum(won.reduce((a, l) => a + l.value, 0)) },
    ];

    return { stages: stagesOut, stats, pipelines, pipelineId: activePid };
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
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.order !== undefined) data.order = dto.order;
    const stage = await this.prisma.crmStage.update({ where: { key }, data });
    return { stage };
  }
  async deleteStage(key: string, user?: AuthUser) {
    this.ensureSuper(user);
    const st = await this.prisma.crmStage.findUnique({ where: { key } });
    if (!st) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Bosqich topilmadi' });
    if (st.isSystem) throw new BadRequestException({ error: 'SYSTEM', message: "Tizim bosqichini o'chirib bo'lmaydi" });
    await this.prisma.lead.updateMany({ where: { stage: key }, data: { stage: 'new' } });
    await this.prisma.crmStage.delete({ where: { key } });
    return { success: true };
  }

  // ── Lidlar ──
  private async nextQueue(stage: string) {
    const m = await this.prisma.lead.aggregate({ where: { stage }, _max: { queue: true } });
    return (m._max.queue ?? -1) + 1;
  }

  // Dublikat aniqlash (telefon oxirgi 9 raqam yoki email)
  async findDuplicates(phone?: string, email?: string, excludeId?: string) {
    const tail = digits(phone).slice(-9);
    const all = await this.prisma.lead.findMany({
      where: { id: excludeId ? { not: excludeId } : undefined },
      select: { id: true, name: true, phone: true, email: true, stage: true },
    });
    const matches = all.filter((l) => {
      if (tail.length >= 7 && digits(l.phone).slice(-9) === tail) return true;
      if (email && l.email && l.email.toLowerCase() === email.toLowerCase()) return true;
      return false;
    });
    return { duplicates: matches.slice(0, 10) };
  }

  private itemsValue(items: any[]): number {
    if (!Array.isArray(items)) return 0;
    return items.reduce((a, it) => a + (Number(it.price) || 0) * (Number(it.qty) || 1), 0);
  }

  async createLead(dto: CreateLeadDto & { email?: string; pipelineId?: string; custom?: Record<string, unknown>; items?: any[] }, user?: AuthUser) {
    const stage = dto.stage || 'new';
    const items = Array.isArray((dto as any).items) ? (dto as any).items : [];
    const value = items.length ? this.itemsValue(items) : (Number(dto.value) || 0);
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
        nextTaskDate: dto.nextTaskDate ? new Date(dto.nextTaskDate) : null,
        queue: await this.nextQueue(stage),
        createdById: user?.id || null,
      },
    })) as LeadRow;
    await this.activity.record(lead.id, 'created', { actorId: user?.id, actorName: user?.name, text: `Lid yaratildi: ${lead.name}` });
    if (lead.assigneeId) await this.notif.notify(lead.assigneeId, `Yangi lid biriktirildi: ${lead.name}`, { type: 'lead', link: `/crm?lead=${lead.id}` });
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
    const [activity, company] = await Promise.all([
      this.activity.listForLead(id),
      l.companyId ? this.prisma.company.findUnique({ where: { id: l.companyId }, select: { id: true, name: true } }) : Promise.resolve(null),
    ]);
    return {
      lead: {
        ...this.card(l, st?.kind || 'open', names),
        notes: parse<unknown[]>(l.notesJson, []),
        activity,
        companyName: company?.name || null,
      },
    };
  }

  async updateLead(id: string, dto: UpdateLeadDto & { email?: string; pipelineId?: string; custom?: Record<string, unknown>; lostReason?: string }, user?: AuthUser) {
    const existing = (await this.prisma.lead.findUnique({ where: { id } })) as LeadRow | null;
    if (!existing) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    const data: Record<string, unknown> = {};
    const changes: string[] = [];
    if (dto.name !== undefined && dto.name !== existing.name) { data.name = dto.name; changes.push('ism'); }
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if ((dto as any).email !== undefined) data.email = (dto as any).email || null;
    if (dto.company !== undefined) data.company = dto.company || null;
    if ((dto as any).companyId !== undefined) data.companyId = (dto as any).companyId || null;
    if (dto.source !== undefined && dto.source !== existing.source) { data.source = dto.source || null; changes.push('manba'); }
    if (dto.value !== undefined && Number(dto.value) !== existing.value) { data.value = Number(dto.value) || 0; changes.push('byudjet'); }
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
    if (dto.nextTaskDate !== undefined) data.nextTaskDate = dto.nextTaskDate ? new Date(dto.nextTaskDate) : null;
    if ((dto as any).lostReason !== undefined) data.lostReason = (dto as any).lostReason || null;

    let assigneeChanged = false;
    if (dto.assigneeId !== undefined && (dto.assigneeId || null) !== existing.assigneeId) {
      data.assigneeId = dto.assigneeId || null;
      assigneeChanged = true;
    }

    let stageChanged = false;
    if (dto.stage !== undefined && dto.stage !== existing.stage) {
      data.stage = dto.stage;
      stageChanged = true;
      await this.applyStageClose(dto.stage, data, (dto as any).lostReason);
    }

    const l = (await this.prisma.lead.update({ where: { id }, data })) as LeadRow;

    if (changes.length) await this.activity.record(id, 'updated', { actorId: user?.id, actorName: user?.name, text: `O'zgartirildi: ${changes.join(', ')}` });
    if (assigneeChanged) {
      await this.activity.record(id, 'assignee', { actorId: user?.id, actorName: user?.name, text: `Mas'ul o'zgardi` });
      if (l.assigneeId) await this.notif.notify(l.assigneeId, `Sizga lid biriktirildi: ${l.name}`, { type: 'lead', link: `/crm?lead=${id}` });
    }
    if (stageChanged) {
      const st = await this.prisma.crmStage.findUnique({ where: { key: l.stage } });
      await this.recordStageActivity(id, l, st?.kind || 'open', user);
      await this.automation.run('stage_enter', id, user?.name);
    }

    const fresh = (await this.prisma.lead.findUnique({ where: { id } })) as LeadRow;
    const names = await this.userMap([fresh.assigneeId]);
    const st = await this.prisma.crmStage.findUnique({ where: { key: fresh.stage } });
    return { lead: { ...this.card(fresh, st?.kind || 'open', names), notes: parse<unknown[]>(fresh.notesJson, []) } };
  }

  // won/lost bosqichga o'tganda wonAt/lostAt belgilash
  private async applyStageClose(stageKey: string, data: Record<string, unknown>, lostReason?: string) {
    const st = await this.prisma.crmStage.findUnique({ where: { key: stageKey } });
    if (!st) return;
    if (st.kind === 'won') { data.wonAt = new Date(); data.lostAt = null; }
    else if (st.kind === 'lost') { data.lostAt = new Date(); data.wonAt = null; if (lostReason !== undefined) data.lostReason = lostReason || null; }
    else { data.wonAt = null; data.lostAt = null; }
  }

  private async recordStageActivity(id: string, lead: LeadRow, kind: string, user?: AuthUser) {
    const st = await this.prisma.crmStage.findUnique({ where: { key: lead.stage } });
    const stageName = st?.name || lead.stage;
    if (kind === 'won') await this.activity.record(id, 'won', { actorId: user?.id, actorName: user?.name, text: `🏆 Sotuv yopildi: ${fmtSum(lead.value)} so'm` });
    else if (kind === 'lost') await this.activity.record(id, 'lost', { actorId: user?.id, actorName: user?.name, text: `Yo'qotildi${lead.lostReason ? ` — ${lead.lostReason}` : ''}` });
    else await this.activity.record(id, 'stage', { actorId: user?.id, actorName: user?.name, text: `Bosqich: ${stageName}` });
  }

  async deleteLead(id: string) {
    const l = await this.prisma.lead.findUnique({ where: { id } });
    if (!l) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    await this.prisma.activity.deleteMany({ where: { leadId: id } });
    await this.prisma.lead.delete({ where: { id } });
    return { success: true };
  }

  async moveLead(id: string, stageKey: string, position?: number, user?: AuthUser, lostReason?: string) {
    const target = await this.prisma.crmStage.findUnique({ where: { key: stageKey } });
    if (!target) throw new NotFoundException({ error: 'BAD_STAGE', message: "Noto'g'ri bosqich" });
    const before = await this.prisma.lead.findUnique({ where: { id } });
    if (!before) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    const changed = before.stage !== stageKey;

    await this.prisma.$transaction(async (tx) => {
      const closeData: Record<string, unknown> = { stage: stageKey };
      if (changed) {
        if (target.kind === 'won') { closeData.wonAt = new Date(); closeData.lostAt = null; }
        else if (target.kind === 'lost') { closeData.lostAt = new Date(); closeData.wonAt = null; if (lostReason !== undefined) closeData.lostReason = lostReason || null; }
        else { closeData.wonAt = null; closeData.lostAt = null; }
      }
      await tx.lead.update({ where: { id }, data: closeData });
      const others = await tx.lead.findMany({ where: { stage: stageKey, id: { not: id } }, orderBy: { queue: 'asc' }, select: { id: true } });
      const ids = others.map((o) => o.id);
      const pos = position == null ? ids.length : Math.max(0, Math.min(position, ids.length));
      ids.splice(pos, 0, id);
      for (let i = 0; i < ids.length; i++) await tx.lead.update({ where: { id: ids[i] }, data: { queue: i, stage: stageKey } });
    });

    if (changed) {
      const fresh = (await this.prisma.lead.findUnique({ where: { id } })) as LeadRow;
      await this.recordStageActivity(id, fresh, target.kind, user);
      await this.automation.run('stage_enter', id, user?.name);
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
  async bulk(dto: { ids: string[]; action: string; value?: any }, user?: AuthUser) {
    const ids = Array.isArray(dto.ids) ? dto.ids : [];
    if (!ids.length) throw new BadRequestException({ error: 'NO_IDS', message: 'Lid tanlanmagan' });
    let affected = 0;
    switch (dto.action) {
      case 'stage': {
        for (const id of ids) { await this.moveLead(id, String(dto.value), undefined, user).catch(() => {}); affected++; }
        break;
      }
      case 'assignee': {
        const r = await this.prisma.lead.updateMany({ where: { id: { in: ids } }, data: { assigneeId: dto.value || null } });
        affected = r.count;
        for (const id of ids) await this.activity.record(id, 'assignee', { actorId: user?.id, actorName: user?.name, text: `Mas'ul (ommaviy)` });
        if (dto.value) await this.notif.notify(dto.value, `Sizga ${affected} ta lid biriktirildi`, { type: 'lead', link: '/crm' });
        break;
      }
      case 'add_tag': {
        const tag = String(dto.value || '').trim();
        if (tag) {
          const leads = await this.prisma.lead.findMany({ where: { id: { in: ids } }, select: { id: true, tagsJson: true } });
          for (const l of leads) {
            const tags = [...new Set([...parse<string[]>(l.tagsJson, []), tag])];
            await this.prisma.lead.update({ where: { id: l.id }, data: { tagsJson: JSON.stringify(tags) } });
            affected++;
          }
        }
        break;
      }
      case 'hot': {
        const r = await this.prisma.lead.updateMany({ where: { id: { in: ids } }, data: { hot: !!dto.value } });
        affected = r.count;
        break;
      }
      case 'delete': {
        await this.prisma.activity.deleteMany({ where: { leadId: { in: ids } } });
        const r = await this.prisma.lead.deleteMany({ where: { id: { in: ids } } });
        affected = r.count;
        break;
      }
      default:
        throw new BadRequestException({ error: 'BAD_ACTION', message: 'Noma`lum amal' });
    }
    return { ok: true, affected };
  }

  // ── List ko'rinishi + kengaytirilgan filtr ──
  async listLeads(q: { search?: string; source?: string; assigneeId?: string; tag?: string; hot?: string; stage?: string; pipelineId?: string; minValue?: string; maxValue?: string }) {
    const where: Record<string, any> = {};
    if (q.source) where.source = q.source;
    if (q.assigneeId) where.assigneeId = q.assigneeId === 'none' ? null : q.assigneeId;
    if (q.stage) where.stage = q.stage;
    if (q.pipelineId) where.pipelineId = q.pipelineId;
    if (q.hot === 'true') where.hot = true;
    if (q.minValue || q.maxValue) { where.value = {}; if (q.minValue) where.value.gte = Number(q.minValue); if (q.maxValue) where.value.lte = Number(q.maxValue); }
    if (q.search) where.OR = [{ name: { contains: q.search, mode: 'insensitive' } }, { phone: { contains: q.search } }, { email: { contains: q.search, mode: 'insensitive' } }];

    let leads = (await this.prisma.lead.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 500 })) as LeadRow[];
    if (q.tag) leads = leads.filter((l) => parse<string[]>(l.tagsJson, []).includes(q.tag!));
    const names = await this.userMap(leads.map((l) => l.assigneeId));
    const stages = await this.prisma.crmStage.findMany();
    const kindByKey = new Map(stages.map((s) => [s.key, s.kind]));
    const nameByKey = new Map(stages.map((s) => [s.key, s.name]));
    return {
      leads: leads.map((l) => ({
        ...this.card(l, kindByKey.get(l.stage) || 'open', names),
        stageName: nameByKey.get(l.stage) || l.stage,
      })),
    };
  }

  // ── CSV eksport / import ──
  async exportCsv(): Promise<string> {
    const leads = (await this.prisma.lead.findMany({ orderBy: { createdAt: 'desc' } })) as LeadRow[];
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
  async listUnsorted() {
    const leads = (await this.prisma.lead.findMany({ where: { unsorted: true }, orderBy: { createdAt: 'desc' }, take: 200 })) as LeadRow[];
    const names = await this.userMap(leads.map((l) => l.assigneeId));
    const forms = await this.prisma.crmForm.findMany({ select: { id: true, title: true } });
    const formName = new Map(forms.map((f) => [f.id, f.title]));
    return {
      leads: leads.map((l) => ({
        ...this.card(l, 'open', names),
        formName: l.formId ? formName.get(l.formId) || null : null,
        createdAt: l.createdAt.toISOString(),
      })),
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
    if (data.assigneeId) await this.notif.notify(data.assigneeId as string, `Sizga lid biriktirildi: ${lead.name}`, { type: 'lead', link: `/crm?lead=${id}` });
    return { ok: true };
  }

  // ── Vazifalar (zadacha) ──
  private taskView(t: {
    id: string; leadId: string; title: string; type: string; dueDate: Date | null;
    done: boolean; doneAt: Date | null; result?: string | null; assigneeId: string | null;
  }, extra?: { leadName?: string; stage?: string; assigneeName?: string | null }) {
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
    };
  }

  async listLeadTasks(leadId: string) {
    const tasks = await this.prisma.leadTask.findMany({
      where: { leadId },
      orderBy: [{ done: 'asc' }, { dueDate: 'asc' }],
    });
    return { tasks: tasks.map((t) => this.taskView(t)) };
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
      include: { lead: { select: { name: true, stage: true } } },
      take: 800,
    });
    const names = await this.userMap(tasks.map((t) => t.assigneeId));
    return {
      tasks: tasks.map((t) =>
        this.taskView(t, {
          leadName: t.lead?.name,
          stage: t.lead?.stage,
          assigneeName: t.assigneeId ? names.get(t.assigneeId) || null : null,
        }),
      ),
    };
  }

  async createTask(leadId: string, dto: CreateLeadTaskDto, user?: AuthUser) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    const t = await this.prisma.leadTask.create({
      data: {
        leadId,
        title: dto.title,
        type: dto.type || 'task',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assigneeId: dto.assigneeId || lead.assigneeId || user?.id || null,
        createdById: user?.id || null,
      },
    });
    await this.activity.record(leadId, 'task_created', { actorId: user?.id, actorName: user?.name, text: `Vazifa: ${t.title}` });
    if (t.assigneeId && t.assigneeId !== user?.id) await this.notif.notify(t.assigneeId, `Yangi vazifa: ${t.title}`, { type: 'task', link: `/crm?lead=${leadId}` });
    return { task: this.taskView(t) };
  }

  async updateTask(id: string, dto: UpdateLeadTaskDto, user?: AuthUser) {
    const existing = await this.prisma.leadTask.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Vazifa topilmadi' });
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
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

  async deleteTask(id: string) {
    const t = await this.prisma.leadTask.findUnique({ where: { id } });
    if (!t) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Vazifa topilmadi' });
    await this.prisma.leadTask.delete({ where: { id } });
    return { success: true };
  }
}
