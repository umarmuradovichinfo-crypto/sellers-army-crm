import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * In-app bildirishnomalar. Vazifa biriktirilganda, lid kelganda, avtomatlashtirish
 * ishlaganda foydalanuvchiga xabar yuboriladi. Topbar qo'ng'iroq belgisida ko'rinadi.
 */
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(userId: string | null | undefined, text: string, opts: { type?: string; link?: string } = {}) {
    if (!userId) return;
    try {
      await this.prisma.notification.create({
        data: { userId, text, type: opts.type || 'info', link: opts.link || null },
      });
    } catch {
      /* jim */
    }
  }

  async list(userId: string) {
    const items = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const unread = items.filter((n) => !n.read).length;
    return { unread, items: items.map((n) => ({ id: n.id, type: n.type, text: n.text, link: n.link, read: n.read, at: n.createdAt.toISOString() })) };
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return { ok: true };
  }
}
