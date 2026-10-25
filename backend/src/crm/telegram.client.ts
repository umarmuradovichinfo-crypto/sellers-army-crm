import { Injectable, Logger } from '@nestjs/common';

/**
 * Telegram Bot API mijozi. Kalitsiz qurilgan — TELEGRAM_BOT_TOKEN env bo'lmasa
 * o'chiq turadi (enabled()=false). Kalit qo'yilgach 2 tomonlama yozishuv ishlaydi.
 *
 * Webhook o'rnatish (bir marta):
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<backend>/api/v1/telegram/webhook
 */
@Injectable()
export class TelegramClient {
  private readonly logger = new Logger(TelegramClient.name);
  private readonly token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

  enabled(): boolean {
    return !!this.token;
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
          chat_id: chatId, text,
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

  // Webhook'ni o'rnatish (admin tugmasi uchun)
  async setWebhook(url: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.enabled()) return { ok: false, error: 'TELEGRAM_DISABLED' };
    try {
      const res = await fetch(`${this.base()}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, ...(process.env.TELEGRAM_WEBHOOK_SECRET ? { secret_token: process.env.TELEGRAM_WEBHOOK_SECRET } : {}) }),
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
