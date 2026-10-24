import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

/**
 * Kechikkan / bugungi vazifalar uchun proaktiv eslatma (amoCRM falsafasi:
 * har lidda ochiq vazifa bo'lsin). Tashqi dependency'siz — ichki interval.
 * Dedupe DB orqali (link bo'yicha bugungi bildirishnoma bormi) — restart'ga chidamli.
 */
@Injectable()
export class ReminderService implements OnModuleInit {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationService,
  ) {}

  onModuleInit() {
    setTimeout(() => this.tick().catch(() => {}), 30_000);
    setInterval(() => this.tick().catch(() => {}), 60 * 60 * 1000);
  }

  async tick() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const startOfToday = new Date(todayStr + 'T00:00:00');
    const endOfToday = new Date(todayStr + 'T23:59:59');
    const now = new Date();

    const tasks = await this.prisma.leadTask.findMany({
      where: { done: false, assigneeId: { not: null }, dueDate: { not: null, lte: endOfToday } },
      include: { lead: { select: { name: true } } },
      take: 500,
    });
    if (!tasks.length) return { sent: 0 };

    // Bugun yuborilgan vazifa-eslatmalari (link bo'yicha) — dedupe
    const todaysNotifs = await this.prisma.notification.findMany({
      where: { type: 'task', createdAt: { gte: startOfToday } },
      select: { link: true },
    });
    const sentLinks = new Set(todaysNotifs.map((n) => n.link));

    let sent = 0;
    for (const t of tasks) {
      const link = `/crm?lead=${t.leadId}&task=${t.id}`;
      if (sentLinks.has(link)) continue;
      const overdue = t.dueDate && t.dueDate < now;
      const label = overdue ? 'Kechikkan vazifa' : 'Bugungi vazifa';
      await this.notif.notify(t.assigneeId!, `${label}: ${t.title}${t.lead?.name ? ` (${t.lead.name})` : ''}`, {
        type: 'task',
        link,
      });
      sentLinks.add(link);
      sent++;
    }
    if (sent) this.logger.log(`${sent} ta vazifa eslatmasi yuborildi`);
    return { sent };
  }
}
