import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

function slugify(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
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
    const pipeline = await this.prisma.crmPipeline.create({ data: { name, order: (agg._max.order ?? -1) + 1 } });
    return { pipeline };
  }
  async updatePipeline(id: string, dto: { name?: string; order?: number }) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.order !== undefined) data.order = dto.order;
    const pipeline = await this.prisma.crmPipeline.update({ where: { id }, data });
    return { pipeline };
  }
  async deletePipeline(id: string) {
    // bosqichlar va lidlarni standart (null) voronkaga qaytaramiz
    await this.prisma.crmStage.updateMany({ where: { pipelineId: id }, data: { pipelineId: null } });
    await this.prisma.lead.updateMany({ where: { pipelineId: id }, data: { pipelineId: null } });
    await this.prisma.crmPipeline.delete({ where: { id } });
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
    let key = slugify(label); let i = 1;
    while (await this.prisma.crmField.findUnique({ where: { entity_key: { entity, key } } })) key = `${slugify(label)}_${i++}`;
    const agg = await this.prisma.crmField.aggregate({ where: { entity }, _max: { order: true } });
    const field = await this.prisma.crmField.create({
      data: {
        entity,
        key,
        label,
        type: dto.type || 'text',
        optionsJson: JSON.stringify(Array.isArray(dto.options) ? dto.options : []),
        required: !!dto.required,
        groupName: (dto.group || '').trim(),
        order: (agg._max.order ?? -1) + 1,
      },
    });
    return { field: { ...field, options: parse<string[]>(field.optionsJson, []), group: field.groupName || '' } };
  }
  async updateField(id: string, dto: any) {
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.options !== undefined) data.optionsJson = JSON.stringify(dto.options || []);
    if (dto.required !== undefined) data.required = !!dto.required;
    if (dto.order !== undefined) data.order = dto.order;
    if (dto.active !== undefined) data.active = !!dto.active;
    if (dto.group !== undefined) data.groupName = (dto.group || '').trim();
    const field = await this.prisma.crmField.update({ where: { id }, data });
    return { field: { ...field, options: parse<string[]>(field.optionsJson, []), group: field.groupName || '' } };
  }

  // amoCRM uslubi: bir nechta maydon tartibini birdan yangilash (drag/reorder)
  async reorderFields(ids: string[]) {
    if (!Array.isArray(ids)) return { ok: true };
    await this.prisma.$transaction(
      ids.map((id, i) => this.prisma.crmField.update({ where: { id }, data: { order: i } })),
    );
    return { ok: true };
  }
  async deleteField(id: string) {
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
    const reason = await this.prisma.lostReason.create({ data: { name, order: (agg._max.order ?? -1) + 1 } });
    return { reason };
  }
  async deleteLostReason(id: string) {
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
