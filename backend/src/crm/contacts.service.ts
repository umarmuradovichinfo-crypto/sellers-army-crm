import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

function parse<T>(s: string | null, fb: T): T {
  try { return JSON.parse(s || '') as T; } catch { return fb; }
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
      where: q ? { name: { contains: q, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      take: 200,
    });
    return { companies: companies.map((c) => ({ ...c, custom: parse(c.customJson, {}) })) };
  }
  async createCompany(dto: any, userId?: string) {
    const c = await this.prisma.company.create({
      data: {
        name: (dto.name || '').trim() || 'Kompaniya',
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
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.website !== undefined) data.website = dto.website || null;
    if (dto.custom !== undefined) data.customJson = JSON.stringify(dto.custom || {});
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
    const c = await this.prisma.contact.create({
      data: {
        name: (dto.name || '').trim() || 'Kontakt',
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
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone || null;
    if (dto.email !== undefined) data.email = dto.email || null;
    if (dto.position !== undefined) data.position = dto.position || null;
    if (dto.companyId !== undefined) data.companyId = dto.companyId || null;
    if (dto.custom !== undefined) data.customJson = JSON.stringify(dto.custom || {});
    const c = await this.prisma.contact.update({ where: { id }, data });
    return { contact: { ...c, custom: parse(c.customJson, {}) } };
  }
  async deleteContact(id: string) {
    await this.prisma.lead.updateMany({ where: { contactId: id }, data: { contactId: null } });
    await this.prisma.contact.delete({ where: { id } });
    return { ok: true };
  }
}
