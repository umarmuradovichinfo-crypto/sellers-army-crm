import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

const KEY = 'facebook_connector';
const SIG_TTL_MS = 15 * 60 * 1000;

interface Registration {
  instanceId: string;
  instanceSecret: string;
  instanceUrl: string; // ro'yxatdan o'tgan paytdagi PUBLIC_URL
  connectorUrl: string;
}

/**
 * Markaziy Meta Connector bilan aloqa (vendor bitta Meta ilovasini yuritadi, CRM nusxalari shu orqali ulanadi).
 * CRM birinchi ishga tushganda ro'yxatdan o'tadi -> instanceId/instanceSecret (AppSetting'da).
 */
@Injectable()
export class FacebookConnectorService implements OnModuleInit {
  private readonly logger = new Logger(FacebookConnectorService.name);

  constructor(private readonly prisma: PrismaService) {}

  connectorUrl(): string {
    return (process.env.CONNECTOR_URL || 'https://connector.sellersarmy.uz').trim().replace(/\/+$/, '');
  }
  connectorOrigin(): string {
    try { return new URL(this.connectorUrl()).origin; } catch { return ''; }
  }
  publicUrl(): string {
    return (process.env.PUBLIC_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '')).trim().replace(/\/+$/, '');
  }

  onModuleInit() {
    // Birinchi ishga tushganda ro'yxatdan o'tish (bloklamaydi; xato bo'lsa keyin "Ulash" bosilganda qayta uriniladi)
    if (process.env.FB_APP_ID && process.env.FB_APP_SECRET) return; // to'g'ridan-to'g'ri rejim
    if (!this.publicUrl()) return;
    void this.ensureRegistered().catch((e) => this.logger.warn('Connector ro\'yxatdan o\'tish xato: ' + (e as Error).message));
  }

  private async load(): Promise<Registration | null> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: KEY } });
    try { return row ? (JSON.parse(row.value) as Registration) : null; } catch { return null; }
  }

  async ensureRegistered(): Promise<Registration> {
    const instanceUrl = this.publicUrl();
    if (!instanceUrl) throw new BadRequestException({ error: 'NO_PUBLIC_URL', message: 'Serverda PUBLIC_URL sozlanmagan (CRM manzili)' });
    const cur = await this.load();
    if (cur && cur.instanceUrl === instanceUrl && cur.connectorUrl === this.connectorUrl()) return cur;
    let j: any;
    try {
      const res = await fetch(this.connectorUrl() + '/instances/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceUrl }), signal: AbortSignal.timeout(15000),
      });
      j = await res.json().catch(() => null);
      if (!res.ok || !j?.instanceId) throw new Error(j?.message || j?.error || `HTTP ${res.status}`);
    } catch (e) {
      throw new BadRequestException({ error: 'CONNECTOR', message: 'Meta Connector bilan bog\'lanib bo\'lmadi: ' + (e as Error).message });
    }
    const reg: Registration = { instanceId: j.instanceId, instanceSecret: j.instanceSecret, instanceUrl, connectorUrl: this.connectorUrl() };
    await this.prisma.appSetting.upsert({ where: { key: KEY }, update: { value: JSON.stringify(reg) }, create: { key: KEY, value: JSON.stringify(reg) } });
    this.logger.log('Meta Connector\'da ro\'yxatdan o\'tildi: ' + reg.instanceId);
    return reg;
  }

  /** Imzolangan connector start URL'i (popup shu manzilni ochadi). */
  async startUrl(returnUrl: string): Promise<string> {
    const reg = await this.ensureRegistered();
    const ts = String(Date.now());
    const sig = createHmac('sha256', reg.instanceSecret).update(`${reg.instanceId}|${returnUrl}|${ts}`).digest('hex');
    const qs = new URLSearchParams({ instanceId: reg.instanceId, return: returnUrl, ts, sig });
    return `${this.connectorUrl()}/fb/start?${qs.toString()}`;
  }

  /** Connector -> CRM so'rovi imzosi (X-Connector-Signature = HMAC(secret, xom tana)) va ts yangiligi. */
  async verifyIncoming(raw: Buffer | undefined, header: string | undefined, instanceId: string | undefined): Promise<any | null> {
    const reg = await this.load();
    if (!reg || !raw || !header || instanceId !== reg.instanceId) return null;
    const expected = Buffer.from(createHmac('sha256', reg.instanceSecret).update(raw).digest('hex'));
    const got = Buffer.from(String(header));
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
    let body: any;
    try { body = JSON.parse(raw.toString('utf8')); } catch { return null; }
    if (!Number.isFinite(body?.ts) || Math.abs(Date.now() - body.ts) > SIG_TTL_MS) return null;
    return body;
  }

  /** Sahifani connector'dan uzish (best-effort). */
  async disconnectPage(pageId: string): Promise<void> {
    const reg = await this.load();
    if (!reg) return;
    const body = JSON.stringify({ pageId, ts: Date.now(), nonce: randomBytes(6).toString('hex') });
    const sig = createHmac('sha256', reg.instanceSecret).update(body).digest('hex');
    try {
      await fetch(reg.connectorUrl + '/fb/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Connector-Signature': sig, 'X-Connector-Instance': reg.instanceId },
        body, signal: AbortSignal.timeout(15000),
      });
    } catch (e) { this.logger.warn('Connector uzish xato: ' + (e as Error).message); }
  }
}
