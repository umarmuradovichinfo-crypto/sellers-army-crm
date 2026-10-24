import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

const KEY = 'onlinepbx_config';

// Domenni tozalaydi: "https://example.onpbx.ru/" -> "example.onpbx.ru"
// (foydalanuvchi https:// yoki / bilan kiritsa ham API so'rovi buzilmasin)
function normDomain(d: string): string {
  return String(d || '').trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').trim();
}

export interface PbxConfig {
  domain: string; // masalan example.onpbx.ru
  apiKey: string; // OnlinePBX auth_key (maxfiy)
  defaultExt: string; // fallback ichki raqam
  webhookSecret: string; // ixtiyoriy — webhook ?secret= tekshiruvi
  callMode: string; // 'callback' (OnlinePBX o'zi jiringlatadi) | 'softphone' (MicroSIP terib beradi)
  dialScheme: string; // softphone rejimda protokol: tel | sip | callto
}

/**
 * OnlinePBX sozlamalari — UI orqali kiritiladi (AppSetting'da saqlanadi), env fallback.
 * Bir marta UI'dan saqlangach, u asosiy manba bo'ladi (restart shart emas).
 */
@Injectable()
export class OnlinePbxConfigService {
  private cache: PbxConfig | null = null;
  constructor(private readonly prisma: PrismaService) {}

  private env(): PbxConfig {
    return {
      domain: normDomain(process.env.ONLINEPBX_DOMAIN || ''),
      apiKey: (process.env.ONLINEPBX_KEY || '').trim(),
      defaultExt: (process.env.ONLINEPBX_DEFAULT_EXT || '').trim(),
      webhookSecret: (process.env.ONLINEPBX_WEBHOOK_SECRET || '').trim(),
      callMode: (process.env.ONLINEPBX_CALL_MODE || 'callback').trim(),
      dialScheme: (process.env.ONLINEPBX_DIAL_SCHEME || 'tel').trim(),
    };
  }

  private async load(): Promise<PbxConfig> {
    const env = this.env();
    try {
      const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
      if (!row) return env;
      const saved = JSON.parse(row.value || '{}');
      const merged = { ...env, ...saved }; // saqlangan qiymatlar env'dan ustun
      merged.domain = normDomain(merged.domain); // eski/xato saqlangan domenni ham tozalaymiz
      return merged;
    } catch {
      return env;
    }
  }

  async get(): Promise<PbxConfig> {
    if (!this.cache) this.cache = await this.load();
    return this.cache;
  }

  async enabled(): Promise<boolean> {
    const c = await this.get();
    return !!c.domain && !!c.apiKey;
  }

  async update(patch: Partial<PbxConfig>): Promise<PbxConfig> {
    const cur = await this.load();
    const next: PbxConfig = { ...cur };
    if (patch.domain !== undefined) next.domain = normDomain(patch.domain);
    if (patch.defaultExt !== undefined) next.defaultExt = String(patch.defaultExt || '').trim();
    if (patch.webhookSecret !== undefined) next.webhookSecret = String(patch.webhookSecret || '').trim();
    if (patch.callMode !== undefined) next.callMode = patch.callMode === 'softphone' ? 'softphone' : 'callback';
    if (patch.dialScheme !== undefined) next.dialScheme = ['tel', 'sip', 'callto'].includes(String(patch.dialScheme)) ? String(patch.dialScheme) : 'tel';
    // apiKey faqat yangi qiymat berilsa yangilanadi (bo'sh bo'lsa — eskisi qoladi)
    if (patch.apiKey) next.apiKey = String(patch.apiKey).trim();
    await this.prisma.appSetting.upsert({
      where: { key: KEY },
      update: { value: JSON.stringify(next) },
      create: { key: KEY, value: JSON.stringify(next) },
    });
    this.cache = next;
    return next;
  }
}
