import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { AutomationService } from './automation.service';
import { NotificationService } from './notification.service';
import { PipelineSettingsService } from './pipeline-settings.service';
import { TelegramClient } from './telegram.client';

const safeList = (v?: string | null): string[] => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
function periodStart(p?: string): Date | null {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const day = 86400000;
  switch (p) {
    case 'today': return d0;
    case 'yesterday': return new Date(d0.getTime() - day);
    case 'week': { const d = new Date(d0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }
    case 'month': return new Date(d0.getFullYear(), d0.getMonth(), 1);
    case '30d': return new Date(d0.getTime() - 30 * day);
    default: return null;
  }
}

/** Instagram / Facebook Messenger / izohlar uchun Graph provayderi (FacebookModule ro'yxatdan o'tkazadi; modullar orasida aylanma bog'liqlik bo'lmasligi uchun). */
export type SocialChannel = 'instagram' | 'facebook';
export interface SocialProvider {
  connected(): Promise<{ facebook: boolean; instagram: boolean }>;
  hasPage(pageId: string): Promise<boolean>;
  sendMessage(a: { pageId: string; recipientId: string; text: string; buttons?: string[] }): Promise<{ id?: string }>;
  replyComment(a: { channel: SocialChannel; pageId: string; commentId: string; text: string }): Promise<{ id?: string }>;
  react?(a: { pageId: string; recipientId: string; messageId: string }): Promise<unknown>;
}

/** Meta 24 soatlik xabar oynasi */
const WINDOW_MS = 24 * 60 * 60 * 1000;
const isSocial = (c?: string | null): c is SocialChannel => c === 'instagram' || c === 'facebook';
const CH_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook Messenger', telegram: 'Telegram' };

/** Graph xatosini foydalanuvchiga tushunarli matnga aylantiradi (24 soatlik oyna va boshqalar). */
export function friendlySocialError(e: any, channel: string): { error: string; message: string } {
  const msg = String(e?.message || '');
  const code = Number(e?.code);
  const sub = Number(e?.subcode);
  if (sub === 2018278 || sub === 2534022 || sub === 2018108 || /outside of allowed window|24[- ]?hour|allowed window/i.test(msg)) {
    return { error: 'WINDOW_CLOSED', message: `24 soatlik oyna yopilgan: mijoz oxirgi marta 24 soatdan oldin yozgan, endi ${CH_LABEL[channel] || 'bu kanal'} orqali javob yozib bo'lmaydi. Mijoz yana yozguncha kuting.` };
  }
  if (code === 190 || /access token|session has expired|OAuthException/i.test(msg)) {
    return { error: 'TOKEN', message: "Facebook ruxsati eskirgan — Integratsiyalar → Facebook bo'limida «Qayta ulash»ni bosing." };
  }
  if (code === 10 || code === 200 || sub === 2018065) {
    return { error: 'PERMISSION', message: `Ruxsat yetarli emas (${CH_LABEL[channel] || 'Meta'}): ${msg}` };
  }
  return { error: 'SEND_FAILED', message: `${CH_LABEL[channel] || 'Meta'}: ${msg || 'yuborilmadi'}` };
}

/**
 * Omnichannel suhbat (Telegram, Instagram Direct/izohlar, Facebook Messenger). Kiruvchi xabar lidga bog'lanadi
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
    private readonly pset: PipelineSettingsService,
  ) {}

  private social: SocialProvider | null = null;
  registerSocial(p: SocialProvider) { this.social = p; }

  async enabled() {
    const meta = this.social ? await this.social.connected().catch(() => ({ facebook: false, instagram: false })) : { facebook: false, instagram: false };
    return { telegram: this.tg.enabled(), facebook: meta.facebook, instagram: meta.instagram };
  }

  // Telegram webhook update'ini qayta ishlash
  // ── Sozlamalar → Chatlar va messenjerlar (amoCRM): javob shablonlari va "Беседы" qoidasi ──
  private static readonly SETTINGS_KEY = 'chat_settings';
  static readonly REPLY_LIMITS = [0, 1, 5, 15, 30, 60, 120, 240, 1440];
  async getChatSettings() {
    const row = await this.prisma.appSetting.findUnique({ where: { key: ChatService.SETTINGS_KEY } });
    let v: any = {};
    try { v = JSON.parse(row?.value || '{}'); } catch { /* */ }
    return {
      templates: Array.isArray(v.templates) ? v.templates : [],
      // always — 24 soat jim bo'lgandan keyin yangi suhbat yangi bitimda; no_active — faol bitim bo'lmasa yangi (standart); no_leads — hech bitim bo'lmasa
      conversationRule: ['always', 'no_active', 'no_leads'].includes(v.conversationRule) ? v.conversationRule : 'no_active',
      // amoCRM: «Меню imBox + центр нотификаций» (true) yoki faqat «Центр нотификаций» (false — imBox menyuda yo'q)
      imboxMenu: v.imboxMenu !== false,
      // «Отмечать событие, если превышено время ответа на сообщение» (daqiqa; 0 — o'chiq)
      replyLimitMin: ChatService.REPLY_LIMITS.includes(Number(v.replyLimitMin)) ? Number(v.replyLimitMin) : 0,
    };
  }
  async saveChatSettings(body: any) {
    const cur = await this.getChatSettings();
    const next = { ...cur };
    if (Array.isArray(body?.templates)) {
      next.templates = body.templates.slice(0, 200).map((x: any, i: number) => ({
        id: String(x?.id || `t${Date.now()}${i}`).slice(0, 40),
        name: String(x?.name || '').trim().slice(0, 120),
        active: x?.active !== false,
        text: String(x?.text || '').slice(0, 4000),
      })).filter((x: any) => x.name && x.text);
    }
    if (['always', 'no_active', 'no_leads'].includes(body?.conversationRule)) next.conversationRule = body.conversationRule;
    if (typeof body?.imboxMenu === 'boolean') next.imboxMenu = body.imboxMenu;
    if (body?.replyLimitMin !== undefined && ChatService.REPLY_LIMITS.includes(Number(body.replyLimitMin))) next.replyLimitMin = Number(body.replyLimitMin);
    const value = JSON.stringify(next);
    await this.prisma.appSetting.upsert({ where: { key: ChatService.SETTINGS_KEY }, update: { value }, create: { key: ChatService.SETTINGS_KEY, value } });
    return next;
  }
  /** Mavjud bitimni shu suhbat uchun qayta ishlatish mumkinmi ("Беседы" qoidasi bo'yicha). */
  private async reuseLead(lead: { id: string; stage: string; wonAt: Date | null; lostAt: Date | null } | null, lastAt?: Date | null) {
    if (!lead) return false;
    const { conversationRule } = await this.getChatSettings();
    if (conversationRule === 'no_leads') return true;
    const st = await this.prisma.crmStage.findUnique({ where: { key: lead.stage } }).catch(() => null);
    const open = !lead.wonAt && !lead.lostAt && (!st || st.kind === 'open');
    if (!open) return false;
    if (conversationRule === 'always' && lastAt && Date.now() - lastAt.getTime() > 24 * 3600000) return false;
    return true;
  }

  async handleTelegramUpdate(update: any, secret?: string) {
    // Telegram sozlanmagan bo'lsa yoki maxfiy sarlavha mos kelmasa — e'tibor bermaymiz
    if (!this.tg.enabled()) return { ok: true, skipped: true };
    if (!this.tg.checkSecret(secret)) return { ok: false, error: 'BAD_SECRET' };
    // Salesbot tugmasi bosildi (inline klaviatura) — mijozning shu matnli javobi sifatida
    const cq = update?.callback_query;
    if (cq) {
      this.tg.answerCallback(String(cq.id)).catch(() => undefined);
      const btn = (cq.message?.reply_markup?.inline_keyboard || []).flat().find((b: any) => b?.callback_data === cq.data);
      update = { message: { message_id: cq.message?.message_id ? `${cq.message.message_id}-cb-${cq.id}` : cq.id, text: btn?.text || cq.data, chat: cq.message?.chat, from: cq.from } };
    }
    const msg = update?.message || update?.edited_message;
    const text = msg?.text;
    const chat = msg?.chat;
    if (!chat?.id || !text) return { ok: true, skipped: true };
    const chatId = String(chat.id);
    const from = msg.from || {};
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || chat.title || 'Telegram foydalanuvchi';

    let lead = await this.prisma.lead.findFirst({ where: { telegramChatId: chatId }, orderBy: { createdAt: 'desc' } });
    if (lead) {
      const last = await this.prisma.message.findFirst({ where: { leadId: lead.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } });
      if (!(await this.reuseLead(lead, last?.createdAt))) lead = null;
    }
    let isNew = false;
    if (!lead) {
      // Dublikat qoidalari: (Telegram'da telefon/email yo'q — custom maydon moslig'i uchun faqat nom bilan chaqiriladi)
      const dup = await this.pset.mergeIncoming({ name, custom: {}, pipelineId: null, origin: { kind: 'telegram', label: 'Telegram' } }, 'Telegram');
      if (dup) {
        lead = await this.prisma.lead.update({ where: { id: dup.id }, data: { telegramChatId: dup.telegramChatId || chatId } });
      } else {
        const place = await this.pset.place(null, null);
        lead = await this.prisma.lead.create({
          data: {
            name,
            telegramChatId: chatId,
            source: 'Telegram',
            stage: place.stage,
            pipelineId: place.pipelineId,
            unsorted: place.unsorted,
            queue: place.queue,
          },
        });
        isNew = true;
      }
    }
    // Suhbat hodisalari uchun xabar yozilishidan OLDINgi holat
    const prevAny = await this.prisma.message.count({ where: { leadId: lead.id } });
    const prevIn = await this.prisma.message.count({ where: { leadId: lead.id, direction: 'in' } });

    const convNo = await this.convFor(lead.id, true);
    await this.prisma.message.create({
      data: { leadId: lead.id, channel: 'telegram', direction: 'in', text: String(text).slice(0, 4000), senderName: name, externalId: String(msg.message_id ?? ''), convNo },
    });
    await this.automation.salesbot?.onReply(lead.id, String(text)).catch(() => false);
    await this.activity.record(lead.id, 'email', { actorName: name, text: `📨 Telegram: ${String(text).slice(0, 120)}` });
    await this.prisma.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } }).catch(() => {});

    if (isNew) await this.automation.fire('lead_created', lead.id, { actorName: 'Telegram' });
    // amoCRM suhbat triggerlari: kiruvchi xabar bilan suhbat yaratilganda / birinchi kiruvchi xabarda
    if (prevAny === 0) await this.automation.fire('conversation_created', lead.id, { actorName: 'Telegram' });
    if (prevIn === 0) await this.automation.fire('message_in', lead.id, { actorName: 'Telegram' });
    if (lead.assigneeId) await this.notif.notify(lead.assigneeId, `Telegram xabar: ${name}`, { type: 'mention', link: `/leads/detail/${lead.id}` });

    return { ok: true, leadId: lead.id };
  }

  /** Lidning javob kanali: oxirgi kiruvchi xabar; yo'q bo'lsa Telegram. */
  private async replyTarget(leadId: string) {
    return this.prisma.message.findFirst({ where: { leadId, direction: 'in' }, orderBy: { createdAt: 'desc' } });
  }

  async listMessages(leadId: string, userId?: string) {
    const messages = await this.prisma.message.findMany({ where: { leadId }, orderBy: { createdAt: 'asc' }, take: 200 });
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { telegramChatId: true } });
    const lastIn = [...messages].reverse().find((m) => m.direction === 'in');
    const tgOk = !!lead?.telegramChatId && this.tg.enabled();
    const st = await this.prisma.conversationState.findUnique({ where: { leadId } });
    const base = { messages, telegramLinked: !!lead?.telegramChatId, telegramEnabled: this.tg.enabled(), closed: !!st?.closed, closedAt: st?.closedAt?.toISOString() || null, fav: !!userId && safeList(st?.favJson).includes(userId), convNo: st?.number ?? null };
    // Instagram / Messenger: javob oxirgi kiruvchi xabar kanaliga
    if (lastIn && isSocial(lastIn.channel) && lastIn.threadId && lastIn.pageId && this.social) {
      const pageOk = await this.social.hasPage(lastIn.pageId).catch(() => false);
      const comment = lastIn.kind === 'comment';
      const expiresAt = new Date(lastIn.createdAt.getTime() + WINDOW_MS);
      const windowOpen = comment ? true : expiresAt.getTime() > Date.now();
      return { ...base, canReply: pageOk && windowOpen, channel: lastIn.channel, channelLabel: CH_LABEL[lastIn.channel], replyKind: lastIn.kind, windowOpen, windowExpiresAt: comment ? null : expiresAt.toISOString(), replyDisabledReason: !pageOk ? 'NOT_CONNECTED' : !windowOpen ? 'WINDOW_CLOSED' : null };
    }
    return { ...base, canReply: tgOk, channel: lead?.telegramChatId ? 'telegram' : null, channelLabel: lead?.telegramChatId ? 'Telegram' : null, replyKind: 'message', windowOpen: true, windowExpiresAt: null };
  }

  /** opts.buttons — Salesbot tugmalari (Telegram inline, Messenger/Instagram quick replies); lentada matn ostida [Tugma] bo'lib saqlanadi. */
  async sendMessage(leadId: string, text: string, user?: AuthUser, opts: { buttons?: string[] } = {}) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    const body = String(text || '').slice(0, 4000);
    if (!body.trim()) throw new BadRequestException({ error: 'EMPTY', message: 'Bo`sh xabar' });

    const target = await this.replyTarget(leadId);
    const buttons = (opts.buttons || []).map((b) => String(b).trim()).filter(Boolean)
    const stored = buttons.length ? `${body}\n\n${buttons.map((b) => `[${b}]`).join(' ')}` : body;
    if (target && isSocial(target.channel) && target.threadId && target.pageId) return this.sendSocial(lead.id, target, body, user, buttons, stored);

    if (!lead.telegramChatId) throw new BadRequestException({ error: 'NO_CHAT', message: 'Bu lidda javob yuboriladigan suhbat yo`q' });
    if (!this.tg.enabled()) throw new ServiceUnavailableException({ error: 'TELEGRAM_DISABLED', message: 'Telegram sozlanmagan: TELEGRAM_BOT_TOKEN kerak' });

    const res = await this.tg.sendMessage(lead.telegramChatId, body, buttons);
    if (!res.ok) {
      const err = 'Telegram: ' + (res.error || 'yuborilmadi');
      // amoCRM: yuborilmagan xabar lentada «Ошибка» belgisi bilan qoladi
      await this.prisma.message.create({ data: { leadId, channel: 'telegram', direction: 'out', text: stored, senderName: user?.name || 'Operator', status: 'error', error: err.slice(0, 500), convNo: await this.convFor(leadId, false) } });
      throw new ServiceUnavailableException({ error: 'SEND_FAILED', message: err });
    }
    // Telegram serveri qabul qildi — amoCRM'dagi «Доставлено»
    const message = await this.prisma.message.create({
      data: { leadId, channel: 'telegram', direction: 'out', text: stored, senderName: user?.name || 'Operator', externalId: res.messageId || null, status: 'delivered', convNo: await this.convFor(leadId, false) },
    });
    await this.activity.record(leadId, 'email', { actorId: user?.id, actorName: user?.name, text: `📤 Telegram: ${body.slice(0, 120)}` });
    return { message };
  }

  /** amoCRM Salesbot «Реакция»: mijozning oxirgi xabariga reaksiya (Telegram emoji; Messenger/Instagram — yurakcha). */
  async react(leadId: string, emoji: string) {
    // tugma bosilishi (callback) — mijozning haqiqiy xabari emas, reaksiya oxirgi yozilgan xabarga
    const last = await this.prisma.message.findFirst({ where: { leadId, direction: 'in', NOT: { externalId: { contains: '-cb-' } } }, orderBy: { createdAt: 'desc' } });
    if (!last?.externalId) throw new BadRequestException({ error: 'NO_CHAT', message: 'Reaksiya uchun mijoz xabari yo`q' });
    if (last.channel === 'telegram') {
      const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { telegramChatId: true } });
      if (!lead?.telegramChatId) throw new BadRequestException({ error: 'NO_CHAT', message: 'Faol chat yo`q' });
      const r = await this.tg.setReaction(lead.telegramChatId, last.externalId, emoji);
      if (!r.ok) throw new ServiceUnavailableException({ error: 'SEND_FAILED', message: 'Telegram: ' + (r.error || 'reaksiya qo`yilmadi') });
      return { ok: true };
    }
    if (isSocial(last.channel) && last.pageId && last.threadId && this.social?.react) {
      await this.social.react({ pageId: last.pageId, recipientId: last.threadId, messageId: last.externalId });
      return { ok: true };
    }
    throw new BadRequestException({ error: 'NO_CHAT', message: 'Bu kanalda reaksiya qo`llab-quvvatlanmaydi' });
  }

  private async sendSocial(leadId: string, target: { channel: string; threadId: string | null; pageId: string | null; kind: string; externalId: string | null; createdAt: Date }, body: string, user?: AuthUser, buttons: string[] = [], stored = body) {
    const channel = target.channel as SocialChannel;
    if (!this.social || !target.pageId || !(await this.social.hasPage(target.pageId).catch(() => false))) {
      throw new ServiceUnavailableException({ error: 'NOT_CONNECTED', message: `${CH_LABEL[channel]} ulanmagan — Integratsiyalar → «Facebook bilan ulash»` });
    }
    const comment = target.kind === 'comment';
    if (!comment && Date.now() - target.createdAt.getTime() > WINDOW_MS) {
      const f = friendlySocialError({ subcode: 2018278 }, channel);
      throw new BadRequestException(f);
    }
    let externalId: string | null = null;
    try {
      if (comment) {
        if (!target.externalId) throw new Error('Izoh ID topilmadi');
        externalId = (await this.social.replyComment({ channel, pageId: target.pageId, commentId: target.externalId, text: body })).id || null;
      } else {
        externalId = (await this.social.sendMessage({ pageId: target.pageId, recipientId: target.threadId!, text: body, buttons })).id || null;
      }
    } catch (e) {
      const f = friendlySocialError(e, channel);
      await this.prisma.message.create({
        data: { leadId, channel, direction: 'out', text: stored, senderName: user?.name || 'Operator', threadId: target.threadId, pageId: target.pageId, kind: target.kind, status: 'error', error: String((f as any)?.message || 'error').slice(0, 500), convNo: await this.convFor(leadId, false) },
      });
      throw new ServiceUnavailableException(f);
    }
    const message = await this.prisma.message.create({
      data: { leadId, channel, direction: 'out', text: stored, senderName: user?.name || 'Operator', externalId, threadId: target.threadId, pageId: target.pageId, kind: target.kind, convNo: await this.convFor(leadId, false) },
    });
    const label = comment ? `${CH_LABEL[channel]} izohga javob` : CH_LABEL[channel];
    await this.activity.record(leadId, 'email', { actorId: user?.id, actorName: user?.name, text: `📤 ${label}: ${body.slice(0, 120)}` });
    await this.prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: new Date() } }).catch(() => {});
    return { message };
  }

  // ── Instagram / Facebook Messenger: kiruvchi xabar va izoh (FacebookService chaqiradi) ──
  /** Mavjud OCHIQ lid (shu kanal + yuboruvchi bo'yicha) yoki yangi saralanmagan lid. */
  private async findOrCreateSocialLead(channel: SocialChannel, threadId: string, name: string, source: string) {
    const prev = await this.prisma.message.findFirst({ where: { channel, threadId }, orderBy: { createdAt: 'desc' }, select: { leadId: true, createdAt: true } });
    if (prev) {
      const lead = await this.prisma.lead.findUnique({ where: { id: prev.leadId } });
      if (lead && (await this.reuseLead(lead, prev.createdAt))) return { lead, isNew: false };
    }
    const place = await this.pset.place(null, null);
    const lead = await this.prisma.lead.create({
      data: { name, source, stage: place.stage, pipelineId: place.pipelineId, unsorted: place.unsorted, queue: place.queue },
    });
    return { lead, isNew: true };
  }

  private async ingestSocial(a: {
    channel: SocialChannel; kind: 'message' | 'comment'; pageId: string; threadId: string; name: string; source: string;
    text: string; externalId: string; createdAt?: Date;
  }) {
    // Takroriy yetkazib berish (connector qayta urinishi) — bir xil externalId ikki marta yozilmaydi
    if (a.externalId) {
      const dup = await this.prisma.message.findFirst({ where: { channel: a.channel, externalId: a.externalId, direction: 'in' }, select: { leadId: true } });
      if (dup) return { ok: true, leadId: dup.leadId, duplicate: true };
    }
    const { lead, isNew } = await this.findOrCreateSocialLead(a.channel, a.threadId, a.name, a.source);
    const prevAny = await this.prisma.message.count({ where: { leadId: lead.id } });
    const prevIn = await this.prisma.message.count({ where: { leadId: lead.id, direction: 'in' } });
    const convNo = await this.convFor(lead.id, true);
    await this.prisma.message.create({
      data: {
        leadId: lead.id, channel: a.channel, direction: 'in', text: a.text.slice(0, 4000), senderName: a.name, externalId: a.externalId || null,
        threadId: a.threadId, pageId: a.pageId, kind: a.kind, ...(a.createdAt ? { createdAt: a.createdAt } : {}), convNo,
      },
    });
    await this.automation.salesbot?.onReply(lead.id, a.text).catch(() => false);
    const label = a.kind === 'comment' ? `${CH_LABEL[a.channel]} izoh` : CH_LABEL[a.channel];
    await this.activity.record(lead.id, 'email', { actorName: a.name, text: `📨 ${label}: ${a.text.slice(0, 120)}` });
    await this.prisma.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } }).catch(() => {});
    const actor = a.source;
    if (isNew) await this.automation.fire('lead_created', lead.id, { actorName: actor });
    if (prevAny === 0) await this.automation.fire('conversation_created', lead.id, { actorName: actor });
    if (prevIn === 0) await this.automation.fire('message_in', lead.id, { actorName: actor });
    if (lead.assigneeId) await this.notif.notify(lead.assigneeId, `${label}: ${a.name}`, { type: 'mention', link: `/leads/detail/${lead.id}` });
    return { ok: true, leadId: lead.id };
  }

  async handleSocialMessage(a: { channel: SocialChannel; pageId: string; senderId: string; senderName: string; text: string; mid: string; at?: Date }) {
    return this.ingestSocial({
      channel: a.channel, kind: 'message', pageId: a.pageId, threadId: a.senderId, name: a.senderName,
      source: a.channel === 'instagram' ? 'Instagram Direct' : 'Facebook Messenger', text: a.text, externalId: a.mid, createdAt: a.at,
    });
  }

  async handleSocialComment(a: { channel: SocialChannel; pageId: string; fromId: string; fromName: string; text: string; commentId: string; postLink?: string; at?: Date }) {
    const text = a.postLink ? `${a.text}\n🔗 ${a.postLink}` : a.text;
    return this.ingestSocial({
      channel: a.channel, kind: 'comment', pageId: a.pageId, threadId: a.fromId, name: a.fromName,
      source: a.channel === 'instagram' ? 'Instagram izoh' : 'Facebook izoh', text, externalId: a.commentId, createdAt: a.at,
    });
  }

  /**
   * Ish stoli chat vidjetlari (amoCRM): "Среднее время ответа" — davrda kelgan xabardan keyingi birinchi
   * javobgacha o'rtacha vaqt (soniya); "Долго ждёт ответа" — oxirgi xabari mijozdan va 1 soatdan beri javobsiz suhbatlar.
   */
  async chatStats(q: { from?: string; to?: string }) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 86400000);
    const to = q.to ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(q.to) ? q.to + 'T23:59:59' : q.to) : new Date();
    if (isNaN(from.getTime()) || isNaN(to.getTime())) return { avgResponseSec: 0, answered: 0, waiting: 0 };
    const msgs = await this.prisma.message.findMany({
      where: { createdAt: { gte: from, lte: new Date(to.getTime() + 7 * 86400000) } },
      orderBy: { createdAt: 'asc' }, select: { leadId: true, direction: true, createdAt: true },
    });
    const byLead = new Map<string, { direction: string; createdAt: Date }[]>();
    for (const m of msgs) { if (!byLead.has(m.leadId)) byLead.set(m.leadId, []); byLead.get(m.leadId)!.push(m); }
    const waits: number[] = [];
    for (const list of byLead.values()) {
      let pendingIn: Date | null = null;
      for (const m of list) {
        if (m.direction === 'in') { if (!pendingIn && m.createdAt >= from && m.createdAt <= to) pendingIn = m.createdAt; }
        else if (pendingIn) { waits.push((m.createdAt.getTime() - pendingIn.getTime()) / 1000); pendingIn = null; }
      }
    }
    // javobsiz kutayotganlar: har suhbatning oxirgi xabari
    const last = await this.prisma.$queryRaw<{ direction: string; createdAt: Date }[]>`
      SELECT DISTINCT ON ("leadId") direction, "createdAt" FROM crm_messages ORDER BY "leadId", "createdAt" DESC`;
    const hourAgo = Date.now() - 3600000;
    const waiting = last.filter((m) => m.direction === 'in' && new Date(m.createdAt).getTime() < hourAgo).length;
    // ish stoli vidjetlari: kiruvchi/chiquvchi xabarlar, ishlov berilgan suhbatlar (javob berilgan), mediana
    const inPer = msgs.filter((m) => m.createdAt >= from && m.createdAt <= to);
    const sorted = [...waits].sort((a, b) => a - b);
    const median = sorted.length ? Math.round(sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2) : 0;
    return {
      avgResponseSec: waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : 0,
      medianResponseSec: median,
      answered: waits.length,
      waiting,
      incoming: inPer.filter((m) => m.direction === 'in').length,
      outgoing: inPer.filter((m) => m.direction === 'out').length,
      processed: new Set(inPer.filter((m) => m.direction === 'out').map((m) => m.leadId)).size,
    };
  }

  // Suhbatlar inbox — xabari bor lidlar, oxirgi xabar bo'yicha (barcha kanallar)
  /**
   * amoCRM imBox ro'yxati. preset: unanswered (oxirgi xabar mijozdan) | open (yopilmagan) | needs_reply (ochiq va javobsiz)
   * | fav (men sevimlilarga qo'shganlar) | mine (men mas'ul); period: today|yesterday|week|month|30d; stages: "pipeline:key,..."
   */
  async listConversations(q: { preset?: string; period?: string; stages?: string; sort?: string } = {}, userId?: string) {
    const since = periodStart(q.period);
    const recent = await this.prisma.message.findMany({ where: since ? { createdAt: { gte: since } } : {}, orderBy: { createdAt: 'desc' }, take: 1000 });
    const seen = new Set<string>();
    const order: string[] = [];
    const lastByLead = new Map<string, { text: string; direction: string; at: Date; channel: string; kind: string; senderName: string | null }>();
    for (const m of recent) {
      if (!lastByLead.has(m.leadId)) lastByLead.set(m.leadId, { text: m.text, direction: m.direction, at: m.createdAt, channel: m.channel, kind: m.kind, senderName: m.senderName });
      if (!seen.has(m.leadId)) { seen.add(m.leadId); order.push(m.leadId); }
    }
    const [leads, states] = await Promise.all([
      this.prisma.lead.findMany({ where: { id: { in: order } }, select: { id: true, name: true, source: true, assigneeId: true, stage: true, pipelineId: true } }),
      this.prisma.conversationState.findMany({ where: { leadId: { in: order } } }),
    ]);
    const byId = new Map(leads.map((l) => [l.id, l]));
    const stById = new Map(states.map((x) => [x.leadId, x]));
    const stageSet = new Set(String(q.stages || '').split(',').filter(Boolean));
    const list = order.map((id) => {
      const l = byId.get(id); const last = lastByLead.get(id);
      if (!l) return null;
      const st = stById.get(id);
      const fav = userId ? safeList(st?.favJson).includes(userId) : false;
      const name = (l.name || '').trim();
      return {
        leadId: id, name: l.name, source: l.source, last: last?.text || '', direction: last?.direction, at: last?.at?.toISOString(),
        channel: last?.channel || 'telegram', kind: last?.kind || 'message',
        senderName: last?.senderName || null, // amoCRM: ro'yxatda "Yuboruvchi: matn"
        avatar: null as string | null, initial: (name.replace(/^@/, '')[0] || '?').toUpperCase(), // rasm yo'q — bosh harf
        closed: !!st?.closed, convNo: st?.number ?? null, fav, unanswered: last?.direction === 'in',
        assigneeId: l.assigneeId || null, stageToken: `${l.pipelineId || 'main'}:${l.stage}`,
      };
    }).filter((c): c is NonNullable<typeof c> => !!c).filter((c) => {
      if (stageSet.size && !stageSet.has(c.stageToken)) return false;
      switch (q.preset) {
        case 'unanswered': return c.unanswered;
        case 'open': return !c.closed;
        case 'needs_reply': return !c.closed && c.unanswered;
        case 'fav': return c.fav;
        case 'mine': return !!userId && c.assigneeId === userId;
        default: return true;
      }
    });
    if (q.sort === 'old') list.reverse();
    return { conversations: list };
  }

  async setConversation(leadId: string, action: 'close' | 'reopen' | 'fav', user?: AuthUser) {
    if (!(await this.prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } }))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Bitim topilmadi' });
    const st = await this.prisma.conversationState.findUnique({ where: { leadId } });
    const data: Record<string, unknown> = {};
    if (action === 'close') Object.assign(data, { closed: true, closedAt: new Date(), closedById: user?.id || null });
    if (action === 'reopen') Object.assign(data, { closed: false, closedAt: null, closedById: null });
    if (action === 'fav' && user?.id) {
      const favs = safeList(st?.favJson);
      data.favJson = JSON.stringify(favs.includes(user.id) ? favs.filter((x) => x !== user.id) : [...favs, user.id]);
    }
    const row = await this.prisma.conversationState.upsert({ where: { leadId }, create: { leadId, ...data }, update: data });
    if (action === 'close') await this.activity.record(leadId, 'updated', { actorId: user?.id, actorName: user?.name, text: 'Suhbat yopildi' });
    return { closed: row.closed, fav: !!user?.id && safeList(row.favJson).includes(user.id) };
  }

  // Messenger/Instagram «o'qildi» (message_reads, watermark): shu mijozga yuborilgan, watermark'gacha bo'lgan xabarlar — «Прочитано»
  async markRead(channel: string, threadId: string, watermark: number, mid?: string) {
    if (!watermark && mid) {
      const m = await this.prisma.message.findFirst({ where: { channel, threadId, externalId: mid }, select: { createdAt: true } });
      watermark = m ? +m.createdAt : 0;
    }
    if (!threadId || !watermark) return 0;
    const r = await this.prisma.message.updateMany({
      where: { channel, threadId, direction: 'out', status: { in: ['sent', 'delivered'] }, createdAt: { lte: new Date(watermark) } },
      data: { status: 'read' },
    });
    return r.count;
  }

  /**
   * Bitimdagi joriy suhbat raqami (amoCRM «Беседа № A…»). reopen=true — kiruvchi xabar: suhbat yopiq bo'lsa,
   * yangi raqam bilan qayta ochiladi (amoCRM'da yopilgan suhbatga mijoz yozsa — yangi beseda).
   */
  private async convFor(leadId: string, reopen: boolean): Promise<number> {
    if (reopen) {
      await this.prisma.$executeRaw`UPDATE crm_conversations SET closed = false, "closedAt" = NULL, "closedById" = NULL,
        "number" = nextval('crm_conv_number_seq'), "updatedAt" = now() WHERE "leadId" = ${leadId} AND closed = true`;
    }
    const st = await this.prisma.conversationState.upsert({ where: { leadId }, create: { leadId }, update: {}, select: { number: true } });
    return st.number;
  }

  async setupWebhook(url: string) {
    const r = await this.tg.setWebhook(url);
    return r;
  }
}
