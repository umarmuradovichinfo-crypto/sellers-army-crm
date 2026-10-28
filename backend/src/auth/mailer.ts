import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Ixtiyoriy SMTP kanali (parol tiklash kodi va «parol o'zgartirildi» xabari uchun).
 * SMTP_URL (masalan smtps://user:pass@smtp.example.com:465) va SMTP_FROM berilmasa — o'chiq (enabled()=false).
 */
@Injectable()
export class Mailer {
  private readonly logger = new Logger('Mailer');
  private readonly url = (process.env.SMTP_URL || '').trim();
  private readonly from = (process.env.SMTP_FROM || '').trim();
  private transport: Transporter | null = null;

  enabled(): boolean {
    return !!this.url && !!this.from;
  }

  async send(to: string, subject: string, text: string): Promise<boolean> {
    if (!this.enabled()) return false;
    try {
      this.transport ??= nodemailer.createTransport(this.url);
      await this.transport.sendMail({ from: this.from, to, subject, text });
      return true;
    } catch (e) {
      // xabar matni (kod) logga yozilmaydi — faqat xato turi
      this.logger.warn('SMTP yuborish xato: ' + ((e as { code?: string })?.code || (e as Error)?.name || 'unknown'));
      return false;
    }
  }
}
