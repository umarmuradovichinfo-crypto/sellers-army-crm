import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

const KEY = 'facebook_config';

export interface FbPage {
  id: string;
  name: string;
  accessToken: string; // Page Access Token (maxfiy)
}
export interface FbConfig {
  appId: string;
  appSecret: string;
  verifyToken: string; // webhook tekshiruvi uchun
  pages: FbPage[];
  connectedAt?: string;
}

/**
 * Facebook integratsiya sozlamalari — UI orqali kiritiladi (AppSetting'da), env fallback.
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

  private async load(): Promise<FbConfig> {
    const env = this.env();
    try {
      const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
      if (!row) return env;
      const saved = JSON.parse(row.value || '{}');
      return { ...env, ...saved, pages: Array.isArray(saved.pages) ? saved.pages : [] };
    } catch {
      return env;
    }
  }

  async get(): Promise<FbConfig> {
    if (!this.cache) this.cache = await this.load();
    return this.cache;
  }

  private async save(cfg: FbConfig) {
    await this.prisma.appSetting.upsert({
      where: { key: KEY },
      update: { value: JSON.stringify(cfg) },
      create: { key: KEY, value: JSON.stringify(cfg) },
    });
    this.cache = cfg;
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
    // mavjud sahifalarni yangilaymiz / qo'shamiz (tokenni yangilaydi)
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
