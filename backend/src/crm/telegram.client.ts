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
    return `https://api.telegram.org/bot${this.token}`;
  }

  async sendMessage(chatId: string, text: string): Promise<{ ok: boolean; messageId?: string; error?: string }> {
    if (!this.enabled()) return { ok: false, error: 'TELEGRAM_DISABLED' };
    try {
      const res = await fetch(`${this.base()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text }),
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
}
