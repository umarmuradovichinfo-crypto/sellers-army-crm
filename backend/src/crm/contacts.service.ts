import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

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

/**
 * Kompaniya va Kontakt entitilari (amoCRM kabi lidlardan alohida).
 */
@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Kompaniyalar ──
  async listCompanies(q?: string) {
    const companies = await this.prisma.company.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : undefined,
      orderBy: { name: 'asc' },
      take: 200,
    });
    return { companies: companies.map((c) => ({ ...c, custom: parse(c.customJson, {}) })) };
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
  async listContacts(q?: string) {
    const contacts = await this.prisma.contact.findMany({
      where: q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : undefined,
      orderBy: { name: 'asc' },
      take: 200,
    });
    return { contacts: contacts.map((c) => ({ ...c, custom: parse(c.customJson, {}) })) };
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
