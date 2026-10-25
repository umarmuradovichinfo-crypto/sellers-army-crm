import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * In-app bildirishnomalar. Vazifa biriktirilganda, lid kelganda, avtomatlashtirish
 * ishlaganda foydalanuvchiga xabar yuboriladi. Topbar qo'ng'iroq belgisida ko'rinadi.
 */
@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  // amoCRM «Настройки уведомлений»: tur × kanal (main — bildirishnomalar markazi, browser — brauzer oynasi)
  static readonly CATS = ['task', 'task_due', 'lead', 'mention', 'automation'] as const;
  private prefCache = new Map<string, { at: number; p: Record<string, { main: boolean; browser: boolean }> }>();

  async prefs(userId: string) {
    const c = this.prefCache.get(userId);
    if (c && Date.now() - c.at < 15_000) return c.p;
    const row = await this.prisma.appSetting.findUnique({ where: { key: `notify_prefs:${userId}` } });
    let raw: any = {};
    try { raw = JSON.parse(row?.value || '{}'); } catch { /* */ }
    const p: Record<string, { main: boolean; browser: boolean }> = {};
    for (const k of NotificationService.CATS) p[k] = { main: raw?.[k]?.main !== false, browser: raw?.[k]?.browser !== false };
    this.prefCache.set(userId, { at: Date.now(), p });
    return p;
  }

  async savePrefs(userId: string, body: any) {
    const cur = await this.prefs(userId);
    const next = { ...cur };
    for (const k of NotificationService.CATS) {
      const v = body?.[k];
      if (v && typeof v === 'object') next[k] = { main: typeof v.main === 'boolean' ? v.main : cur[k].main, browser: typeof v.browser === 'boolean' ? v.browser : cur[k].browser };
    }
    const value = JSON.stringify(next);
    const key = `notify_prefs:${userId}`;
    await this.prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
    this.prefCache.delete(userId);
    return { prefs: next };
  }

  async notify(userId: string | null | undefined, text: string, opts: { type?: string; link?: string } = {}) {
    if (!userId) return;
    try {
      const pr = (await this.prefs(userId))[opts.type || 'info'];
      if (pr && !pr.main && !pr.browser) return; // ikkala kanal o'chirilgan — yozilmaydi
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
