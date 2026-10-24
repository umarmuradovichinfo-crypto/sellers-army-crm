import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { and, dirOf, entityConds, EntityFilter, parsePaging } from './list-query';

function parse<T>(s: string | null, fb: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fb; }
}

const MAX_NAME = 255;
function cleanName(v: unknown, required: boolean): string | undefined {
  if (v === undefined || v === null) return undefined;
  const n = String(v).trim();
  if (required && !n) throw new BadRequestException({ error: 'VALIDATION_ERROR', message: 'Nom majburiy' });
  if (n.length > MAX_NAME) throw new BadRequestException({ error: 'VALIDATION_ERROR', message: `Nom juda uzun (${MAX_NAME} belgigacha)` });
  return n;
}

type EntityQuery = EntityFilter & { kind?: string; limit?: string; cursor?: string; sort?: string; dir?: string };

/**
 * Kompaniya va Kontakt entitilari (amoCRM kabi lidlardan alohida).
 */
@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Kompaniyalar ──
  /**
   * Kompaniyalar. Parametrlar: limit, cursor, sort (name|createdAt|phone|email|assignee), dir, search (yoki q), name, phone, email, assigneeId, period, preset=mine.
   * `limit` berilmasa — eski shakl (birinchi 200 ta, nom bo'yicha); har doim `total` va `nextCursor` qaytadi.
   */
  async listCompanies(q: EntityQuery = {}, userId?: string) {
    const r = await this.listEntities({ ...q, kind: 'companies' }, userId, 200);
    return { companies: r.items.map(({ kind: _k, companyName: _c, assigneeId: _a, ...c }) => c), nextCursor: r.nextCursor, total: r.total };
  }
  async createCompany(dto: any, userId?: string) {
    const c = await this.prisma.company.create({
      data: {
        name: cleanName(dto.name, false) || 'Kompaniya',
        phone: dto.phone || null,
        email: dto.email || null,
        website: dto.website || null,
        customJson: JSON.stringify(dto.custom || {}),
        createdById: userId || null,
      },
    });
    return { company: { ...c, custom: parse(c.customJson, {}) } };
  }
  async updateCompany(id: string, dto: any) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = cleanName(dto.name, true);
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.website !== undefined) data.website = dto.website || null;
    if (dto.custom !== undefined) data.customJson = JSON.stringify(dto.custom || {});
    if (!(await this.prisma.company.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Kompaniya topilmadi' });
    const c = await this.prisma.company.update({ where: { id }, data });
    return { company: { ...c, custom: parse(c.customJson, {}) } };
  }
  async getCompany(id: string) {
    const c = await this.prisma.company.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Kompaniya topilmadi' });
    const [contacts, leads] = await Promise.all([
      this.prisma.contact.findMany({ where: { companyId: id } }),
      this.prisma.lead.findMany({ where: { companyId: id }, select: { id: true, name: true, stage: true, value: true } }),
    ]);
    return { company: { ...c, custom: parse(c.customJson, {}) }, contacts, leads };
  }
  async deleteCompany(id: string) {
    if (!(await this.prisma.company.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Kompaniya topilmadi' });
    await this.prisma.contact.updateMany({ where: { companyId: id }, data: { companyId: null } });
    await this.prisma.lead.updateMany({ where: { companyId: id }, data: { companyId: null } });
    await this.prisma.company.delete({ where: { id } });
    return { ok: true };
  }

  // ── Kontaktlar ──
  /** Kontaktlar (parametrlar listCompanies bilan bir xil). */
  async listContacts(q: EntityQuery = {}, userId?: string) {
    const r = await this.listEntities({ ...q, kind: 'contacts' }, userId, 200);
    return { contacts: r.items.map(({ kind: _k, companyName: _c, assigneeId: _a, ...c }) => c), nextCursor: r.nextCursor, total: r.total };
  }

  /**
   * Kontakt + kompaniya birlashgan ro'yxat (Ro'yxatlar sahifasi): kind=all|contacts|companies.
   * Server tomonida filtr, saralash va sahifalash (UNION ALL) — ikki manbani mijozda birlashtirish kerak emas.
   */
  async listEntities(q: EntityQuery = {}, userId?: string, defLimit = 50) {
    const kind = q.kind === 'contacts' || q.kind === 'companies' ? q.kind : 'all';
    const { paged, limit, offset } = parsePaging(q, defLimit, 200);
    const parts: Prisma.Sql[] = [];
    const cols = (t: string, k: string, extra: Prisma.Sql) => Prisma.sql`SELECT ${k}::text AS kind, x.id, x.name, x.phone, x.email, x."phoneDigits", x."assigneeKey", x."customJson", x."createdById", x."createdAt", x."updatedAt", ${extra}`;
    if (kind !== 'companies') {
      parts.push(Prisma.sql`${cols('c', 'contact', Prisma.sql`x.position, x."companyId", NULL::text AS website, cm.name AS "companyName"`)} FROM crm_contacts x LEFT JOIN crm_companies cm ON cm.id = x."companyId"`);
    }
    if (kind !== 'contacts') {
      parts.push(Prisma.sql`${cols('m', 'company', Prisma.sql`NULL::text AS position, NULL::text AS "companyId", x.website, NULL::text AS "companyName"`)} FROM crm_companies x`);
    }
    const union = Prisma.join(parts, ' UNION ALL ');
    const conds = entityConds(q, userId, 'u');
    const d = dirOf(q.dir ?? 'asc');
    const sortCol: Record<string, Prisma.Sql> = {
      name: Prisma.sql`lower(u.name)`, createdAt: Prisma.sql`u."createdAt"`, phone: Prisma.sql`u.phone`, email: Prisma.sql`lower(u.email)`,
      companyName: Prisma.sql`lower(u."companyName")`, assignee: Prisma.sql`lower(au.name)`,
    };
    const key = sortCol[q.sort || 'name'] ? q.sort || 'name' : 'name';
    const order = Prisma.sql`ORDER BY ${sortCol[key]} ${d} NULLS LAST, u.name ASC, u.kind ASC, u.id ASC`;
    const asgJoin = Prisma.sql`LEFT JOIN "User" au ON au.id = u."assigneeKey"`;
    const from = Prisma.sql`FROM (${union}) u ${key === 'assignee' ? asgJoin : Prisma.empty} WHERE ${and(conds)}`;
    const fromCount = Prisma.sql`FROM (${union}) u WHERE ${and(conds)}`;
    const [rows, cnt] = await Promise.all([
      this.prisma.$queryRaw<any[]>(Prisma.sql`SELECT u.* ${from} ${order} LIMIT ${limit + (paged ? 1 : 0)} OFFSET ${offset}`),
      this.prisma.$queryRaw<{ c: number }[]>(Prisma.sql`SELECT count(*)::int AS c ${fromCount}`),
    ]);
    const more = paged && rows.length > limit;
    const items = rows.slice(0, limit).map((r) => {
      const custom = parse<Record<string, any>>(r.customJson, {});
      const assigneeId = r.assigneeKey || '';
      const base = { id: r.id, name: r.name, phone: r.phone, email: r.email, customJson: r.customJson, createdById: r.createdById, createdAt: r.createdAt, updatedAt: r.updatedAt, phoneDigits: r.phoneDigits, custom };
      return r.kind === 'contact'
        ? { kind: 'contact' as const, ...base, position: r.position, companyId: r.companyId, companyName: r.companyName || '', assigneeId }
        : { kind: 'company' as const, ...base, website: r.website, companyName: '', assigneeId };
    });
    return { items, nextCursor: more ? String(offset + limit) : null, total: Number(cnt[0]?.c || 0) };
  }

  /** Ommaviy o'chirish: items (kind+id) yoki all+filtr (+excludeIds). Bog'langan bitim/kontaktlar uziladi. */
  async bulkDelete(dto: { items?: { kind: string; id: string }[]; all?: boolean; filter?: EntityQuery; excludeIds?: string[] }, userId?: string) {
    let items = Array.isArray(dto.items) ? dto.items : [];
    if (dto.all) {
      const r = await this.listEntitiesIds(dto.filter || {}, userId);
      const ex = new Set(dto.excludeIds || []);
      items = r.filter((x) => !ex.has(`${x.kind}:${x.id}`));
    }
    const contactIds = items.filter((i) => i.kind === 'contact').map((i) => i.id);
    const companyIds = items.filter((i) => i.kind === 'company').map((i) => i.id);
    const CH = 5000;
    let affected = 0;
    for (let i = 0; i < contactIds.length; i += CH) {
      const part = contactIds.slice(i, i + CH);
      await this.prisma.lead.updateMany({ where: { contactId: { in: part } }, data: { contactId: null } });
      affected += (await this.prisma.contact.deleteMany({ where: { id: { in: part } } })).count;
    }
    for (let i = 0; i < companyIds.length; i += CH) {
      const part = companyIds.slice(i, i + CH);
      await this.prisma.contact.updateMany({ where: { companyId: { in: part } }, data: { companyId: null } });
      await this.prisma.lead.updateMany({ where: { companyId: { in: part } }, data: { companyId: null } });
      affected += (await this.prisma.company.deleteMany({ where: { id: { in: part } } })).count;
    }
    return { ok: true, affected };
  }

  /** Filtrga mos barcha yozuvlarning kind+id ro'yxati ("hammasini belgilash" uchun). */
  async listEntitiesIds(q: EntityQuery = {}, userId?: string) {
    const kind = q.kind === 'contacts' || q.kind === 'companies' ? q.kind : 'all';
    const sub = (table: string, k: string) => Prisma.sql`SELECT ${k}::text AS kind, x.id, x.name, x.phone, x.email, x."phoneDigits", x."assigneeKey", x."customJson", x."createdById", x."createdAt" FROM ${Prisma.raw(table)} x`;
    const parts: Prisma.Sql[] = [];
    if (kind !== 'companies') parts.push(sub('crm_contacts', 'contact'));
    if (kind !== 'contacts') parts.push(sub('crm_companies', 'company'));
    const rows = await this.prisma.$queryRaw<{ kind: string; id: string }[]>(
      Prisma.sql`SELECT u.kind, u.id FROM (${Prisma.join(parts, ' UNION ALL ')}) u WHERE ${and(entityConds(q, userId, 'u'))}`,
    );
    return rows;
  }

  async getContact(id: string) {
    const c = await this.prisma.contact.findUnique({ where: { id } });
    if (!c) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Kontakt topilmadi' });
    const company = c.companyId ? await this.prisma.company.findUnique({ where: { id: c.companyId }, select: { id: true, name: true } }) : null;
    return { contact: { ...c, custom: parse(c.customJson, {}) }, company };
  }
  async createContact(dto: any, userId?: string) {
    if (dto.companyId && !(await this.prisma.company.findUnique({ where: { id: dto.companyId }, select: { id: true } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Kompaniya topilmadi' });
    const c = await this.prisma.contact.create({
      data: {
        name: cleanName(dto.name, false) || 'Kontakt',
        phone: dto.phone || null,
        email: dto.email || null,
        position: dto.position || null,
        companyId: dto.companyId || null,
        customJson: JSON.stringify(dto.custom || {}),
        createdById: userId || null,
      },
    });
    return { contact: { ...c, custom: parse(c.customJson, {}) } };
  }
  async updateContact(id: string, dto: any) {
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = cleanName(dto.name, true);
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.position !== undefined) data.position = dto.position || null;
    if (dto.companyId !== undefined) data.companyId = dto.companyId || null;
    if (dto.custom !== undefined) data.customJson = JSON.stringify(dto.custom || {});
    if (!(await this.prisma.contact.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Kontakt topilmadi' });
    if (data.companyId && !(await this.prisma.company.findUnique({ where: { id: data.companyId as string }, select: { id: true } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Kompaniya topilmadi' });
    const c = await this.prisma.contact.update({ where: { id }, data });
    return { contact: { ...c, custom: parse(c.customJson, {}) } };
  }
  async deleteContact(id: string) {
    if (!(await this.prisma.contact.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Kontakt topilmadi' });
    await this.prisma.lead.updateMany({ where: { contactId: id }, data: { contactId: null } });
    await this.prisma.contact.delete({ where: { id } });
    return { ok: true };
  }
}
