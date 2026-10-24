import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

function slugify(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
}
const FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'multiselect', 'date', 'url', 'checkbox', 'phone', 'email'];
const notFound = (what: string) => new NotFoundException({ error: 'NOT_FOUND', message: `${what} topilmadi` });
function cleanOptions(o: unknown): string[] {
  if (!Array.isArray(o)) return [];
  return [...new Set(o.map((x) => String(x ?? '').trim().slice(0, 100)).filter(Boolean))].slice(0, 200);
}
function parse<T>(s: string | null, fb: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fb; }
}

/**
 * CRM sozlamalari: voronkalar, maxsus maydonlar, yo'qotish sabablari,
 * teglar katalogi, saqlangan filtrlar.
 */
@Injectable()
export class CrmSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Voronkalar (pipelines) ──
  async listPipelines() {
    const pipelines = await this.prisma.crmPipeline.findMany({ orderBy: { order: 'asc' } });
    return { pipelines };
  }
  async createPipeline(dto: { name: string }) {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
    const agg = await this.prisma.crmPipeline.aggregate({ _max: { order: true } });
    const pipeline = await this.prisma.crmPipeline.create({ data: { name: name.slice(0, 100), order: (agg._max.order ?? -1) + 1 } });
    return { pipeline };
  }
  async updatePipeline(id: string, dto: { name?: string; order?: number }) {
    if (!(await this.prisma.crmPipeline.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Voronka');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const n = String(dto.name).trim();
      if (!n) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
      data.name = n.slice(0, 100);
    }
    if (dto.order !== undefined && Number.isFinite(Number(dto.order))) data.order = Math.round(Number(dto.order));
    const pipeline = await this.prisma.crmPipeline.update({ where: { id }, data });
    return { pipeline };
  }
  async deletePipeline(id: string) {
    if (!(await this.prisma.crmPipeline.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Voronka');
    // bosqichlar, lidlar va avtomatlashtirishlarni standart (null) voronkaga qaytaramiz
    await this.prisma.$transaction([
      this.prisma.crmStage.updateMany({ where: { pipelineId: id }, data: { pipelineId: null } }),
      this.prisma.lead.updateMany({ where: { pipelineId: id }, data: { pipelineId: null } }),
      this.prisma.automation.updateMany({ where: { pipelineId: id }, data: { pipelineId: null } }),
      this.prisma.crmPipeline.delete({ where: { id } }),
    ]);
    return { ok: true };
  }

  // ── Maxsus maydonlar ──
  async listFields(entity = 'lead') {
    const fields = await this.prisma.crmField.findMany({ where: { entity }, orderBy: { order: 'asc' } });
    return { fields: fields.map((f) => ({ ...f, options: parse<string[]>(f.optionsJson, []), group: f.groupName || '' })) };
  }
  async createField(dto: any) {
    const label = (dto.label || '').trim();
    if (!label) throw new BadRequestException({ error: 'BAD_LABEL', message: 'Maydon nomi majburiy' });
    const entity = dto.entity || 'lead';
    if (!['lead', 'contact', 'company'].includes(entity)) throw new BadRequestException({ error: 'BAD_ENTITY', message: `Noma'lum ob'ekt: ${entity}` });
    const type = dto.type || 'text';
    if (!FIELD_TYPES.includes(type)) throw new BadRequestException({ error: 'BAD_TYPE', message: `Noma'lum maydon turi: ${type}` });
    const options = cleanOptions(dto.options);
    if ((type === 'select' || type === 'multiselect') && options.length === 0)
      throw new BadRequestException({ error: 'BAD_OPTIONS', message: "Ro'yxat uchun kamida bitta variant kerak" });
    let key = slugify(label); let i = 1;
    while (await this.prisma.crmField.findUnique({ where: { entity_key: { entity, key } } })) key = `${slugify(label)}_${i++}`;
    const agg = await this.prisma.crmField.aggregate({ where: { entity }, _max: { order: true } });
    const field = await this.prisma.crmField.create({
      data: {
        entity,
        key,
        label: label.slice(0, 100),
        type,
        optionsJson: JSON.stringify(options),
        required: !!dto.required,
        groupName: String(dto.group || '').trim().slice(0, 100),
        order: (agg._max.order ?? -1) + 1,
      },
    });
    return { field: { ...field, options: parse<string[]>(field.optionsJson, []), group: field.groupName || '' } };
  }
  async updateField(id: string, dto: any) {
    const cur = await this.prisma.crmField.findUnique({ where: { id } });
    if (!cur) throw notFound('Maydon');
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) {
      const l = String(dto.label).trim();
      if (!l) throw new BadRequestException({ error: 'BAD_LABEL', message: 'Maydon nomi majburiy' });
      data.label = l.slice(0, 100);
    }
    if (dto.type !== undefined) {
      if (!FIELD_TYPES.includes(dto.type)) throw new BadRequestException({ error: 'BAD_TYPE', message: `Noma'lum maydon turi: ${dto.type}` });
      data.type = dto.type;
    }
    if (dto.options !== undefined) data.optionsJson = JSON.stringify(cleanOptions(dto.options));
    const finalType = (data.type as string) ?? cur.type;
    if ((finalType === 'select' || finalType === 'multiselect') && JSON.parse((data.optionsJson as string) ?? cur.optionsJson).length === 0)
      throw new BadRequestException({ error: 'BAD_OPTIONS', message: "Ro'yxat uchun kamida bitta variant kerak" });
    if (dto.required !== undefined) data.required = !!dto.required;
    if (dto.order !== undefined && Number.isFinite(Number(dto.order))) data.order = Math.round(Number(dto.order));
    if (dto.active !== undefined) data.active = !!dto.active;
    if (dto.group !== undefined) data.groupName = (dto.group || '').trim();
    const field = await this.prisma.crmField.update({ where: { id }, data });
    return { field: { ...field, options: parse<string[]>(field.optionsJson, []), group: field.groupName || '' } };
  }

  // amoCRM uslubi: bir nechta maydon tartibini birdan yangilash (drag/reorder)
  async reorderFields(ids: string[]) {
    if (!Array.isArray(ids)) return { ok: true };
    const have = new Set((await this.prisma.crmField.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((f) => f.id));
    ids = ids.filter((id) => have.has(id));
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.crmField.update({ where: { id }, data: { order: i } })),
    );
    return { ok: true };
  }
  async deleteField(id: string) {
    if (!(await this.prisma.crmField.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Maydon');
    await this.prisma.crmField.delete({ where: { id } });
    return { ok: true };
  }

  // ── Yo'qotish sabablari ──
  async listLostReasons() {
    return { reasons: await this.prisma.lostReason.findMany({ where: { active: true }, orderBy: { order: 'asc' } }) };
  }
  async createLostReason(dto: { name: string }) {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
    const agg = await this.prisma.lostReason.aggregate({ _max: { order: true } });
    const reason = await this.prisma.lostReason.create({ data: { name: name.slice(0, 100), order: (agg._max.order ?? -1) + 1 } });
    return { reason };
  }
  async updateLostReason(id: string, dto: { name?: string }) {
    if (!(await this.prisma.lostReason.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Sabab');
    const name = String(dto?.name ?? '').trim();
    if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
    const reason = await this.prisma.lostReason.update({ where: { id }, data: { name: name.slice(0, 100) } });
    return { reason };
  }
  async reorderLostReasons(ids: string[]) {
    if (!Array.isArray(ids)) return { ok: true };
    const have = new Set((await this.prisma.lostReason.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id));
    ids = ids.filter((id) => have.has(id));
    await this.prisma.$transaction(ids.map((id, i) => this.prisma.lostReason.update({ where: { id }, data: { order: i } })));
    return { ok: true };
  }
  async deleteLostReason(id: string) {
    if (!(await this.prisma.lostReason.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Sabab');
    await this.prisma.lostReason.update({ where: { id }, data: { active: false } });
    return { ok: true };
  }

  // ── Teglar katalogi ──
  async listTags() {
    return { tags: await this.prisma.crmTag.findMany({ orderBy: { name: 'asc' } }) };
  }
  async upsertTag(dto: { name: string; color?: string }) {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
    const tag = await this.prisma.crmTag.upsert({
      where: { name },
      create: { name, color: dto.color || '#3F77DD' },
      update: dto.color ? { color: dto.color } : {},
    });
    return { tag };
  }
  async deleteTag(id: string) {
    if (!(await this.prisma.crmTag.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Teg');
    await this.prisma.crmTag.delete({ where: { id } });
    return { ok: true };
  }

  // ── Saqlangan filtrlar ──
  async listFilters(userId: string) {
    return { filters: await this.prisma.savedFilter.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }) };
  }
  async createFilter(userId: string, dto: { name: string; params?: unknown }) {
    const filter = await this.prisma.savedFilter.create({
      data: { userId, name: (dto.name || 'Filtr').trim(), paramsJson: JSON.stringify(dto.params || {}) },
    });
    return { filter };
  }
  async deleteFilter(userId: string, id: string) {
    await this.prisma.savedFilter.deleteMany({ where: { id, userId } });
    return { ok: true };
  }
}
