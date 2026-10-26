import { IP_WHITELIST_KEY, IpWhitelistGuard } from '../common/guards/ip-whitelist.guard';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { PERMISSION_KEYS, PERMISSION_LABELS } from '../common/constants/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { LEVELS, fullRights, normalizeRights } from '../common/rights/rights';
import { RightsService } from '../common/rights/rights.service';
import { BillingService } from '../billing/billing.service';

type UserRow = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  extension: string | null;
  createdAt: Date;
  groupId?: string | null;
  role: { key: string; name: string };
  group?: { id: string; name: string } | null;
};
const USER_INCLUDE = { role: { select: { key: true, name: true } }, group: { select: { id: true, name: true } } } as const;

function slugify(name: string): string {
  return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'role';
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService, private readonly rightsSvc: RightsService, private readonly billing: BillingService) {}

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
        rights: r.key === 'super_admin' ? fullRights() : normalizeRights(this.parseRights(r.rightsJson)),
      })),
      levels: LEVELS,
    };
  }

  private parseRights(v: string | null) {
    try { return v ? JSON.parse(v) : null; } catch { return null; }
  }

  /** amoCRM «Права доступа»: profil matritsasini saqlash (administrator profili o'zgarmaydi) */
  async setRights(roleKey: string, rights: unknown) {
    if (roleKey === 'super_admin') throw new BadRequestException({ error: 'SYSTEM', message: "Administrator huquqlari o'zgarmaydi" });
    const role = await this.prisma.role.findUnique({ where: { key: roleKey } });
    if (!role) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Rol topilmadi' });
    const next = normalizeRights(rights);
    await this.prisma.role.update({ where: { id: role.id }, data: { rightsJson: JSON.stringify(next) } });
    this.rightsSvc.clear();
    return { rights: next };
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
      groupId: u.group?.id || null,
      groupName: u.group?.name || null,
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
      include: USER_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return { users: users.map((u) => this.presentUser(u as UserRow)) };
  }

  async createUser(dto: { name: string; email: string; password: string; roleKey: string; extension?: string; groupId?: string | null }) {
    const name = (dto.name || '').trim();
    const email = (dto.email || '').trim().toLowerCase();
    if (!name) throw new BadRequestException({ error: 'BAD_NAME', message: 'Ism majburiy' });
    if (name.length > 100) throw new BadRequestException({ error: 'BAD_NAME', message: 'Ism juda uzun (100 belgigacha)' });
    if (!this.validEmail(email)) throw new BadRequestException({ error: 'BAD_EMAIL', message: "Email noto'g'ri" });
    if ((dto.password || '').length < 6) throw new BadRequestException({ error: 'BAD_PASS', message: 'Parol kamida 6 belgi bo`lsin' });
    await this.billing.assertSeat();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new BadRequestException({ error: 'EMAIL_TAKEN', message: 'Bu email allaqachon ishlatilgan' });
    const role = await this.prisma.role.findUnique({ where: { key: dto.roleKey } });
    if (!role) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Rol topilmadi' });
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const u = await this.prisma.user.create({
      data: { name, email, passwordHash, roleId: role.id, extension: dto.extension?.trim() || null, groupId: await this.checkGroup(dto.groupId) },
      include: USER_INCLUDE,
    });
    return { user: this.presentUser(u as UserRow) };
  }

  async updateUser(
    id: string,
    dto: { name?: string; email?: string; roleKey?: string; isActive?: boolean; extension?: string; groupId?: string | null },
    currentUserId?: string,
    actorRole?: string,
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: { select: { key: true } } } });
    if (!existing) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Foydalanuvchi topilmadi' });
    // Super admin'ni faqat super admin tahrirlaydi; oxirgi faol super adminni tushirib/o'chirib bo'lmaydi
    const targetIsSuper = existing.role.key === 'super_admin';
    if ((targetIsSuper || dto.roleKey === 'super_admin') && actorRole !== undefined && actorRole !== 'super_admin') throw new ForbiddenException({ error: 'FORBIDDEN', message: "Super admin'ni faqat super admin o'zgartira oladi" });
    if (targetIsSuper && ((dto.roleKey !== undefined && dto.roleKey !== 'super_admin') || dto.isActive === false)) {
      const others = await this.prisma.user.count({ where: { id: { not: id }, isActive: true, role: { key: 'super_admin' } } });
      if (!others) throw new BadRequestException({ error: 'LAST_SUPER', message: "Oxirgi faol super adminni o'zgartirib yoki o'chirib bo'lmaydi" });
    }
    if (id === currentUserId && dto.isActive === false)
      throw new BadRequestException({ error: 'SELF', message: "O'z hisobingizni o'chira olmaysiz" });
    if (dto.name !== undefined && dto.name.trim().length > 100)
      throw new BadRequestException({ error: 'BAD_NAME', message: 'Ism juda uzun (100 belgigacha)' });

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
      if (id === currentUserId && role.id !== existing.roleId)
        throw new BadRequestException({ error: 'SELF', message: "O'z rolingizni o'zgartira olmaysiz" });
      data.roleId = role.id;
      this.rightsSvc.clear();
    }
    if (dto.isActive !== undefined) {
      if (dto.isActive === true && !existing.isActive) await this.billing.assertSeat();
      data.isActive = dto.isActive;
      // o'chirilgan foydalanuvchining sessiyalari ham yopiladi (qayta yoqilsa eski tokenlar tirilmasin)
      if (dto.isActive === false) await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    if (dto.extension !== undefined) data.extension = dto.extension.trim() || null;
    if (dto.groupId !== undefined) { data.groupId = await this.checkGroup(dto.groupId); this.rightsSvc.clear(); }

    const u = await this.prisma.user.update({
      where: { id },
      data,
      include: USER_INCLUDE,
    });
    return { user: this.presentUser(u as UserRow) };
  }

  async resetPassword(id: string, password: string, keepSid?: string, actorRole?: string) {
    if ((password || '').length < 6) throw new BadRequestException({ error: 'BAD_PASS', message: 'Parol kamida 6 belgi bo`lsin' });
    const existing = await this.prisma.user.findUnique({ where: { id }, include: { role: { select: { key: true } } } });
    if (!existing) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Foydalanuvchi topilmadi' });
    if (existing.role.key === 'super_admin' && actorRole !== undefined && actorRole !== 'super_admin') throw new ForbiddenException({ error: 'FORBIDDEN', message: "Super admin parolini faqat super admin o'zgartira oladi" });
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    // amoCRM: parol almashgach boshqa barcha qurilmalardagi sessiyalar yopiladi (joriydan tashqari)
    await this.prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null, ...(keepSid ? { NOT: { id: keepSid } } : {}) }, data: { revokedAt: new Date() } });
    return { success: true };
  }

  // O'z parolini o'zgartirish (har qanday rol) — joriy parol talab qilinadi
  async changeOwnPassword(id: string, currentPassword: string, password: string, sid?: string) {
    const me = await this.prisma.user.findUnique({ where: { id } });
    if (!me) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Foydalanuvchi topilmadi' });
    if (!currentPassword || !(await bcrypt.compare(currentPassword, me.passwordHash)))
      throw new BadRequestException({ error: 'BAD_CURRENT', message: "Joriy parol noto'g'ri" });
    return this.resetPassword(id, password, sid);
  }

  // ── amoCRM «Настройка групп»: guruhlar (otdellar) ──
  private async checkGroup(id?: string | null) {
    if (!id) return null;
    const g = await this.prisma.userGroup.findUnique({ where: { id } });
    if (!g) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Guruh topilmadi' });
    return g.id;
  }
  async listGroups() {
    const rows = await this.prisma.userGroup.findMany({ orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { users: true } } } });
    return { groups: rows.map((g) => ({ id: g.id, name: g.name, users: g._count.users })) };
  }
  private groupName(name: unknown) {
    const n = String(name || '').trim();
    if (!n) throw new BadRequestException({ error: 'BAD_NAME', message: 'Guruh nomi majburiy' });
    if (n.length > 60) throw new BadRequestException({ error: 'BAD_NAME', message: 'Nom juda uzun (60 belgigacha)' });
    return n;
  }
  async createGroup(name: unknown) {
    const n = this.groupName(name);
    const last = await this.prisma.userGroup.aggregate({ _max: { sort: true } });
    const g = await this.prisma.userGroup.create({ data: { name: n, sort: (last._max.sort ?? 0) + 1 } });
    return { group: { id: g.id, name: g.name, users: 0 } };
  }
  async renameGroup(id: string, name: unknown) {
    await this.checkGroup(id);
    const g = await this.prisma.userGroup.update({ where: { id }, data: { name: this.groupName(name) } });
    return { group: { id: g.id, name: g.name } };
  }
  /** Guruh o'chirilsa foydalanuvchilari «guruhsiz» qoladi (amoCRM ham o'chirishdan oldin ko'chirishni so'raydi) */
  async deleteGroup(id: string, moveTo?: string | null) {
    await this.checkGroup(id);
    const target = moveTo && moveTo !== id ? await this.checkGroup(moveTo) : null;
    await this.prisma.$transaction([
      this.prisma.user.updateMany({ where: { groupId: id }, data: { groupId: target } }),
      this.prisma.userGroup.delete({ where: { id } }),
    ]);
    this.rightsSvc.clear();
    return { success: true };
  }

  // ── amoCRM «Настройки профиля»: ID, Имя, Телефон, Email, Примечание + «Сеансы» ──
  async getProfile(id: string, sid?: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, phone: true, note: true, avatar: true } });
    if (!u) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Foydalanuvchi topilmadi' });
    const rows = await this.prisma.refreshToken.findMany({
      where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, ip: true, ua: true, createdAt: true, lastUsedAt: true },
    });
    const sessions = rows
      .map((r) => ({ id: r.id, ip: r.ip || '', ua: r.ua || '', lastAt: (r.lastUsedAt || r.createdAt).toISOString(), current: r.id === sid }))
      .sort((a, b) => Number(b.current) - Number(a.current) || b.lastAt.localeCompare(a.lastAt));
    return { profile: { ...u, phone: u.phone || '', note: u.note || '' }, sessions };
  }

  async saveProfile(id: string, dto: { name?: string; email?: string; phone?: string; note?: string; avatar?: string }) {
    await this.updateUser(id, { name: dto.name, email: dto.email }, id);
    const data: Record<string, string | null> = {};
    if (dto.phone !== undefined) data.phone = String(dto.phone).trim().slice(0, 40) || null;
    if (dto.note !== undefined) data.note = String(dto.note).slice(0, 2000) || null;
    if (dto.avatar !== undefined) {
      const a = String(dto.avatar);
      if (a && (!/^data:image\/(png|jpeg|webp);base64,/.test(a) || a.length > 300_000))
        throw new BadRequestException({ error: 'BAD_AVATAR', message: "Rasm noto'g'ri yoki juda katta" });
      data.avatar = a || null;
    }
    if (Object.keys(data).length) await this.prisma.user.update({ where: { id }, data });
    return this.getProfile(id);
  }

  /** «Сеансы» → «Выйти»: tanlangan qurilmadagi sessiyani yopish */
  async closeSession(userId: string, sessionId: string) {
    const r = await this.prisma.refreshToken.updateMany({ where: { id: sessionId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!r.count) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Sessiya topilmadi' });
    return { success: true };
  }

  // ── Xavfsizlik: IP oq ro'yxati (amoCRM "Белый список IP-адресов") ──
  async getSecurity(currentIp: string) {
    const row = await this.prisma.appSetting.findUnique({ where: { key: IP_WHITELIST_KEY } });
    let ips: string[] = [];
    try { const v = JSON.parse(row?.value || '{}'); ips = Array.isArray(v.ips) ? v.ips : []; } catch { /* */ }
    return { ips, currentIp };
  }
  async saveSecurity(body: { ips?: unknown }, currentIp: string) {
    const ips = [...new Set((Array.isArray(body?.ips) ? body.ips : []).map((x) => String(x).trim()).filter((x) => /^[0-9a-fA-F:.]{3,45}$/.test(x)))].slice(0, 100);
    // O'zini bloklab qo'ymaslik: ro'yxat bo'sh bo'lmasa joriy IP unda bo'lishi shart
    if (ips.length && !ips.includes(currentIp))
      throw new BadRequestException({ error: 'CURRENT_IP_MISSING', message: `Ro'yxatda joriy IP manzilingiz (${currentIp}) bo'lishi shart` });
    const value = JSON.stringify({ ips });
    await this.prisma.appSetting.upsert({ where: { key: IP_WHITELIST_KEY }, update: { value }, create: { key: IP_WHITELIST_KEY, value } });
    IpWhitelistGuard.invalidate();
    return { ips, currentIp };
  }

  // ── Umumiy sozlamalar (AppSetting 'general_settings' kaliti, JSON) ──
  private static readonly GENERAL_KEY = 'general_settings';
  private static readonly GENERAL_FIELDS = ['accountName', 'address', 'timezone', 'country', 'dateFormat', 'timeFormat', 'currency', 'nameOrder'];

  async getGeneral() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: SettingsService.GENERAL_KEY } });
    let saved: Record<string, unknown> = {};
    try { saved = JSON.parse(row?.value || '{}'); } catch { /* */ }
    return { general: saved };
  }

  async saveGeneral(body: Record<string, unknown>) {
    const cur = (await this.getGeneral()).general;
    const next: Record<string, unknown> = { ...(cur as Record<string, unknown>) };
    for (const k of SettingsService.GENERAL_FIELDS) {
      if (typeof body?.[k] === 'string') next[k] = (body[k] as string).trim().slice(0, 200);
    }
    // amoCRM «Общие настройки» → «Товары» (katalog yoqilgan/o'chirilgan)
    for (const k of ['products']) if (typeof body?.[k] === 'boolean') next[k] = body[k];
    // Chap menyu rolga qarab (amoCRM "Настройка левого меню"): { '*' | roleKey: [yashirin bo'lim kalitlari] }
    if (body?.navHidden && typeof body.navHidden === 'object' && !Array.isArray(body.navHidden)) {
      const ALLOWED = new Set(['dashboard', 'leads', 'imbox', 'todo', 'lists', 'stats', 'market']);
      const nav: Record<string, string[]> = {};
      for (const [role, keys] of Object.entries(body.navHidden as Record<string, unknown>).slice(0, 50)) {
        if (!/^[\w*-]{1,64}$/.test(role) || !Array.isArray(keys)) continue;
        nav[role] = [...new Set(keys.filter((k): k is string => typeof k === 'string' && ALLOWED.has(k)))];
      }
      next.navHidden = nav;
    }
    const value = JSON.stringify(next);
    await this.prisma.appSetting.upsert({
      where: { key: SettingsService.GENERAL_KEY },
      update: { value },
      create: { key: SettingsService.GENERAL_KEY, value },
    });
    return { general: next };
  }

  // ── amoCRM «Резервное копирование»: akkauntning barcha ma'lumotlari JSON (parol xeshlari, tokenlar, kalitlar YO'Q) ──
  async *backupChunks(): AsyncGenerator<string> {
    const p = this.prisma as unknown as Record<string, { findMany: (a: object) => Promise<unknown[]> }>;
    const tables: [string, string, object, object?][] = [
      ['roles', 'role', { key: 'asc' }],
      ['users', 'user', { id: 'asc' }, { id: true, name: true, email: true, phone: true, note: true, isActive: true, extension: true, roleId: true, createdAt: true }],
      ['pipelines', 'crmPipeline', { id: 'asc' }], ['stages', 'crmStage', { id: 'asc' }], ['fields', 'crmField', { id: 'asc' }],
      ['tags', 'crmTag', { id: 'asc' }], ['lostReasons', 'lostReason', { id: 'asc' }], ['products', 'product', { id: 'asc' }],
      ['companies', 'company', { id: 'asc' }], ['contacts', 'contact', { id: 'asc' }], ['leads', 'lead', { id: 'asc' }],
      ['leadContacts', 'leadContact', [{ leadId: 'asc' }, { contactId: 'asc' }]], ['tasks', 'leadTask', { id: 'asc' }],
      ['calls', 'callLog', { id: 'asc' }], ['messages', 'message', { id: 'asc' }], ['conversations', 'conversationState', { leadId: 'asc' }],
      ['events', 'activity', { id: 'asc' }], ['automations', 'automation', { id: 'asc' }], ['salesbots', 'salesbot', { id: 'asc' }],
      ['forms', 'crmForm', { id: 'asc' }], ['goals', 'salesGoal', { id: 'asc' }], ['savedFilters', 'savedFilter', { id: 'asc' }],
    ];
    yield `{"createdAt":${JSON.stringify(new Date().toISOString())}`;
    for (const [name, model, orderBy, select] of tables) {
      if (!p[model]) continue;
      yield `,${JSON.stringify(name)}:[`;
      let first = true;
      for (let skip = 0; ; skip += 1000) {
        const rows = await p[model].findMany({ orderBy, skip, take: 1000, ...(select ? { select } : {}) });
        for (const r of rows) { yield (first ? '' : ',') + JSON.stringify(r); first = false; }
        if (rows.length < 1000) break;
      }
      yield ']';
    }
    yield '}';
  }
}
