import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { PERMISSION_KEYS, PERMISSION_LABELS } from '../common/constants/permissions';
import { PrismaService } from '../prisma/prisma.service';

type UserRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  extension: string | null;
  createdAt: Date;
  role: { key: string; name: string };
};

function slugify(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'role';
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Barcha PERMISSION_KEYS bazada borligini ta'minlaydi + super_admin'ga hammasini beradi.
  // Yangi funksiya qo'shilganda kalit avtomatik shu yerdan paydo bo'ladi.
  private async ensurePermissions() {
    const existing = await this.prisma.permission.findMany();
    const have = new Set(existing.map((p) => p.key));
    const missing = PERMISSION_KEYS.filter((k) => !have.has(k));
    if (missing.length) {
      await this.prisma.permission.createMany({ data: missing.map((key) => ({ key })), skipDuplicates: true });
    }
    const all = await this.prisma.permission.findMany();
    const sa = await this.prisma.role.findUnique({ where: { key: 'super_admin' }, include: { permissions: true } });
    if (sa) {
      const has = new Set(sa.permissions.map((rp) => rp.permissionId));
      const add = all.filter((p) => !has.has(p.id)).map((p) => ({ roleId: sa.id, permissionId: p.id }));
      if (add.length) await this.prisma.rolePermission.createMany({ data: add, skipDuplicates: true });
    }
  }

  async getAccess() {
    await this.ensurePermissions();
    const roles = await this.prisma.role.findMany({
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      permissions: PERMISSION_KEYS.map((k) => ({ key: k, label: PERMISSION_LABELS[k] || k })),
      roles: roles.map((r) => ({
        key: r.key,
        name: r.name,
        isSystem: r.isSystem,
        users: r._count.users,
        permissions: r.permissions.map((rp) => rp.permission.key),
      })),
    };
  }

  async setPermission(roleKey: string, permission: string, allowed: boolean) {
    if (roleKey === 'super_admin')
      throw new BadRequestException({ error: 'SUPER', message: "Super admin barcha ruxsatlarga ega — o'zgartirilmaydi" });
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Rol topilmadi' });
    const perm = await this.prisma.permission.findUnique({ where: { key: permission } });
    if (!perm) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Ruxsat topilmadi' });

    if (allowed) {
      await this.prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
        create: { roleId: role.id, permissionId: perm.id },
        update: {},
      });
    } else {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id, permissionId: perm.id } });
    }
    return { roleKey, permission, allowed };
  }

  async createRole(name: string) {
    const trimmed = (name || '').trim();
    if (!trimmed) throw new BadRequestException({ error: 'BAD_NAME', message: 'Rol nomi bo`sh' });
    let key = slugify(trimmed);
    let i = 1;
    while (await this.prisma.role.findUnique({ where: { key } })) key = `${slugify(trimmed)}_${i++}`;
    const role = await this.prisma.role.create({ data: { key, name: trimmed, isSystem: false } });
    return { role: { key: role.key, name: role.name, isSystem: false, users: 0, permissions: [] } };
  }

  // ── Foydalanuvchilar (login/parol berish) ──
  private presentUser(u: UserRow) {
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      roleKey: u.role.key,
      roleName: u.role.name,
      isActive: u.isActive,
      extension: u.extension || null,
      createdAt: u.createdAt.toISOString(),
    };
  }

  private validEmail(email: string) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      include: { role: { select: { key: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return { users: users.map((u) => this.presentUser(u as UserRow)) };
  }

  async createUser(dto: { name: string; email: string; password: string; roleKey: string; extension?: string }) {
    const name = (dto.name || '').trim();
    const email = (dto.email || '').trim().toLowerCase();
    if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Ism majburiy' });
    if (!this.validEmail(email)) throw new BadRequestException({ error: 'BAD_EMAIL', message: "Email noto'g'ri" });
    if ((dto.password || '').length < 6) throw new BadRequestException({ error: 'BAD_PASS', message: 'Parol kamida 6 belgi bo`lsin' });
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException({ error: 'EMAIL_TAKEN', message: 'Bu email allaqachon ishlatilgan' });
    const role = await this.prisma.role.findUnique({ where: { key: dto.roleKey } });
    if (!role) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Rol topilmadi' });
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const u = await this.prisma.user.create({
      data: { name, email, passwordHash, roleId: role.id, extension: dto.extension?.trim() || null },
      include: { role: { select: { key: true, name: true } } },
    });
    return { user: this.presentUser(u as UserRow) };
  }

  async updateUser(
    id: string,
    dto: { name?: string; email?: string; roleKey?: string; isActive?: boolean; extension?: string },
    currentUserId?: string,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Foydalanuvchi topilmadi' });
    if (id === currentUserId && dto.isActive === false)
      throw new BadRequestException({ error: 'SELF', message: "O'z hisobingizni o'chira olmaysiz" });

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const n = dto.name.trim();
      if (!n) throw new BadRequestException({ error: 'BAD_NAME', message: 'Ism majburiy' });
      data.name = n;
    }
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (!this.validEmail(email)) throw new BadRequestException({ error: 'BAD_EMAIL', message: "Email noto'g'ri" });
      const other = await this.prisma.user.findUnique({ where: { email } });
      if (other && other.id !== id) throw new BadRequestException({ error: 'EMAIL_TAKEN', message: 'Bu email band' });
      data.email = email;
    }
    if (dto.roleKey !== undefined) {
      const role = await this.prisma.role.findUnique({ where: { key: dto.roleKey } });
      if (!role) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Rol topilmadi' });
      data.roleId = role.id;
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.extension !== undefined) data.extension = dto.extension.trim() || null;

    const u = await this.prisma.user.update({
      where: { id },
      data,
      include: { role: { select: { key: true, name: true } } },
    });
    return { user: this.presentUser(u as UserRow) };
  }

  async resetPassword(id: string, password: string) {
    if ((password || '').length < 6) throw new BadRequestException({ error: 'BAD_PASS', message: 'Parol kamida 6 belgi bo`lsin' });
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Foydalanuvchi topilmadi' });
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    return { success: true };
  }
}
