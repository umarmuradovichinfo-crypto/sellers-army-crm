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
    const endOfToday = new Date(todayStr + 'T23:59:59');
    const now = new Date();

    const tasks = await this.prisma.leadTask.findMany({
      where: { done: false, assigneeId: { not: null }, dueDate: { not: null, lte: endOfToday } },
      include: { lead: { select: { name: true } } },
      take: 500,
    });
    if (!tasks.length) return { sent: 0 };

    // Har bir vazifa uchun bitta "bugungi" va bitta "kechikkan" eslatma (amoCRM kabi, har kuni takrorlanmaydi)
    const links = tasks.map((t) => `/leads/detail/${t.leadId}?task=${t.id}`);
    const prev = await this.prisma.notification.findMany({
      where: { type: { in: ['task', 'task_due'] }, link: { in: links } },
      select: { link: true, text: true },
    });
    const sentKeys = new Set(prev.map((n) => `${n.link}|${n.text.startsWith('Kechikkan') ? 'o' : 't'}`));

    let sent = 0;
    for (const t of tasks) {
      const link = `/leads/detail/${t.leadId}?task=${t.id}`;
      const overdue = !!t.dueDate && t.dueDate < now;
      const key = `${link}|${overdue ? 'o' : 't'}`;
      if (sentKeys.has(key)) continue;
      const label = overdue ? 'Kechikkan vazifa' : 'Bugungi vazifa';
      await this.notif.notify(t.assigneeId!, `${label}: ${t.title}${t.lead?.name ? ` (${t.lead.name})` : ''}`, {
        type: 'task_due',
        link,
      });
      sentKeys.add(key);
      sent++;
    }
    if (sent) this.logger.log(`${sent} ta vazifa eslatmasi yuborildi`);
    return { sent };
  }
}
