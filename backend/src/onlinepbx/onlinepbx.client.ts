import { Injectable, Logger } from '@nestjs/common';

import { OnlinePbxConfigService } from './onlinepbx-config.service';

/**
 * OnlinePBX HTTP API mijozi (api.onlinepbx.ru) — rasmiy docs bo'yicha.
 *
 * Auth: POST /{domain}/auth.json  (body: auth_key=API_KEY) -> { status:'1', data:{ key, key_id } }
 * Keyingi so'rovlar: header  x-pbx-authentication: <key_id>:<key>   (HMAC EMAS!)
 * Click-to-call: POST /{domain}/call/now.json  (body: from, to)  -> { status:'1', data:{ uuid } }
 *
 * Sozlash: UI (CRM → Sozlamalar → Telefoniya) yoki env (ONLINEPBX_DOMAIN/KEY).
 * Kalit bo'lmasa enabled()=false.
 */
@Injectable()
export class OnlinePbxClient {
  private readonly logger = new Logger(OnlinePbxClient.name);
  private session: { key: string; keyId: string } | null = null;

  constructor(private readonly cfg: OnlinePbxConfigService) {}

  private base(): string {
    return (process.env.ONLINEPBX_BASE || 'https://api.onlinepbx.ru').replace(/\/$/, '');
  }

  async enabled(): Promise<boolean> {
    return this.cfg.enabled();
  }

  private async auth(): Promise<{ domain: string }> {
    const { domain, apiKey } = await this.cfg.get();
    if (!domain || !apiKey) throw new Error('OnlinePBX sozlanmagan');
    const res = await fetch(`${this.base()}/${domain}/auth.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ auth_key: apiKey }).toString(),
    });
    const json: any = await res.json().catch(() => null);
    const data = json?.data;
    if (String(json?.status) !== '1' || !data?.key || !data?.key_id) {
      throw new Error('OnlinePBX auth: ' + (json?.comment || `status ${res.status}`));
    }
    this.session = { key: String(data.key), keyId: String(data.key_id) };
    return { domain };
  }

  // path: domendan keyingi qism, masalan `/call/now.json`
  private async post(subPath: string, params: Record<string, string>): Promise<any> {
    let domain: string;
    if (!this.session) domain = (await this.auth()).domain;
    else domain = (await this.cfg.get()).domain;

    const body = new URLSearchParams(params).toString();
    const doFetch = () =>
      fetch(`${this.base()}/${domain}${subPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'x-pbx-authentication': `${this.session!.keyId}:${this.session!.key}`,
        },
        body,
      });

    let res = await doFetch();
    let json: any = await res.json().catch(() => ({ status: '0', comment: 'parse error' }));
    if (json?.isNotAuth || res.status === 401 || res.status === 403) {
      this.session = null;
      domain = (await this.auth()).domain;
      res = await doFetch();
      json = await res.json().catch(() => ({ status: '0', comment: 'parse error' }));
    }
    return json;
  }

  // Ulanishni sinash — auth muvaffaqiyatli bo'lsa true.
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      this.session = null;
      await this.auth();
      return { ok: true, message: 'OnlinePBX bilan ulanish muvaffaqiyatli.' };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  // Click-to-call: from (ichki raqam) ringaydi -> to (mijoz) ga ulanadi.
  async call(from: string, to: string, extra: Record<string, string> = {}): Promise<{ ok: boolean; uuid?: string; comment?: string; raw: any }> {
    const json = await this.post(`/call/now.json`, { from, to, ...extra });
    const ok = String(json?.status) === '1';
    return { ok, uuid: json?.data?.uuid, comment: json?.comment, raw: json };
  }

  async historySearch(params: Record<string, string>): Promise<any[]> {
    const json = await this.post(`/mongo_history/search.json`, params);
    return Array.isArray(json?.data) ? json.data : [];
  }

  async recordUrl(uuid: string): Promise<string | null> {
    const json = await this.post(`/mongo_history/search.json`, { uuid, download: '1' });
    if (typeof json?.data === 'string') return json.data;
    // ba'zi javoblarda havola ichki maydonda bo'ladi
    const d = json?.data;
    if (d && typeof d === 'object') {
      const v = d.download || d.record || d.url || d.file || (Array.isArray(d) ? d[0]?.download : null);
      if (typeof v === 'string') return v;
    }
    return null;
  }

  // Yozuv faylini (mp3) serverda yuklab beradi — avval uuid bo'yicha havola, keyin fayl.
  async fetchRecording(uuidOrUrl: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    let url: string | null = uuidOrUrl;
    if (!/^https?:\/\//i.test(uuidOrUrl)) {
      url = await this.recordUrl(uuidOrUrl); // uuid -> download havola
    }
    if (!url || !/^https?:\/\//i.test(url)) return null;
    // SSRF himoyasi: faqat OnlinePBX'ning o'z domenlari/ulangan domen (webhook orqali kelgan ixtiyoriy URL ichki tarmoqni o'qimasin)
    try {
      const u = new URL(url);
      const { domain } = await this.cfg.get();
      const host = u.hostname.toLowerCase();
      const okHost = /(^|\.)(onlinepbx\.ru|onpbx\.ru|onlinepbx\.uz)$/.test(host) || (!!domain && (host === domain.toLowerCase() || host.endsWith('.' + domain.toLowerCase())));
      if (!okHost || u.protocol !== 'https:' || u.username || u.password) { this.logger.warn(`Yozuv URL'i rad etildi (ruxsat etilmagan host): ${host}`); return null; }
    } catch { return null; }
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      if (!ab.byteLength || ab.byteLength > 50 * 1024 * 1024) return null;
      const ct = res.headers.get('content-type') || 'audio/mpeg';
      return { buffer: Buffer.from(ab), contentType: ct.includes('audio') || ct.includes('mpeg') ? ct : 'audio/mpeg' };
    } catch (e) {
      this.logger.warn('Yozuv yuklab bo‘lmadi: ' + (e as Error).message);
      return null;
    }
  }
}
