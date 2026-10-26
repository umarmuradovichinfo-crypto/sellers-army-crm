import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LeaderService } from '../common/leader.service';
import { TelegramClient } from './telegram.client';

/**
 * In-app bildirishnomalar. Vazifa biriktirilganda, lid kelganda, avtomatlashtirish
 * ishlaganda foydalanuvchiga xabar yuboriladi. Topbar qo'ng'iroq belgisida ko'rinadi.
 */
@Injectable()
export class NotificationService implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly prisma: PrismaService, private readonly tg: TelegramClient, private readonly leader: LeaderService) {}

  // amoCRM «Настройки уведомлений»: tur × kanal (main — bildirishnomalar markazi, browser — brauzer oynasi)
  static readonly CATS = ['task', 'task_due', 'lead', 'mention', 'automation'] as const;
  private prefCache = new Map<string, { at: number; p: Record<string, { main: boolean; browser: boolean; telegram: boolean }> }>();

  async prefs(userId: string) {
    const c = this.prefCache.get(userId);
    if (c && Date.now() - c.at < 15_000) return c.p;
    const row = await this.prisma.appSetting.findUnique({ where: { key: `notify_prefs:${userId}` } });
    let raw: any = {};
    try { raw = JSON.parse(row?.value || '{}'); } catch { /* */ }
    const p: Record<string, { main: boolean; browser: boolean; telegram: boolean }> = {};
    // Telegram — ixtiyoriy kanal: faqat foydalanuvchi o'zi yoqsa
    for (const k of NotificationService.CATS) p[k] = { main: raw?.[k]?.main !== false, browser: raw?.[k]?.browser !== false, telegram: raw?.[k]?.telegram === true };
    this.prefCache.set(userId, { at: Date.now(), p });
    return p;
  }

  // Telegram «Один раз в день 18:00»: kun davomidagi xabarlar bitta jamlanma bo'lib keladi (Toshkent vaqti)
  async digestOn(userId: string): Promise<boolean> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: `notify_prefs:${userId}` } });
    try { return JSON.parse(row?.value || '{}')._digest === true; } catch { return false; }
  }
  private timer: ReturnType<typeof setInterval> | null = null;
  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { this.leader.guard(async () => { await this.digestTick().catch(() => {}); await this.reportTick().catch(() => {}) }).catch(() => {}) }, 10 * 60_000);
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  // ── amoCRM «Регулярный отчет»: kunlik shaxsiy hisobot Telegram'ga (belgilangan soatda, Toshkent vaqti) ──
  async reportCfg(userId: string): Promise<{ on: boolean; hour: number }> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: `notify_prefs:${userId}` } });
    try { const r = JSON.parse(row?.value || '{}')._report || {}; return { on: r.on === true, hour: Number.isInteger(r.hour) && r.hour >= 0 && r.hour <= 23 ? r.hour : 20 }; } catch { return { on: false, hour: 20 }; }
  }
  async saveReport(userId: string, cfg: { on?: boolean; hour?: number }) {
    const cur = await this.reportCfg(userId);
    const next = { on: typeof cfg.on === 'boolean' ? cfg.on : cur.on, hour: Number.isInteger(cfg.hour) && (cfg.hour as number) >= 0 && (cfg.hour as number) <= 23 ? (cfg.hour as number) : cur.hour };
    const key = `notify_prefs:${userId}`;
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    let v: Record<string, any> = {}; try { v = JSON.parse(row?.value || '{}'); } catch { /* */ }
    v._report = next;
    const value = JSON.stringify(v);
    await this.prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    this.prefCache.delete(userId);
    return next;
  }
  /** Bugungi (Toshkent kuni) shaxsiy ko'rsatkichlar */
  async reportData(userId: string) {
    const tash = new Date(Date.now() + 5 * 3600_000);
    const start = new Date(Date.UTC(tash.getUTCFullYear(), tash.getUTCMonth(), tash.getUTCDate()) - 5 * 3600_000);
    const [created, won, lost, done, overdue, calls, missed] = await Promise.all([
      this.prisma.lead.count({ where: { assigneeId: userId, createdAt: { gte: start } } }),
      this.prisma.lead.count({ where: { assigneeId: userId, wonAt: { gte: start } } }),
      this.prisma.lead.count({ where: { assigneeId: userId, lostAt: { gte: start } } }),
      this.prisma.leadTask.count({ where: { assigneeId: userId, done: true, doneAt: { gte: start } } }),
      this.prisma.leadTask.count({ where: { assigneeId: userId, done: false, dueDate: { lt: new Date() } } }),
      this.prisma.callLog.count({ where: { userId, startedAt: { gte: start } } }),
      this.prisma.callLog.count({ where: { userId, startedAt: { gte: start }, status: 'missed' } }),
    ]);
    return { created, won, lost, done, overdue, calls, missed, day: tash.toISOString().slice(0, 10) };
  }
  /** Hisobotni Telegram'ga yuboradi; ulanmagan bo'lsa false */
  async sendReport(userId: string): Promise<{ sent: boolean; data: Awaited<ReturnType<NotificationService['reportData']>> }> {
    const data = await this.reportData(userId);
    const chatId = await this.tgChatId(userId);
    if (!chatId || !(await this.prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } }))?.isActive) return { sent: false, data };
    const text = `📊 Kunlik hisobot (${data.day})\n• Yangi bitimlar: ${data.created}\n• Yutilgan: ${data.won} · Yo'qotilgan: ${data.lost}\n• Bajarilgan vazifalar: ${data.done} · Muddati o'tgan: ${data.overdue}\n• Qo'ng'iroqlar: ${data.calls} (o'tkazib yuborilgan: ${data.missed})`;
    const r = await this.tg.sendMessage(chatId, text);
    return { sent: !!r.ok, data };
  }
  /** Har soat boshida: shu soatni tanlagan va Telegram ulangan xodimlarga (kuniga bir marta) */
  async reportTick() {
    const tash = new Date(Date.now() + 5 * 3600_000);
    const hour = tash.getUTCHours();
    const day = tash.toISOString().slice(0, 10);
    const rows = await this.prisma.appSetting.findMany({ where: { key: { startsWith: 'notify_tg:' } } });
    let sent = 0;
    for (const r of rows) {
      const userId = r.key.slice('notify_tg:'.length);
      const cfg = await this.reportCfg(userId);
      if (!cfg.on || cfg.hour > hour) continue;
      const lk = `notify_report_last:${userId}`;
      const last = await this.prisma.appSetting.findUnique({ where: { key: lk } });
      if (last?.value === day) continue;
      await this.prisma.appSetting.upsert({ where: { key: lk }, create: { key: lk, value: day }, update: { value: day } });
      if ((await this.sendReport(userId)).sent) sent++;
    }
    return sent;
  }

  /** Toshkent (UTC+5) 18:00 dan keyin, kuniga bir marta: jamlanmani yoqqan va Telegram ulangan xodimlarga */
  async digestTick() {
    const tash = new Date(Date.now() + 5 * 3600_000);
    if (tash.getUTCHours() < 18) return 0;
    const day = tash.toISOString().slice(0, 10);
    const rows = await this.prisma.appSetting.findMany({ where: { key: { startsWith: 'notify_tg:' } } });
    let sent = 0;
    for (const r of rows) {
      const userId = r.key.slice('notify_tg:'.length);
      if (!(await this.digestOn(userId))) continue;
      const lk = `notify_digest_last:${userId}`;
      const last = await this.prisma.appSetting.findUnique({ where: { key: lk } });
      if (last?.value === day) continue;
      await this.prisma.appSetting.upsert({ where: { key: lk }, create: { key: lk, value: day }, update: { value: day } });
      if ((await this.sendDigest(userId)) > 0) sent++;
    }
    return sent;
  }

  /** So'nggi 24 soatdagi (Telegram yoqilgan turlar bo'yicha) bildirishnomalarni bitta xabar qilib yuboradi; soni qaytadi */
  async sendDigest(userId: string): Promise<number> {
    const chatId = await this.tgChatId(userId);
    if (!chatId || !(await this.prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } }))?.isActive) return 0;
    const pr = await this.prefs(userId);
    const items = (await this.prisma.notification.findMany({ where: { userId, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } }, orderBy: { createdAt: 'asc' }, take: 100 }))
      .filter((n) => pr[n.type]?.telegram);
    if (!items.length) return 0;
    const lines = items.slice(0, 30).map((n) => `• ${n.text.slice(0, 160)}`);
    const more = items.length > 30 ? `\n… +${items.length - 30}` : '';
    await this.tg.sendMessage(chatId, `📋 Kunlik jamlanma (${items.length}):\n${lines.join('\n')}${more}`);
    return items.length;
  }

  async savePrefs(userId: string, body: any, digest?: boolean) {
    const cur = await this.prefs(userId);
    const next: Record<string, any> = { ...cur };
    next._digest = typeof digest === 'boolean' ? digest : await this.digestOn(userId);
    next._report = await this.reportCfg(userId); // hisobot sozlamasi (profil) saqlanib qoladi
    for (const k of NotificationService.CATS) {
      const v = body?.[k];
      if (v && typeof v === 'object') next[k] = { main: typeof v.main === 'boolean' ? v.main : cur[k].main, browser: typeof v.browser === 'boolean' ? v.browser : cur[k].browser, telegram: typeof v.telegram === 'boolean' ? v.telegram : cur[k].telegram };
    }
    const value = JSON.stringify(next);
    const key = `notify_prefs:${userId}`;
    await this.prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    this.prefCache.delete(userId);
    return { prefs: Object.fromEntries(NotificationService.CATS.map((k) => [k, next[k]])), digest: next._digest === true };
  }

  // ── Telegram kanali: profilda kod olinadi, botga «/start <kod>» yuboriladi ──
  async tgChatId(userId: string): Promise<string | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: `notify_tg:${userId}` } });
    return row?.value || null;
  }
  async tgStatus(userId: string) {
    const linked = await this.tgChatId(userId);
    const enabled = this.tg.enabled();
    if (!enabled || linked) return { enabled, linked: !!linked };
    // foydalanuvchiga bitta faol kod (har so'rovda yangi qator yig'ilib ketmasin)
    const old = await this.prisma.appSetting.findUnique({ where: { key: `notify_tgcode_user:${userId}` } });
    if (old) await this.prisma.appSetting.deleteMany({ where: { key: `notify_tgcode:${old.value}` } });
    const code = randomBytes(5).toString('hex');
    await this.prisma.appSetting.upsert({ where: { key: `notify_tgcode_user:${userId}` }, create: { key: `notify_tgcode_user:${userId}`, value: code }, update: { value: code } });
    const key = `notify_tgcode:${code}`;
    await this.prisma.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify({ userId, exp: Date.now() + 15 * 60_000 }) }, update: {} });
    const bot = await this.tg.botUsername();
    return { enabled, linked: false, code, bot, url: bot ? `https://t.me/${bot}?start=${code}` : '' };
  }
  async tgUnlink(userId: string) {
    await this.prisma.appSetting.deleteMany({ where: { key: `notify_tg:${userId}` } });
    return { linked: false };
  }
  /** Botga «/start <kod>» keldi: kod to'g'ri bo'lsa shu chat foydalanuvchiga ulanadi. true — xabar ishlandi */
  async tgConsume(code: string, chatId: string): Promise<boolean> {
    if (!/^[a-f0-9]{10}$/.test(code)) return false;
    const key = `notify_tgcode:${code}`;
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    if (!row) return false;
    // atomik: kodni faqat bitta so'rov «yeb» ketadi
    if ((await this.prisma.appSetting.deleteMany({ where: { key } })).count !== 1) return false;
    let v: { userId?: string; exp?: number } = {};
    try { v = JSON.parse(row.value); } catch { /* */ }
    if (!v.userId || (v.exp || 0) < Date.now()) { this.tg.sendMessage(chatId, "Kod eskirgan. CRM'da profilni qayta oching.").catch(() => undefined); return true; }
    const k2 = `notify_tg:${v.userId}`;
    await this.prisma.appSetting.upsert({ where: { key: k2 }, create: { key: k2, value: chatId }, update: { value: chatId } });
    this.prefCache.delete(v.userId);
    this.tg.sendMessage(chatId, "✅ Telegram CRM bildirishnomalariga ulandi. Qaysi turlar kelishini CRM → Profil → Bildirishnomalar sozlamalarida tanlang.").catch(() => undefined);
    return true;
  }

  async notify(userId: string | null | undefined, text: string, opts: { type?: string; link?: string } = {}) {
    if (!userId) return;
    try {
      const pr = (await this.prefs(userId))[opts.type || 'info'];
      const chatId = pr?.telegram && !(await this.digestOn(userId)) ? await this.tgChatId(userId) : null;
      if (chatId) this.tg.sendMessage(chatId, text.slice(0, 1000)).catch(() => undefined);
      if (pr && !pr.main && !pr.browser && !pr.telegram) return; // hech bir kanal yoqilmagan — yozilmaydi (Telegram-faqat holatda ham qator saqlanadi: eslatma takrorlanmasin, jamlanma o'qiy olsin)
      await this.prisma.notification.create({
        data: { userId, text, type: opts.type || 'info', link: opts.link || null },
      });
    } catch {
      /* jim */
    }
  }

  async list(userId: string) {
    const [all, pr] = await Promise.all([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 80 }),
      this.prefs(userId),
    ]);
    const view = (n: (typeof all)[number]) => ({ id: n.id, type: n.type, text: n.text, link: n.link, read: n.read, at: n.createdAt.toISOString() });
    // markazda faqat «Основные» yoqilgan turlar; brauzer oynasi uchun — yangi (2 daqiqa) o'qilmaganlar, «Браузер» yoqilgan bo'lsa
    const items = all.filter((n) => pr[n.type]?.main !== false).slice(0, 50);
    const fresh = Date.now() - 120_000;
    const push = all.filter((n) => !n.read && n.createdAt.getTime() > fresh && pr[n.type]?.browser !== false).map(view);
    const unread = items.filter((n) => !n.read).length;
    return { unread, items: items.map(view), push };
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
