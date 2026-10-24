import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { TAGS_LOCK_KEY, assertNewTagsAllowed, tagsLocked } from './tags-lock';

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
// Majburiy bosqichlar ro'yxati: bosqich kalitlari (string), takrorsiz, 200 tagacha
function stageList(v: unknown): string[] {
  return [...new Set((Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter((x) => x && x.length <= 120))].slice(0, 200);
}

@Injectable()
export class CrmSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Voronkalar (pipelines) ──
  async listPipelines() {
    const all = await this.prisma.crmPipeline.findMany({ orderBy: { order: 'asc' } });
    // arxivdagilar tanlov ro'yxatlariga tushmaydi — alohida "Архивные воронки"
    return { pipelines: all.filter((p) => !p.archived), archivedPipelines: all.filter((p) => p.archived) };
  }
  async createPipeline(dto: { name: string }) {
    const name = (dto.name || '').trim();
    if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
    const agg = await this.prisma.crmPipeline.aggregate({ _max: { order: true } });
    const pipeline = await this.prisma.crmPipeline.create({ data: { name: name.slice(0, 100), order: (agg._max.order ?? -1) + 1 } });
    return { pipeline };
  }
  async updatePipeline(id: string, dto: { name?: string; order?: number; archived?: boolean }) {
    if (!(await this.prisma.crmPipeline.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Voronka');
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const n = String(dto.name).trim();
      if (!n) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
      data.name = n.slice(0, 100);
    }
    if (dto.order !== undefined && Number.isFinite(Number(dto.order))) data.order = Math.round(Number(dto.order));
    if (dto.archived !== undefined) data.archived = !!dto.archived;
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
    return { fields: fields.map((f) => ({ ...f, options: parse<string[]>(f.optionsJson, []), group: f.groupName || '', requiredStages: parse<string[]>(f.requiredStagesJson, []) })) };
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
        requiredStagesJson: JSON.stringify(stageList(dto.requiredStages)),
        groupName: String(dto.group || '').trim().slice(0, 100),
        order: (agg._max.order ?? -1) + 1,
      },
    });
    return { field: { ...field, options: parse<string[]>(field.optionsJson, []), group: field.groupName || '', requiredStages: parse<string[]>(field.requiredStagesJson, []) } };
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
    if (dto.requiredStages !== undefined) data.requiredStagesJson = JSON.stringify(stageList(dto.requiredStages));
    if (dto.order !== undefined && Number.isFinite(Number(dto.order))) data.order = Math.round(Number(dto.order));
    if (dto.active !== undefined) data.active = !!dto.active;
    if (dto.group !== undefined) data.groupName = (dto.group || '').trim();
    const field = await this.prisma.crmField.update({ where: { id }, data });
    return { field: { ...field, options: parse<string[]>(field.optionsJson, []), group: field.groupName || '', requiredStages: parse<string[]>(field.requiredStagesJson, []) } };
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
  private async leadTagRows() {
    const leads = await this.prisma.lead.findMany({ where: { NOT: { tagsJson: '[]' } }, select: { id: true, tagsJson: true } });
    return leads.map((l) => ({ id: l.id, tags: parse<string[]>(l.tagsJson, []) })).filter((l) => l.tags.length);
  }
  // Bitimlarda teglarni almashtirish/olib tashlash: map(tag) -> yangi nom | null (olib tashlash)
  private async rewriteLeadTags(map: (t: string) => string | null) {
    let touched = 0;
    for (const l of await this.leadTagRows()) {
      const next = [...new Set(l.tags.map(map).filter((x): x is string => !!x))];
      if (next.length === l.tags.length && next.every((t, i) => t === l.tags[i])) continue;
      await this.prisma.lead.update({ where: { id: l.id }, data: { tagsJson: JSON.stringify(next) } });
      touched++;
    }
    return touched;
  }
  async listTags() {
    const rows = await this.leadTagRows();
    const usage = new Map<string, number>();
    for (const l of rows) for (const t of l.tags) usage.set(t, (usage.get(t) || 0) + 1);
    // bitimlarda bor, lekin katalogda yo'q teglar katalogga qo'shiladi
    const missing = [...usage.keys()].filter(Boolean);
    if (missing.length) await this.prisma.crmTag.createMany({ data: missing.map((name) => ({ name })), skipDuplicates: true });
    const tags = await this.prisma.crmTag.findMany({ orderBy: { name: 'asc' } });
    return { tags: tags.map((t) => ({ ...t, usage: usage.get(t.name) || 0 })) };
  }
  async getTagsSettings() {
    return { locked: await tagsLocked(this.prisma) };
  }
  async saveTagsSettings(dto: { locked?: boolean }) {
    const value = dto?.locked ? '1' : '0';
    await this.prisma.appSetting.upsert({ where: { key: TAGS_LOCK_KEY }, create: { key: TAGS_LOCK_KEY, value }, update: { value } });
    return { locked: value === '1' };
  }
  async upsertTag(dto: { name: string; color?: string }, user?: AuthUser) {
    const name = (dto.name || '').trim().slice(0, 100);
    if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
    await assertNewTagsAllowed(this.prisma, [name], user);
    const tag = await this.prisma.crmTag.upsert({
      where: { name },
      create: { name, color: dto.color || '#3F77DD' },
      update: dto.color ? { color: dto.color } : {},
    });
    return { tag };
  }
  // Nomini/rangini o'zgartirish; nom o'zgarsa barcha bitimlarda yangilanadi
  async updateTag(id: string, dto: { name?: string; color?: string }) {
    const tag = await this.prisma.crmTag.findUnique({ where: { id } });
    if (!tag) throw notFound('Teg');
    const data: { name?: string; color?: string } = {};
    if (dto.color) data.color = String(dto.color).slice(0, 20);
    let renamed = 0;
    if (dto.name !== undefined) {
      const name = String(dto.name).trim().slice(0, 100);
      if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom majburiy' });
      if (name !== tag.name) {
        if (await this.prisma.crmTag.findUnique({ where: { name }, select: { id: true } }))
          throw new BadRequestException({ error: 'TAG_EXISTS', message: 'Bunday teg allaqachon bor' });
        data.name = name;
        renamed = await this.rewriteLeadTags((t) => (t === tag.name ? name : t));
      }
    }
    const updated = await this.prisma.crmTag.update({ where: { id }, data });
    return { tag: updated, updatedLeads: renamed };
  }
  async deleteTag(id: string) {
    const tag = await this.prisma.crmTag.findUnique({ where: { id } });
    if (!tag) throw notFound('Teg');
    const removedFrom = await this.rewriteLeadTags((t) => (t === tag.name ? null : t));
    await this.prisma.crmTag.delete({ where: { id } });
    return { ok: true, removedFrom };
  }
  async deleteTags(ids: string[]) {
    const tags = await this.prisma.crmTag.findMany({ where: { id: { in: ids || [] } } });
    if (!tags.length) return { ok: true, deleted: 0 };
    const names = new Set(tags.map((t) => t.name));
    await this.rewriteLeadTags((t) => (names.has(t) ? null : t));
    await this.prisma.crmTag.deleteMany({ where: { id: { in: tags.map((t) => t.id) } } });
    return { ok: true, deleted: tags.length };
  }
  // Teglarni birlashtirish: fromIds -> intoId (bitimlarda almashtiriladi, eskilari o'chadi)
  async mergeTags(dto: { fromIds?: string[]; intoId?: string }) {
    const into = dto.intoId ? await this.prisma.crmTag.findUnique({ where: { id: dto.intoId } }) : null;
    if (!into) throw notFound('Teg');
    const from = await this.prisma.crmTag.findMany({ where: { id: { in: (dto.fromIds || []).filter((x) => x !== into.id) } } });
    if (!from.length) throw new BadRequestException({ error: 'NO_IDS', message: 'Birlashtiriladigan teg yo`q' });
    const names = new Set(from.map((t) => t.name));
    const updatedLeads = await this.rewriteLeadTags((t) => (names.has(t) ? into.name : t));
    await this.prisma.crmTag.deleteMany({ where: { id: { in: from.map((t) => t.id) } } });
    return { ok: true, merged: from.length, updatedLeads, tag: into };
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

  // ── Karta ko'rinishi / ro'yxat ustunlari (AppSetting: layout:<kind>:<userId>) ──
  private layoutKey(userId: string, kind?: string) {
    return `layout:${kind === 'list' ? 'list' : 'card'}:${userId}`;
  }
  async getLayout(userId: string, kind?: string) {
    const row = await this.prisma.appSetting.findUnique({ where: { key: this.layoutKey(userId, kind) } });
    let fields: string[] | null = null;
    try { const v = JSON.parse(row?.value || 'null'); if (Array.isArray(v)) fields = v.map(String); } catch { /* standart */ }
    return { kind: kind === 'list' ? 'list' : 'card', fields, custom: !!fields };
  }
  async saveLayout(userId: string, kind: string | undefined, fields?: string[]) {
    const clean = [...new Set((Array.isArray(fields) ? fields : []).map((x) => String(x).trim().slice(0, 80)).filter(Boolean))].slice(0, 80);
    const key = this.layoutKey(userId, kind);
    await this.prisma.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(clean) }, update: { value: JSON.stringify(clean) } });
    return { kind: kind === 'list' ? 'list' : 'card', fields: clean, custom: true };
  }
}
