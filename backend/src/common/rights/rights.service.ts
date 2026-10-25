import { ForbiddenException, Global, Injectable, Module } from '@nestjs/common';

import type { AuthUser } from '../decorators/current-user.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { type Action, type Entity, type Level, type Rights, fullRights, normalizeRights } from './rights';

type Who = Pick<AuthUser, 'id' | 'role'>;

/**
 * Huquqlar matritsasini qo'llash: foydalanuvchi profili bo'yicha daraja va Prisma `where` cheklovi.
 * Kesh 15 soniya — sozlama o'zgarsa tez orada hamma joyda kuchga kiradi (saqlashda kesh tozalanadi).
 */
@Injectable()
export class RightsService {
  private roleCache = new Map<string, { at: number; rights: Rights }>();
  private groupCache = new Map<string, { at: number; ids: string[] }>();
  constructor(private readonly prisma: PrismaService) {}

  clear() { this.roleCache.clear(); this.groupCache.clear(); this.whoCache.clear(); }

  async rightsOf(user: Who): Promise<Rights> {
    if (!user?.role || user.role === 'super_admin') return fullRights();
    const c = this.roleCache.get(user.role);
    if (c && Date.now() - c.at < 15_000) return c.rights;
    const row = await this.prisma.role.findUnique({ where: { key: user.role }, select: { rightsJson: true } });
    let parsed: unknown = null;
    try { parsed = row?.rightsJson ? JSON.parse(row.rightsJson) : null; } catch { /* buzilgan — standart */ }
    const rights = normalizeRights(parsed);
    this.roleCache.set(user.role, { at: Date.now(), rights });
    return rights;
  }

  async level(user: Who, entity: Entity, action: Action): Promise<Level> {
    const r = await this.rightsOf(user);
    return ((r[entity] as Record<string, Level>)[action] ?? 'A') as Level;
  }

  /** Foydalanuvchi guruhidagi barcha foydalanuvchilar id'lari (o'zi ham); guruhsiz bo'lsa — faqat o'zi */
  async groupIds(userId: string): Promise<string[]> {
    const c = this.groupCache.get(userId);
    if (c && Date.now() - c.at < 15_000) return c.ids;
    const me = await this.prisma.user.findUnique({ where: { id: userId }, select: { groupId: true } });
    const ids = me?.groupId
      ? (await this.prisma.user.findMany({ where: { groupId: me.groupId }, select: { id: true } })).map((u) => u.id)
      : [userId];
    if (!ids.includes(userId)) ids.push(userId);
    this.groupCache.set(userId, { at: Date.now(), ids });
    return ids;
  }

  /**
   * Daraja bo'yicha mas'ul foydalanuvchilar to'plami: null — cheklov yo'q (A), [] — hech narsa (D),
   * aks holda ruxsat etilgan mas'ullar id'lari (M — o'zi, G — guruhi).
   */
  async owners(user: Who, entity: Entity, action: Action): Promise<string[] | null> {
    const lv = await this.level(user, entity, action);
    if (lv === 'A' || lv === 'L') return null;
    if (lv === 'D') return [];
    return lv === 'M' ? [user.id] : this.groupIds(user.id);
  }

  /** Ro'yxat so'rovi uchun `where` qo'shimchasi (field — mas'ul maydoni: assigneeId / assigneeKey) */
  async scope(user: Who, entity: Entity, action: Action, field: string): Promise<Record<string, unknown> | null> {
    const ids = await this.owners(user, entity, action);
    if (ids === null) return null;
    return { [field]: { in: ids.length ? ids : ['__none__'] } };
  }

  /** Bitta yozuv uchun tekshiruv: ruxsat bo'lmasa 403 */
  async assert(user: Who, entity: Entity, action: Action, ownerId?: string | null) {
    const ids = await this.owners(user, entity, action);
    if (ids === null) return;
    if (!ids.length || !ownerId || !ids.includes(ownerId)) {
      throw new ForbiddenException({ error: 'FORBIDDEN', message: "Bu amal uchun huquqingiz yo'q" });
    }
  }

  /** «Создание»: D bo'lsa 403 */
  async assertAdd(user: Who, entity: Entity) {
    if ((await this.level(user, entity, 'add')) === 'D') {
      throw new ForbiddenException({ error: 'FORBIDDEN', message: "Yaratish uchun huquqingiz yo'q" });
    }
  }

  private whoCache = new Map<string, { at: number; who: Who | null }>();
  /** Faqat id ma'lum bo'lgan joylar uchun (ro'yxat servislari): id → { id, role } */
  async who(userId: string): Promise<Who | null> {
    const c = this.whoCache.get(userId);
    if (c && Date.now() - c.at < 15_000) return c.who;
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: { select: { key: true } } } });
    const who = u ? { id: u.id, role: u.role.key } : null;
    this.whoCache.set(userId, { at: Date.now(), who });
    return who;
  }
  /** userId bo'yicha mas'ullar cheklovi (null — cheklovsiz; userId yo'q — tizim ichki chaqiruvi, cheklovsiz) */
  async ownersById(userId: string | undefined, entity: Entity, action: Action): Promise<string[] | null> {
    if (!userId) return null;
    const w = await this.who(userId);
    if (!w) return [];
    return this.owners(w, entity, action);
  }

  /** Bitim bo'yicha amal: ko'rish/tahrir/o'chirish — mas'ulga qarab; topilmasa 404 o'z joyida beriladi */
  async assertLead(user: Who, leadId: string, action: Action = 'view') {
    const l = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { assigneeId: true, unsorted: true } });
    if (!l) return;
    if (l.unsorted) return this.assertUnsorted(user, leadId, action === 'view' ? 'view' : action === 'delete' ? 'delete' : 'edit');
    const ids = await this.owners(user, 'leads', action);
    if (ids === null) return;
    if (!ids.length || !l.assigneeId || !ids.includes(l.assigneeId)) {
      throw new ForbiddenException({ error: 'FORBIDDEN', message: "Bu bitim uchun huquqingiz yo'q" });
    }
  }

  /** «Неразобранное» voronka bo'yicha: D bo'lsa ko'rish/qabul qilish/o'chirish taqiqlanadi */
  async unsortedDenied(userId: string | undefined, action: 'view' | 'edit' | 'delete'): Promise<string[]> {
    if (!userId) return [];
    const w = await this.who(userId);
    if (!w) return [];
    const r = await this.rightsOf(w);
    return Object.entries(r.unsorted).filter(([, v]) => v[action] === 'D').map(([pid]) => pid);
  }
  async assertUnsorted(user: Who, leadId: string, action: 'view' | 'edit' | 'delete') {
    const denied = await this.unsortedDenied(user.id, action);
    if (!denied.length) return;
    const l = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { pipelineId: true, unsorted: true } });
    if (l?.unsorted && denied.includes(l.pipelineId || '')) {
      throw new ForbiddenException({ error: 'FORBIDDEN', message: "«Saralanmagan» uchun huquqingiz yo'q" });
    }
  }

  /** Vazifa: tahrir/o'chirish — vazifa mas'uli bo'yicha; ko'rish — bitim ko'rinishi bo'yicha */
  async assertTask(user: Who, taskId: string, action: 'edit' | 'delete') {
    const ids = await this.owners(user, 'tasks', action);
    if (ids === null) return;
    const t = await this.prisma.leadTask.findUnique({ where: { id: taskId }, select: { assigneeId: true } });
    if (!t) return;
    if (!ids.length || !t.assigneeId || !ids.includes(t.assigneeId)) {
      throw new ForbiddenException({ error: 'FORBIDDEN', message: "Bu vazifa uchun huquqingiz yo'q" });
    }
  }

  /** Kontakt / kompaniya: mas'ul — assigneeKey */
  async assertEntity(user: Who, entity: 'contacts' | 'companies', id: string, action: Action) {
    const ids = await this.owners(user, entity, action);
    if (ids === null) return;
    const row = entity === 'contacts'
      ? await this.prisma.contact.findUnique({ where: { id }, select: { assigneeKey: true } })
      : await this.prisma.company.findUnique({ where: { id }, select: { assigneeKey: true } });
    if (!row) return;
    if (!ids.length || !row.assigneeKey || !ids.includes(row.assigneeKey)) {
      throw new ForbiddenException({ error: 'FORBIDDEN', message: "Bu yozuv uchun huquqingiz yo'q" });
    }
  }

  async can(user: Who, entity: Entity, action: Action, ownerId?: string | null) {
    const ids = await this.owners(user, entity, action);
    return ids === null || (!!ownerId && ids.includes(ownerId));
  }
}

@Global()
@Module({ providers: [RightsService], exports: [RightsService] })
export class RightsModule {}
