import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';

/**
 * Telegram Bot API mijozi. Kalitsiz qurilgan — TELEGRAM_BOT_TOKEN env bo'lmasa
 * o'chiq turadi (enabled()=false). Kalit qo'yilgach 2 tomonlama yozishuv ishlaydi.
 *
 * Webhook: Sozlamalardagi «Webhook o'rnatish» tugmasi (manzil https://<backend>/api/v1/telegram/webhook).
 * Maxfiy kalit bilan o'rnatiladi; qo'lda kalitsiz o'rnatilgan webhook keyingi ishga tushishda avtomatik yangilanadi.
 */
@Injectable()
export class TelegramClient implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramClient.name);
  private readonly token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

  enabled(): boolean {
    return !!this.token;
  }

  /**
   * Webhook maxfiy kaliti (X-Telegram-Bot-Api-Secret-Token): TELEGRAM_WEBHOOK_SECRET yoki bot tokenidan hosil qilinadi —
   * shunda env qo'yilmagan bo'lsa ham begona so'rov soxta mijoz xabarini CRM'ga kirita olmaydi.
   */
  webhookSecret(): string {
    const env = (process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
    if (env) return env;
    return this.token ? createHash('sha256').update(`crm-tg-webhook:${this.token}`).digest('hex').slice(0, 48) : '';
  }

  checkSecret(got?: string): boolean {
    const a = Buffer.from(this.webhookSecret());
    const b = Buffer.from(String(got || ''));
    return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
  }

  // Ishga tushganda: avval kalitsiz o'rnatilgan webhook bo'lsa — shu manzilni kalit bilan qayta ro'yxatdan o'tkazamiz
  async onApplicationBootstrap() {
    if (!this.enabled() || process.env.NODE_ENV === 'test') return;
    try {
      const info: any = await fetch(`${this.base()}/getWebhookInfo`).then((r) => r.json()).catch(() => null);
      const url = info?.result?.url;
      if (url && /\/telegram\/webhook$/.test(url)) {
        const r = await this.setWebhook(url);
        if (!r.ok) this.logger.warn(`Telegram webhook kalitini yangilab bo'lmadi: ${r.error}`);
      }
    } catch { /* tarmoq — keyingi ishga tushishda */ }
  }

  private base() {
    // TELEGRAM_API_BASE — faqat test/mock uchun (standart: rasmiy Bot API)
    return `${(process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/$/, '')}/bot${this.token}`;
  }

  /** buttons — amoCRM Salesbot tugmalari: xabar ostidagi inline tugmalar (bosilganda callback_query keladi). */
  async sendMessage(chatId: string, text: string, buttons?: string[]): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!this.enabled()) return { ok: false, error: 'TELEGRAM_DISABLED' };
    try {
      const res = await fetch(`${this.base()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId, text, link_preview_options: { is_disabled: true },
          ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons.map((b, i) => [{ text: b.slice(0, 64), callback_data: `sb:${i}` }]) } } : {}),
        }),
      });
      const json: any = await res.json().catch(() => null);
      if (!json?.ok) return { ok: false, error: json?.description || 'send failed' };
      return { ok: true, messageId: String(json.result?.message_id ?? '') };
    } catch (e) {
      this.logger.error('Telegram send xato: ' + (e as Error).message);
      return { ok: false, error: 'network' };
    }
  }

  private meCache: string | null = null;
  /** Bot foydalanuvchi nomi (t.me/<nom> havolasi uchun); noma'lum bo'lsa bo'sh */
  async botUsername(): Promise<string> {
    if (this.meCache !== null) return this.meCache;
    if (!this.enabled()) return '';
    try {
      const r: any = await fetch(`${this.base()}/getMe`).then((x) => x.json());
      this.meCache = String(r?.result?.username || '');
    } catch { return ''; }
    return this.meCache;
  }

  // Webhook'ni o'rnatish (admin tugmasi uchun)
  async setWebhook(url: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.enabled()) return { ok: false, error: 'TELEGRAM_DISABLED' };
    try {
      const res = await fetch(`${this.base()}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, secret_token: this.webhookSecret() }),
      });
      const json: any = await res.json().catch(() => null);
      return { ok: !!json?.ok, error: json?.description };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  private async call(method: string, body: Record<string, unknown>) {
    if (!this.enabled()) return { ok: false, error: 'TELEGRAM_DISABLED' };
    try {
      const res = await fetch(`${this.base()}/${method}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json: any = await res.json().catch(() => null);
      return { ok: !!json?.ok, error: json?.description };
    } catch {
      return { ok: false, error: 'network' };
    }
  }

  /** Tugma bosilganini tasdiqlash (Telegram «soat» belgisini olib tashlaydi). */
  answerCallback(id: string) { return this.call('answerCallbackQuery', { callback_query_id: id }); }

  /** amoCRM «Реакция»: mijoz xabariga emoji reaksiya. */
  setReaction(chatId: string, messageId: string, emoji: string) {
    return this.call('setMessageReaction', { chat_id: chatId, message_id: Number(messageId), reaction: [{ type: 'emoji', emoji }] });
  }
}
