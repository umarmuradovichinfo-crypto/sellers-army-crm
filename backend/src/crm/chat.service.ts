import { RightsService } from '../common/rights/rights.service';
import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { randomBytes } from 'crypto';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { AutomationService } from './automation.service';
import { NotificationService } from './notification.service';
import { PipelineSettingsService } from './pipeline-settings.service';
import { TelegramClient } from './telegram.client';

const safeList = (v?: string | null): string[] => { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
// Akkaunt vaqti — Toshkent (UTC+5); server UTC'da ishlaydi, shuning uchun kun chegaralari qo'lda hisoblanadi
const TZ_MS = 5 * 3600_000;
function periodStart(p?: string): Date | null {
  const day = 86400000;
  const loc = Date.now() + TZ_MS;
  const d0 = new Date(loc - (loc % day) - TZ_MS);
  switch (p) {
    case 'today': return d0;
    case 'yesterday': return new Date(d0.getTime() - day);
    case 'week': { const dow = (new Date(loc).getUTCDay() + 6) % 7; return new Date(d0.getTime() - dow * day); }
    case 'month': { const l = new Date(loc); return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), 1) - TZ_MS); }
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
const CH_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook Messenger', telegram: 'Telegram', web: 'Onlayn chat' };

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
export class ChatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rights: RightsService,
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
  // amoCRM «Обращения»: «Автоматически закрывать беседу, если сообщение не было прочитано и нет ответа» (soat; 0 — «Никогда»)
  static readonly AUTO_CLOSE = [0, 1, 3, 6, 12, 24, 48, 72, 168];
  private acTimer: ReturnType<typeof setInterval> | null = null;
  onModuleInit() {
    this.automation.chatSend = (leadId, text) => this.sendMessage(leadId, text, undefined);
    if (process.env.NODE_ENV === 'test') return;
    this.acTimer = setInterval(() => this.autoCloseTick().catch(() => {}), 10 * 60_000);
  }
  onModuleDestroy() { if (this.acTimer) clearInterval(this.acTimer); }

  static readonly NPS_ASK = "Xizmatimizni 1 dan 10 gacha baholang (10 — a'lo). Faqat raqam yuboring, rahmat!";
  static readonly NPS_THANKS = 'Bahoyingiz uchun rahmat! 🙏';

  /** Suhbat yopildi: NPS yoqilgan bo'lsa mijozdan baho so'raladi va javob kutiladi */
  private async npsAsk(leadId: string) {
    const { nps } = await this.getChatSettings();
    if (!nps.on) return;
    // izoh (ommaviy) orqali kelgan yoki Salesbot javob kutayotgan suhbatda baho so'ramaymiz
    const lastIn = await this.prisma.message.findFirst({ where: { leadId, direction: 'in' }, orderBy: { createdAt: 'desc' }, select: { kind: true } });
    if (lastIn?.kind === 'comment') return;
    if (await this.prisma.salesbotRun.findFirst({ where: { leadId, state: { in: ['running', 'waiting', 'paused'] } }, select: { id: true } })) return;
    const sent = await this.sendMessage(leadId, nps.ask, undefined).then(() => true).catch(() => false);
    if (sent) {
      const key = `nps_wait:${leadId}`;
      await this.prisma.appSetting.upsert({ where: { key }, create: { key, value: String(Date.now()) }, update: { value: String(Date.now()) } });
    }
  }
  /** Mijozning 1–10 raqamli javobi kutilayotgan NPS bahosi bo'lsa — yozib oladi (suhbat qayta ochilmaydi). true — ishlandi */
  private async npsIntercept(leadId: string, text: string): Promise<boolean> {
    const key = `nps_wait:${leadId}`;
    const wait = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!wait) return false;
    // Salesbot javob kutayotgan bo'lsa raqam botga tegishli (NPS emas)
    if (await this.prisma.salesbotRun.findFirst({ where: { leadId, state: 'waiting' }, select: { id: true } })) { await this.prisma.appSetting.deleteMany({ where: { key } }); return false; }
    if (Date.now() - Number(wait.value) > 7 * 86400_000) { await this.prisma.appSetting.deleteMany({ where: { key } }); return false; }
    const m = /^\s*(10|[1-9])\s*[.!]?\s*$/.exec(String(text));
    if (!m) { await this.prisma.appSetting.deleteMany({ where: { key } }); return false; } // boshqa narsa yozdi — oddiy suhbat davom etadi
    await this.prisma.appSetting.deleteMany({ where: { key } });
    const score = Number(m[1]);
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId }, select: { assigneeId: true, name: true } });
    await this.activity.record(leadId, 'nps', { actorName: 'Mijoz', text: `Baho: ${score}/10`, data: { score, assigneeId: lead?.assigneeId || null } });
    if (lead?.assigneeId) await this.notif.notify(lead.assigneeId, `Mijoz bahosi ${score}/10: ${lead.name}`, { type: 'mention', link: `/leads/detail/${leadId}` });
    const { nps } = await this.getChatSettings();
    await this.sendMessage(leadId, nps.thanks, undefined).catch(() => undefined);
    return true;
  }
  /** NPS hisoboti: o'rtacha, taqsimot, so'nggi baholar */
  async npsStats() {
    const rows = await this.prisma.activity.findMany({ where: { type: 'nps' }, orderBy: { createdAt: 'desc' }, take: 500, select: { leadId: true, dataJson: true, createdAt: true } });
    const scores = rows.map((r) => { try { return { leadId: r.leadId, score: Number(JSON.parse(r.dataJson || '{}').score), at: r.createdAt.toISOString() }; } catch { return null; } }).filter((x): x is { leadId: string | null; score: number; at: string } => !!x && x.score >= 1 && x.score <= 10);
    const total = scores.length;
    const promoters = scores.filter((s) => s.score >= 9).length, detractors = scores.filter((s) => s.score <= 6).length;
    return {
      total, avg: total ? Math.round((scores.reduce((a, s) => a + s.score, 0) / total) * 10) / 10 : 0,
      nps: total ? Math.round(((promoters - detractors) / total) * 100) : 0,
      dist: Array.from({ length: 10 }, (_, i) => scores.filter((s) => s.score === i + 1).length),
      last: scores.slice(0, 10),
    };
  }

  static cleanWebChats(raw: unknown): any[] {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 20).map((w: any, n: number) => ({
      id: String(w?.id || `w${Date.now()}${n}`).slice(0, 40),
      key: String(w?.key || '').slice(0, 40),
      name: String(w?.name || '').trim().slice(0, 80),
      greeting: String(w?.greeting || '').trim().slice(0, 300),
      color: /^#[0-9a-fA-F]{6}$/.test(String(w?.color || '')) ? String(w.color) : '#2d7ff9',
      active: w?.active !== false,
    })).filter((w: any) => w.name);
  }

  // ── Onlayn chat vidjeti (ommaviy) ──
  async webChatByKey(key: string) {
    const s = await this.getChatSettings();
    return (s.webChats as any[]).find((w) => w.key && w.key === key && w.active) || null;
  }
  async webIngest(key: string, visitorId: string, name: string, text: string) {
    const w = await this.webChatByKey(key);
    if (!w) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Chat topilmadi' });
    const body = String(text || '').trim().slice(0, 1000);
    if (!body || !/^[\w-]{8,64}$/.test(visitorId)) throw new BadRequestException({ error: 'BAD_REQUEST', message: "Xabar yoki mehmon id noto'g'ri" });
    const nm = String(name || '').trim().slice(0, 60) || `Saytdan mehmon #${visitorId.slice(0, 4)}`;
    return this.ingestSocial({ channel: 'web', kind: 'message', pageId: key, threadId: visitorId, name: nm, source: `Onlayn chat: ${w.name}`, text: body, externalId: '' });
  }
  async webMessages(key: string, visitorId: string, after?: string) {
    if (!(await this.webChatByKey(key))) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Chat topilmadi' });
    if (!/^[\w-]{8,64}$/.test(visitorId)) return { messages: [] };
    const since = after && !isNaN(Date.parse(after)) ? new Date(after) : new Date(0);
    const rows = await this.prisma.message.findMany({ where: { channel: 'web', threadId: visitorId, pageId: key, createdAt: { gt: since } }, orderBy: { createdAt: 'asc' }, take: 100, select: { id: true, direction: true, text: true, senderName: true, createdAt: true } });
    return { messages: rows.map((m) => ({ id: m.id, from: m.direction === 'in' ? 'visitor' : 'agent', text: m.text, name: m.senderName, at: m.createdAt.toISOString() })) };
  }

  static cleanIntents(raw: unknown) {
    if (!Array.isArray(raw)) return [] as any[];
    return raw.slice(0, 50).map((i: any, n: number) => ({
      id: String(i?.id || `i${Date.now()}${n}`).slice(0, 40),
      name: String(i?.name || '').trim().slice(0, 120),
      keywords: (Array.isArray(i?.keywords) ? i.keywords : String(i?.keywords || '').split(/[,;\n]/)).map((k: unknown) => String(k).trim().toLowerCase().slice(0, 100)).filter(Boolean).slice(0, 100),
      action: i?.action === 'bot' ? 'bot' : 'reply',
      templateId: String(i?.templateId || '').slice(0, 40),
      botId: String(i?.botId || '').slice(0, 40),
      count: Math.max(0, Math.floor(Number(i?.count) || 0)),
    })).filter((i: any) => i.name && i.keywords.length);
  }

  /** «Типовые вопросы»: kirish xabari kalit so'zga mos kelsa — shablon bilan javob yoki Salesbot; hisoblagich oshadi */
  async applyIntents(leadId: string, text: string): Promise<boolean> {
    const s = await this.getChatSettings();
    if (!s.intents.length) return false;
    const low = String(text || '').toLowerCase();
    if (!low.trim() || s.ignorePhrases.some((p: string) => low.includes(p))) return false;
    const hit = s.intents.find((i: any) => i.keywords.some((k: string) => low.includes(k)));
    if (!hit) return false;
    // Salesbot shu bitimda ishlayotgan bo'lsa (ikki marta javob ketmasin) — tegmaymiz
    if (await this.prisma.salesbotRun.findFirst({ where: { leadId, state: { in: ['running', 'waiting', 'paused'] } }, select: { id: true } })) return false;
    // takroriy javob bo'lmasin: so'nggi 30 soniyada operator/bot yuborgan xabar bo'lsa — tegmaymiz
    const recent = await this.prisma.message.findFirst({ where: { leadId, direction: 'out', createdAt: { gte: new Date(Date.now() - 30_000) } }, select: { id: true } });
    if (recent) return false;
    let done = false;
    if (hit.action === 'bot' && hit.botId) done = !!(await this.automation.salesbot?.run(hit.botId, leadId).then(() => true).catch(() => false));
    else {
      const tpl = s.templates.find((t: any) => t.id === hit.templateId && t.active !== false);
      if (tpl) done = !!(await this.sendMessage(leadId, tpl.text, undefined).then(() => true).catch(() => false));
    }
    if (done) {
      const cur = await this.getChatSettings();
      const intents = cur.intents.map((i: any) => (i.id === hit.id ? { ...i, count: (i.count || 0) + 1 } : i));
      const row = await this.prisma.appSetting.findUnique({ where: { key: ChatService.SETTINGS_KEY } });
      let v: any = {}; try { v = JSON.parse(row?.value || '{}'); } catch { /* */ }
      const value = JSON.stringify({ ...v, intents });
      await this.prisma.appSetting.upsert({ where: { key: ChatService.SETTINGS_KEY }, update: { value }, create: { key: ChatService.SETTINGS_KEY, value } });
    }
    return done;
  }

  static publicBase() {
    return (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')).trim().replace(/\/+$/, '');
  }
  /** «Сокращать ссылки» yoqilgan bo'lsa matndagi http(s) havolalarni kuzatiladigan qisqa havolaga almashtiradi */
  async shorten(text: string, leadId: string | null): Promise<string> {
    const base = ChatService.publicBase();
    if (!base || !(await this.getChatSettings()).shortLinks) return text;
    // har bir havola o'z o'rnida (bir havola ikkinchisining boshi bo'lsa ham buzilmaydi)
    const re = /https?:\/\/[^\s<>"']+/g;
    const found = [...text.matchAll(re)].map((m) => ({ at: m.index as number, raw: m[0], clean: m[0].replace(/[).,!?;:]+$/, '') })).filter((u) => !u.clean.startsWith(`${base}/api/v1/l/`)).slice(0, 10);
    let out = '', pos = 0;
    for (const u of found) {
      const code = randomBytes(6).toString('base64url');
      await this.prisma.shortLink.create({ data: { code, url: u.clean.slice(0, 2000), leadId } });
      out += text.slice(pos, u.at) + `${base}/api/v1/l/${code}`;
      pos = u.at + u.clean.length;
    }
    return out + text.slice(pos);
  }
  /** Qisqa havola bosildi: hisoblagich, bitim lentasiga yozuv, mas'ulga bildirishnoma; asl manzil */
  /** Havola oldindan ko'rish (preview) botlari — haqiqiy mijoz bosishi emas */
  static isPreviewBot(ua?: string) { return /TelegramBot|facebookexternalhit|Facebot|WhatsApp|Slackbot|Twitterbot|LinkedInBot|Discordbot|bot|crawler|spider|preview/i.test(String(ua || '')); }
  async openShortLink(code: string, ua?: string): Promise<string | null> {
    const l = await this.prisma.shortLink.findUnique({ where: { code } });
    if (!l || !/^https?:\/\//i.test(l.url)) return null;
    const first = (await this.prisma.shortLink.updateMany({ where: { code, clicks: 0 }, data: { clicks: 1, lastClickAt: new Date() } })).count === 1;
    if (!first) await this.prisma.shortLink.update({ where: { code }, data: { clicks: { increment: 1 }, lastClickAt: new Date() } });
    if (l.leadId && first && !ChatService.isPreviewBot(ua)) {
      await this.activity.record(l.leadId, 'link', { actorName: 'Mijoz', text: `Havola ochildi: ${l.url}` });
      const lead = await this.prisma.lead.findUnique({ where: { id: l.leadId }, select: { assigneeId: true, name: true } });
      if (lead?.assigneeId) await this.notif.notify(lead.assigneeId, `Mijoz havolani ochdi: ${lead.name}`, { type: 'mention', link: `/leads/detail/${l.leadId}` });
    }
    return l.url;
  }

  /** Oxirgi xabari N soatdan eski ochiq suhbatlarni yopadi («Robot»). Yopilganlar soni. */
  async autoCloseTick(): Promise<number> {
    const { autoCloseHours } = await this.getChatSettings();
    if (!autoCloseHours) return 0;
    const before = new Date(Date.now() - autoCloseHours * 3600_000);
    const rows = await this.prisma.$queryRaw<{ leadId: string }[]>(Prisma.sql`
      SELECT m."leadId" FROM crm_messages m LEFT JOIN crm_conversations c ON c."leadId" = m."leadId"
      WHERE coalesce(c.closed, FALSE) = FALSE
      GROUP BY m."leadId" HAVING max(m."createdAt") < ${before} LIMIT 200`);
    for (const r of rows) {
      await this.prisma.conversationState.upsert({ where: { leadId: r.leadId }, create: { leadId: r.leadId, closed: true, closedAt: new Date() }, update: { closed: true, closedAt: new Date(), closedById: null } });
      await this.activity.record(r.leadId, 'updated', { actorName: 'Robot', text: 'Suhbat yopildi' });
    }
    return rows.length;
  }
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
      autoCloseHours: ChatService.AUTO_CLOSE.includes(Number(v.autoCloseHours)) ? Number(v.autoCloseHours) : 0,
      // amoCRM «Сокращать ссылки»
      shortLinks: v.shortLinks === true,
      // amoCRM «Обращения и NPS»: suhbat yopilganda baho (1–10) so'rash
      nps: { on: v.nps?.on === true, ask: String(v.nps?.ask || '').slice(0, 500) || ChatService.NPS_ASK, thanks: String(v.nps?.thanks || '').slice(0, 500) || ChatService.NPS_THANKS },
      // amoCRM «Онлайн чаты»: saytga qo'yiladigan chat vidjetlari
      webChats: ChatService.cleanWebChats(v.webChats),
      // amoCRM «Типовые вопросы»: mavzu — kalit so'zlar → shablon bilan javob yoki Salesbot
      intents: ChatService.cleanIntents(v.intents),
      ignorePhrases: Array.isArray(v.ignorePhrases) ? v.ignorePhrases.map((x: unknown) => String(x).trim().toLowerCase().slice(0, 100)).filter(Boolean).slice(0, 200) : [],
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
    if (typeof body?.shortLinks === 'boolean') next.shortLinks = body.shortLinks;
    if (body?.nps && typeof body.nps === 'object') next.nps = { on: body.nps.on === true, ask: String(body.nps.ask || '').slice(0, 500) || ChatService.NPS_ASK, thanks: String(body.nps.thanks || '').slice(0, 500) || ChatService.NPS_THANKS };
    if (Array.isArray(body?.webChats)) {
      const old = new Map((cur.webChats as any[]).map((w) => [w.id, w]));
      // kalit (key) faqat serverda yaratiladi va o'zgarmaydi
      next.webChats = ChatService.cleanWebChats(body.webChats).map((w: any) => ({ ...w, key: old.get(w.id)?.key || randomBytes(9).toString('base64url') }));
    }
    if (Array.isArray(body?.intents)) {
      // hisoblagichlar (count) faqat serverda yuritiladi: eski qiymat saqlanadi
      const old = new Map(cur.intents.map((i: any) => [i.id, i.count]));
      next.intents = ChatService.cleanIntents(body.intents).map((i: any) => ({ ...i, count: old.get(i.id) ?? 0 }));
    }
    if (Array.isArray(body?.ignorePhrases)) next.ignorePhrases = body.ignorePhrases.map((x: unknown) => String(x).trim().toLowerCase().slice(0, 100)).filter(Boolean).slice(0, 200);
    if (body?.autoCloseHours !== undefined && ChatService.AUTO_CLOSE.includes(Number(body.autoCloseHours))) next.autoCloseHours = Number(body.autoCloseHours);
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
    // tahrirlangan xabar yangi kiruvchi xabar emas (bot/javoblar qayta ishga tushmasin)
    if (!update?.message && update?.edited_message) return { ok: true, skipped: true };
    const msg = update?.message;
    const text = msg?.text;
    const chat = msg?.chat;
    if (!chat?.id || !text) return { ok: true, skipped: true };
    const chatId = String(chat.id);
    // «/start <kod>» — xodim Telegram'ni CRM bildirishnomalariga ulayapti (mijoz xabari emas)
    const startM = /^\/start(?:@\w+)?\s+([a-f0-9]{10})\s*$/.exec(text.trim());
    if (startM && chat.type === 'private' && (await this.notif.tgConsume(startM[1], chatId))) return { ok: true, linked: true };
    const from = msg.from || {};
    const name = [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || chat.title || 'Telegram foydalanuvchi';

    let lead = await this.prisma.lead.findFirst({ where: { telegramChatId: chatId }, orderBy: { createdAt: 'desc' } });
    // Telegram qayta yetkazishi (webhook 500 → retry): bir xil message_id ikki marta ishlanmaydi
    if (lead && msg.message_id != null && !String(msg.message_id).includes('-cb-')) {
      const dup = await this.prisma.message.findFirst({ where: { leadId: lead.id, channel: 'telegram', direction: 'in', externalId: String(msg.message_id) }, select: { id: true } });
      if (dup) return { ok: true, leadId: lead.id, duplicate: true };
    }
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

    const npsReply = await this.npsIntercept(lead.id, String(text)).catch(() => false);
    const convNo = await this.convFor(lead.id, !npsReply);
    await this.prisma.message.create({
      data: { leadId: lead.id, channel: 'telegram', direction: 'in', text: String(text).slice(0, 4000), senderName: name, externalId: String(msg.message_id ?? ''), convNo },
    });
    const consumed = npsReply || (await this.automation.salesbot?.onReply(lead.id, String(text)).catch(() => false));
    await this.activity.record(lead.id, 'email', { actorName: name, text: `📨 Telegram: ${String(text).slice(0, 120)}` });
    await this.prisma.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } }).catch(() => {});

    if (isNew) await this.automation.fire('lead_created', lead.id, { actorName: 'Telegram' });
    // amoCRM suhbat triggerlari: kiruvchi xabar bilan suhbat yaratilganda / birinchi kiruvchi xabarda
    if (prevAny === 0) await this.automation.fire('conversation_created', lead.id, { actorName: 'Telegram' });
    if (prevIn === 0) await this.automation.fire('message_in', lead.id, { actorName: 'Telegram' });
    // «Типовые вопросы» — triggerlar (Salesbot) ishga tushgandan KEYIN, bot allaqachon javob berayotgan bo'lmasa
    if (!consumed) await this.applyIntents(lead.id, String(text)).catch(() => false);
    if (lead.assigneeId) await this.notif.notify(lead.assigneeId, `Telegram xabar: ${name}`, { type: 'mention', link: `/leads/detail/${lead.id}` });

    return { ok: true, leadId: lead.id };
  }

  /** Lidning javob kanali: oxirgi kiruvchi xabar; yo'q bo'lsa Telegram. */
  private async replyTarget(leadId: string) {
    return this.prisma.message.findFirst({ where: { leadId, direction: 'in' }, orderBy: { createdAt: 'desc' } });
  }

  async listMessages(leadId: string, userId?: string) {
    // eng yangi 200 ta xabar (lentada oxirgilari ko'rinsin), vaqt bo'yicha o'sish tartibida qaytadi
    const messages = (await this.prisma.message.findMany({ where: { leadId }, orderBy: { createdAt: 'desc' }, take: 200 })).reverse();
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
    if (lastIn?.channel === 'web') return { ...base, canReply: true, channel: 'web', channelLabel: CH_LABEL.web, replyKind: 'message', windowOpen: true, windowExpiresAt: null };
    return { ...base, canReply: tgOk, channel: lead?.telegramChatId ? 'telegram' : null, channelLabel: lead?.telegramChatId ? 'Telegram' : null, replyKind: 'message', windowOpen: true, windowExpiresAt: null };
  }

  /** opts.buttons — Salesbot tugmalari (Telegram inline, Messenger/Instagram quick replies); lentada matn ostida [Tugma] bo'lib saqlanadi. */
  async sendMessage(leadId: string, text: string, user?: AuthUser, opts: { buttons?: string[] } = {}) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundException({ error: 'NOT_FOUND', message: 'Lid topilmadi' });
    let body = String(text || '').slice(0, 4000);
    if (!body.trim()) throw new BadRequestException({ error: 'EMPTY', message: 'Bo`sh xabar' });
    body = await this.shorten(body, leadId);

    const target = await this.replyTarget(leadId);
    const buttons = (opts.buttons || []).map((b) => String(b).trim()).filter(Boolean)
    const stored = buttons.length ? `${body}\n\n${buttons.map((b) => `[${b}]`).join(' ')}` : body;
    // Onlayn chat: mijoz vidjet orqali so'rab turadi (polling) — xabarni saqlash yetarli
    if (target?.channel === 'web' && target.threadId) {
      const message = await this.prisma.message.create({ data: { leadId, channel: 'web', direction: 'out', text: stored, senderName: user?.name || 'Operator', threadId: target.threadId, pageId: target.pageId, status: 'sent', convNo: await this.convFor(leadId, false) } });
      await this.activity.record(leadId, 'email', { actorId: user?.id, actorName: user?.name, text: `📤 Onlayn chat: ${body.slice(0, 120)}` });
      return { message };
    }
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
  private async findOrCreateSocialLead(channel: SocialChannel | 'web', threadId: string, name: string, source: string) {
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
    channel: SocialChannel | 'web'; kind: 'message' | 'comment'; pageId: string; threadId: string; name: string; source: string;
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
    const npsReply = await this.npsIntercept(lead.id, a.text).catch(() => false);
    const convNo = await this.convFor(lead.id, !npsReply);
    await this.prisma.message.create({
      data: {
        leadId: lead.id, channel: a.channel, direction: 'in', text: a.text.slice(0, 4000), senderName: a.name, externalId: a.externalId || null,
        threadId: a.threadId, pageId: a.pageId, kind: a.kind, ...(a.createdAt ? { createdAt: a.createdAt } : {}), convNo,
      },
    });
    const consumed = npsReply || (await this.automation.salesbot?.onReply(lead.id, a.text).catch(() => false));
    const label = a.kind === 'comment' ? `${CH_LABEL[a.channel]} izoh` : CH_LABEL[a.channel];
    await this.activity.record(lead.id, 'email', { actorName: a.name, text: `📨 ${label}: ${a.text.slice(0, 120)}` });
    await this.prisma.lead.update({ where: { id: lead.id }, data: { lastActivityAt: new Date() } }).catch(() => {});
    const actor = a.source;
    if (isNew) await this.automation.fire('lead_created', lead.id, { actorName: actor });
    if (prevAny === 0) await this.automation.fire('conversation_created', lead.id, { actorName: actor });
    if (prevIn === 0) await this.automation.fire('message_in', lead.id, { actorName: actor });
    if (!consumed && a.kind !== 'comment') await this.applyIntents(lead.id, a.text).catch(() => false);
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
    // sana-only qiymatlar Toshkent (UTC+5) kuni chegarasi bo'yicha
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    const from = q.from ? new Date(ymd.test(q.from) ? new Date(q.from + 'T00:00:00Z').getTime() - TZ_MS : q.from) : new Date(Date.now() - 30 * 86400000);
    const to = q.to ? new Date(ymd.test(q.to) ? new Date(q.to + 'T23:59:59Z').getTime() - TZ_MS : q.to) : new Date();
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
      this.prisma.lead.findMany({ where: { id: { in: order } }, select: { id: true, name: true, source: true, assigneeId: true, stage: true, pipelineId: true, unsorted: true } }),
      this.prisma.conversationState.findMany({ where: { leadId: { in: order } } }),
    ]);
    // amoCRM «Права доступа»: faqat ko'rish huquqi bor bitimlar suhbatlari (saralanmagan — voronka huquqi bo'yicha)
    const [own, deniedUns] = await Promise.all([this.rights.ownersById(userId, 'leads', 'view'), this.rights.unsortedDenied(userId, 'view')]);
    const visible = (l: { assigneeId: string | null; unsorted: boolean; pipelineId: string | null }) =>
      l.unsorted ? !deniedUns.includes(l.pipelineId || '') : own === null || (!!l.assigneeId && own.includes(l.assigneeId));
    const byId = new Map(leads.filter(visible).map((l) => [l.id, l]));
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
    if (action === 'reopen') { Object.assign(data, { closed: false, closedAt: null, closedById: null }); await this.prisma.appSetting.deleteMany({ where: { key: `nps_wait:${leadId}` } }); }
    if (action === 'fav' && user?.id) {
      const favs = safeList(st?.favJson);
      data.favJson = JSON.stringify(favs.includes(user.id) ? favs.filter((x) => x !== user.id) : [...favs, user.id]);
    }
    const row = await this.prisma.conversationState.upsert({ where: { leadId }, create: { leadId, ...data }, update: data });
    if (action === 'close') {
      await this.activity.record(leadId, 'updated', { actorId: user?.id, actorName: user?.name, text: 'Suhbat yopildi' });
      if (!st?.closed) await this.npsAsk(leadId).catch(() => undefined);
    }
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
