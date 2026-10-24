import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { AutomationService } from './automation.service';
import { NotificationService } from './notification.service';
import { TelegramClient } from './telegram.client';

/**
 * Omnichannel suhbat (hozircha Telegram). Kiruvchi xabar lidga bog'lanadi
 * (yoki yangi saralanmagan lid yaratiladi), CRM'dan javob yuboriladi.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tg: TelegramClient,
    private readonly activity: ActivityService,
    private readonly notif: NotificationService,
    private readonly automation: AutomationService,
  ) {}

  enabled() {
    return { telegram: this.tg.enabled() };
  }

  // Telegram webhook update'ini qayta ishlash
  async handleTelegramUpdate(update: any, secret?: string) {
    // Telegram sozlanmagan bo'lsa yoki (TELEGRAM_WEBHOOK_SECRET berilgan bo'lsa) maxfiy sarlavha mos kelmasa — e'tibor bermaymiz
    if (!this.tg.enabled()) return { ok: true, skipped: true };
    const expected = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (expected && expected !== (secret || '')) return { ok: false, error: 'BAD_SECRET' };
    const msg = update?.message || update?.edited_message;
    const text = msg?.text;
    const chat = msg?.chat;
    if (!chat?.id || !text) return { ok: true, skipped: true };
    const chatId = String(chat.id);
    const from = msg.from || {};
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || chat.title || 'Telegram foydalanuvchi';

    let lead = await this.prisma.lead.findFirst({ where: { telegramChatId: chatId } });
    let isNew = false;
    if (!lead) {
      const queueAgg = await this.prisma.lead.aggregate({ where: { stage: 'new' }, _max: { queue: true } });
      lead = await this.prisma.lead.create({
        data: {
          name,
          telegramChatId: chatId,
          source: 'Telegram',
          stage: 'new',
          unsorted: true,
          queue: (queueAgg._max.queue ?? -1) + 1,
        },
      });
      isNew = true;
    }

    await this.prisma.message.create({
      data: { leadId: lead.id, channel: 'telegram', direction: 'in', text: String(text).slice(0, 4000), senderName: name, externalId: String(msg.message_id ?? '') },
    });
    await this.activity.record(lead.id, 'email', { actorName: name, text: `📨 Telegram: ${String(text).slice(0, 120)}` });
    await this.prisma.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } }).catch(() => {});

    if (isNew) await this.automation.run('lead_created', lead.id, 'Telegram');
    if (lead.assigneeId) await this.notif.notify(lead.assigneeId, `Telegram xabar: ${name}`, { type: 'mention', link: `/crm?lead=${lead.id}` });

    return { ok: true, leadId: lead.id };
  }

  async listMessages(leadId: string) {
    const messages = await this.prisma.message.findMany({ where: { leadId }, orderBy: { createdAt: 'asc' }, take: 200 });
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { telegramChatId: true } });
    return { messages, canReply: !!lead?.telegramChatId && this.tg.enabled(), telegramLinked: !!lead?.telegramChatId, telegramEnabled: this.tg.enabled() };
  }

  async sendMessage(leadId: string, text: string, user?: AuthUser) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    if (!lead.telegramChatId) throw new BadRequestException({ error: 'NO_CHAT', message: 'Bu lidda Telegram suhbati yo`q' });
    if (!this.tg.enabled()) throw new ServiceUnavailableException({ error: 'TELEGRAM_DISABLED', message: 'Telegram sozlanmagan: TELEGRAM_BOT_TOKEN kerak' });
    const body = String(text || '').slice(0, 4000);
    if (!body.trim()) throw new BadRequestException({ error: 'EMPTY', message: 'Bo`sh xabar' });

    const res = await this.tg.sendMessage(lead.telegramChatId, body);
    if (!res.ok) throw new ServiceUnavailableException({ error: 'SEND_FAILED', message: 'Telegram: ' + (res.error || 'yuborilmadi') });
    const message = await this.prisma.message.create({
      data: { leadId, channel: 'telegram', direction: 'out', text: body, senderName: user?.name || 'Operator', externalId: res.messageId || null },
    });
    await this.activity.record(leadId, 'email', { actorId: user?.id, actorName: user?.name, text: `📤 Telegram: ${body.slice(0, 120)}` });
    return { message };
  }

  // Suhbatlar inbox — xabari bor lidlar, oxirgi xabar bo'yicha
  async listConversations() {
    const recent = await this.prisma.message.findMany({ orderBy: { createdAt: 'desc' }, take: 300 });
    const seen = new Set<string>();
    const order: string[] = [];
    const lastByLead = new Map<string, { text: string; direction: string; at: Date }>();
    for (const m of recent) {
      if (!lastByLead.has(m.leadId)) lastByLead.set(m.leadId, { text: m.text, direction: m.direction, at: m.createdAt });
      if (!seen.has(m.leadId)) { seen.add(m.leadId); order.push(m.leadId); }
    }
    const leads = await this.prisma.lead.findMany({ where: { id: { in: order } }, select: { id: true, name: true, source: true, assigneeId: true } });
    const byId = new Map(leads.map((l) => [l.id, l]));
    const conversations = order.map((id) => {
      const l = byId.get(id); const last = lastByLead.get(id);
      return l ? { leadId: id, name: l.name, source: l.source, last: last?.text || '', direction: last?.direction, at: last?.at?.toISOString() } : null;
    }).filter(Boolean);
    return { conversations };
  }

  async setupWebhook(url: string) {
    const r = await this.tg.setWebhook(url);
    return r;
  }
}
