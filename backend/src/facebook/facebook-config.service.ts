import { randomBytes } from 'crypto';

import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

const KEY = 'facebook_config';

export interface FbPage {
  id: string;
  name: string;
  accessToken: string; // Page Access Token (maxfiy)
  viaConnector?: boolean; // markaziy Meta Connector orqali ulangan
}
export interface FbConfig {
  appId: string;
  appSecret: string;
  verifyToken: string; // webhook tekshiruvi uchun
  pages: FbPage[];
  connectedAt?: string;
  // Ilova darajasidagi webhook obunasi natijasi (POST /{app-id}/subscriptions)
  webhook?: { status: 'ok' | 'error' | 'skipped'; error?: string; at: string };
}

/**
 * Facebook integratsiya sozlamalari — asosiy manba: .env (FB_APP_ID/FB_APP_SECRET), zaxira: UI (AppSetting).
 * amoCRM'dagidek: App ID/Secret + ulangan sahifalar (Page Access Token bilan).
 */
@Injectable()
export class FacebookConfigService {
  private cache: FbConfig | null = null;
  constructor(private readonly prisma: PrismaService) {}

  private env(): FbConfig {
    return {
      appId: (process.env.FB_APP_ID || '').trim(),
      appSecret: (process.env.FB_APP_SECRET || '').trim(),
      verifyToken: (process.env.FB_VERIFY_TOKEN || '').trim(),
      pages: [],
    };
  }

  /** Env'da App ID va Secret ikkalasi ham bor — foydalanuvchi ularni ko'rmaydi va o'zgartira olmaydi. */
  appManaged(): boolean {
    const e = this.env();
    return !!(e.appId && e.appSecret);
  }

  private async load(): Promise<FbConfig> {
    const env = this.env();
    let cfg: FbConfig = env;
    try {
      const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
      if (row) {
        const saved = JSON.parse(row.value || '{}');
        cfg = { ...env, ...saved, pages: Array.isArray(saved.pages) ? saved.pages : [] };
      }
    } catch { /* env */ }
    // Env qiymatlari ustun (appManaged bo'lsa saqlangan App ID/Secret e'tiborga olinmaydi)
    if (this.appManaged()) { cfg.appId = env.appId; cfg.appSecret = env.appSecret; }
    if (env.verifyToken) cfg.verifyToken = env.verifyToken;
    // Verify token yo'q bo'lsa — tasodifiy yaratib saqlaymiz
    if (!cfg.verifyToken) {
      cfg.verifyToken = randomBytes(24).toString('hex');
      await this.save(cfg).catch(() => { /* keyingi safar qayta uriniladi */ });
    }
    return cfg;
  }

  async get(): Promise<FbConfig> {
    if (!this.cache) this.cache = await this.load();
    return this.cache;
  }

  private async save(cfg: FbConfig) {
    // Env'dan kelgan App ID/Secret bazaga yozilmaydi
    const stored: FbConfig = this.appManaged() ? { ...cfg, appId: '', appSecret: '' } : cfg;
    await this.prisma.appSetting.upsert({
      where: { key: KEY },
      update: { value: JSON.stringify(stored) },
      create: { key: KEY, value: JSON.stringify(stored) },
    });
    this.cache = cfg;
  }

  async setWebhookStatus(status: 'ok' | 'error' | 'skipped', error?: string): Promise<void> {
    const cur = await this.load();
    await this.save({ ...cur, webhook: { status, error, at: new Date().toISOString() } });
  }

  async updateApp(patch: { appId?: string; appSecret?: string; verifyToken?: string }): Promise<FbConfig> {
    const cur = await this.load();
    const next: FbConfig = { ...cur };
    if (patch.appId !== undefined) next.appId = String(patch.appId || '').trim();
    if (patch.verifyToken !== undefined) next.verifyToken = String(patch.verifyToken || '').trim();
    if (patch.appSecret) next.appSecret = String(patch.appSecret).trim(); // bo'sh bo'lsa eskisi qoladi
    await this.save(next);
    return next;
  }

  async setPages(pages: FbPage[]): Promise<FbConfig> {
    const cur = await this.load();
    // BIRLASHTIRISH: mavjud sahifalarni yangilaymiz / qo'shamiz (tokenni yangilaydi)
    const map = new Map(cur.pages.map((p) => [p.id, p]));
    for (const p of pages) map.set(p.id, p);
    const next: FbConfig = { ...cur, pages: [...map.values()], connectedAt: new Date().toISOString() };
    await this.save(next);
    return next;
  }

  async removePage(pageId: string): Promise<FbConfig> {
    const cur = await this.load();
    const next: FbConfig = { ...cur, pages: cur.pages.filter((p) => p.id !== pageId) };
    await this.save(next);
    return next;
  }

  async pageToken(pageId: string): Promise<string | null> {
    const c = await this.get();
    return c.pages.find((p) => p.id === pageId)?.accessToken || null;
  }

  async enabled(): Promise<boolean> {
    const c = await this.get();
    return c.pages.length > 0;
  }
}
