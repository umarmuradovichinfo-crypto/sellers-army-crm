import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { AutomationService } from './automation.service';
import { NotificationService } from './notification.service';

function parse<T>(s: string | null, fb: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fb; }
}
function slugify(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'forma';
}

/**
 * Lead-capture web formalar. Admin forma yaratadi (maydonlar bilan), ommaviy
 * havola /lead/<slug> orqali to'ldiriladi va yangi lid (saralanmagan) yaratadi.
 */
@Injectable()
export class CrmFormsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly automation: AutomationService,
    private readonly notif: NotificationService,
  ) {}

  private view(f: any) {
    return { ...f, fields: parse<any[]>(f.fieldsJson, []), settings: parse<Record<string, any>>(f.settingsJson, {}) };
  }

  async list() {
    const forms = await this.prisma.crmForm.findMany({ orderBy: { createdAt: 'desc' } });
    return { forms: forms.map((f) => this.view(f)) };
  }
  async get(id: string) {
    const f = await this.prisma.crmForm.findUnique({ where: { id } });
    if (!f) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Forma topilmadi' });
    return { form: this.view(f) };
  }
  async create(dto: any, userId?: string) {
    const title = (dto.title || '').trim() || 'Forma';
    let slug = slugify(dto.slug || title); let i = 1;
    while (await this.prisma.crmForm.findUnique({ where: { slug } })) slug = `${slugify(title)}-${i++}`;
    const f = await this.prisma.crmForm.create({
      data: {
        slug,
        title,
        description: dto.description || null,
        fieldsJson: JSON.stringify(Array.isArray(dto.fields) && dto.fields.length ? dto.fields : defaultFields()),
        settingsJson: JSON.stringify(dto.settings || {}),
        pipelineId: dto.pipelineId || null,
        stageKey: dto.stageKey || null,
        assigneeId: dto.assigneeId || null,
        source: dto.source || 'Sayt formasi',
        active: dto.active !== false,
        createdById: userId || null,
      },
    });
    return { form: this.view(f) };
  }
  async update(id: string, dto: any) {
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.fields !== undefined) data.fieldsJson = JSON.stringify(dto.fields || []);
    if (dto.settings !== undefined) data.settingsJson = JSON.stringify(dto.settings || {});
    if (dto.pipelineId !== undefined) data.pipelineId = dto.pipelineId || null;
    if (dto.stageKey !== undefined) data.stageKey = dto.stageKey || null;
    if (dto.assigneeId !== undefined) data.assigneeId = dto.assigneeId || null;
    if (dto.source !== undefined) data.source = dto.source || null;
    if (dto.active !== undefined) data.active = !!dto.active;
    const f = await this.prisma.crmForm.update({ where: { id }, data });
    return { form: this.view(f) };
  }
  async remove(id: string) {
    await this.prisma.crmForm.delete({ where: { id } });
    return { ok: true };
  }

  // ── Ommaviy ──
  async getPublic(slug: string) {
    const f = await this.prisma.crmForm.findUnique({ where: { slug } });
    if (!f || !f.active) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Forma topilmadi yoki yopilgan' });
    return { title: f.title, description: f.description, fields: parse<any[]>(f.fieldsJson, []), settings: parse<Record<string, any>>(f.settingsJson, {}) };
  }

  async submit(slug: string, answers: Record<string, any>) {
    const f = await this.prisma.crmForm.findUnique({ where: { slug } });
    if (!f || !f.active) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Forma topilmadi' });
    const fields = parse<any[]>(f.fieldsJson, []);
    const a = answers || {};
    // standart maydonlarni ajratamiz
    const name = String(a.name || a.ism || a.fio || firstByType(fields, a, 'name') || 'Nomsiz lid').slice(0, 200);
    const phone = String(a.phone || a.telefon || firstByType(fields, a, 'phone') || '').slice(0, 50) || null;
    const email = String(a.email || firstByType(fields, a, 'email') || '').slice(0, 120) || null;
    // majburiy tekshiruv + qolgan javoblar custom ga (ko'p tanlov massivi → vergul bilan)
    const custom: Record<string, unknown> = {};
    for (const fd of fields) {
      if (fd.type === 'section') continue; // bo'lim — javob emas
      let val: any = a[fd.key];
      if (Array.isArray(val)) val = val.join(', ');
      const str = val == null ? '' : String(val).trim();
      if (fd.required && !str) throw new BadRequestException({ error: 'REQUIRED', message: `"${fd.label}" majburiy` });
      if (!['name', 'phone', 'email'].includes(fd.type) && str) custom[fd.key] = str;
    }

    if (!name && !phone) throw new BadRequestException({ error: 'EMPTY', message: 'Ism yoki telefon kerak' });

    const stage = f.stageKey || 'new';
    const queueAgg = await this.prisma.lead.aggregate({ where: { stage }, _max: { queue: true } });
    const lead = await this.prisma.lead.create({
      data: {
        name, phone, email,
        source: f.source || 'Sayt formasi',
        stage,
        pipelineId: f.pipelineId || null,
        assigneeId: f.assigneeId || null,
        unsorted: true,
        formId: f.id,
        customJson: JSON.stringify(custom),
        queue: (queueAgg._max.queue ?? -1) + 1,
      },
    });
    await this.prisma.crmForm.update({ where: { id: f.id }, data: { submissions: { increment: 1 } } });
    await this.prisma.crmForm.update({ where: { id: f.id }, data: { submissions: { increment: 1 } } });
    await this.activity.record(lead.id, 'created', { actorName: 'Web forma', text: `Formadan keldi: ${f.title}` });
    await this.automation.run('lead_created', lead.id, 'Web forma');
    if (f.assigneeId) await this.notif.notify(f.assigneeId, `Formadan yangi lid: ${name}`, { type: 'lead', link: `/leads/detail/${lead.id}` });
    return { ok: true };
  }

  // Tashqi manba (Facebook Lead Ads va h.k.) — lid yaratish (web forma bilan bir xil oqim: unsorted + avtomatika).
  async createExternalLead(input: {
    name?: string | null; phone?: string | null; email?: string | null;
    custom?: Record<string, unknown>; source?: string;
    stageKey?: string | null; pipelineId?: string | null; assigneeId?: string | null; label?: string;
  }) {
    const src = input.source || 'Facebook';
    const name = String(input.name || 'Nomsiz lid').slice(0, 200);
    const phone = input.phone ? String(input.phone).slice(0, 50) : null;
    const email = input.email ? String(input.email).slice(0, 120) : null;
    const stage = input.stageKey || 'new';
    const queueAgg = await this.prisma.lead.aggregate({ where: { stage }, _max: { queue: true } });
    const lead = await this.prisma.lead.create({
      data: {
        name, phone, email,
        source: src,
        stage,
        pipelineId: input.pipelineId || null,
        assigneeId: input.assigneeId || null,
        unsorted: true,
        customJson: JSON.stringify(input.custom || {}),
        queue: (queueAgg._max.queue ?? -1) + 1,
      },
    });
    await this.activity.record(lead.id, 'created', { actorName: src, text: input.label ? `${src}: ${input.label}` : `${src} Lead Ads` });
    await this.automation.run('lead_created', lead.id, src);
    if (input.assigneeId) await this.notif.notify(input.assigneeId, `${src}'dan yangi lid: ${name}`, { type: 'lead', link: `/leads/detail/${lead.id}` });
    return lead;
  }
}

function defaultFields() {
  return [
    { key: 'name', label: 'Ismingiz', type: 'name', required: true },
    { key: 'phone', label: 'Telefon', type: 'phone', required: true },
    { key: 'email', label: 'Email', type: 'email', required: false },
  ];
}
function firstByType(fields: any[], answers: Record<string, any>, type: string) {
  const fd = fields.find((x) => x.type === type);
  return fd ? answers[fd.key] : undefined;
}
