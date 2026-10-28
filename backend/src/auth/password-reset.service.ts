import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';

import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { LeaderService } from '../common/leader.service';
import { rateLimit, rateReset } from '../common/rate-limit';
import { NotificationService } from '../crm/notification.service';
import { TelegramClient } from '../crm/telegram.client';
import { PrismaService } from '../prisma/prisma.service';
import { Mailer } from './mailer';

const CODE_TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
const HOUR = 3_600_000;

/** «Parolni unutdim» javobi — foydalanuvchi bor-yo'qligi, kanal ulangan-ulanmaganidan qat'i nazar BIR XIL. */
export const FORGOT_MESSAGE = "Agar akkauntingizga Telegram ulangan bo'lsa, kod yuborildi. Aks holda administratorga murojaat qiling";

export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
const hashCode = (salt: string, code: string) => createHash('sha256').update(`${salt}:${code}`).digest('hex');

/**
 * Parolni tiklash: 6 xonali bir martalik kod (15 daqiqa, 5 ta noto'g'ri urinish) Telegram bot / SMTP orqali.
 * Xavfsizlik: kod faqat tuzli sha256 ko'rinishida saqlanadi va hech qachon logga yozilmaydi; mavjud bo'lmagan email uchun ham
 * xuddi shunday yozuv yaratiladi (yuborilmaydi) — `forgot` ham, `reset` xatolari ham foydalanuvchi borligini oshkor qilmaydi.
 */
@Injectable()
export class PasswordResetService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PasswordReset');
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastCleanup = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tg: TelegramClient,
    private readonly notif: NotificationService,
    private readonly mailer: Mailer,
    private readonly leader: LeaderService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    // eskirgan kodlarni tozalash — kuniga bir marta, faqat rahbar nusxada
    this.timer = setInterval(() => {
      if (Date.now() - this.lastCleanup < 23 * HOUR) return;
      this.leader.guard(async () => { this.lastCleanup = Date.now(); await this.cleanup(); }).catch(() => undefined);
    }, HOUR);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** 24 soatdan eski kod yozuvlari o'chiriladi (ishlatilgan/eskirgan — baribir yaroqsiz). */
  async cleanup(): Promise<number> {
    const r = await this.prisma.passwordResetCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 24 * HOUR) } } });
    return r.count;
  }

  /**
   * POST /auth/forgot. Tezlik cheklovi sinxron (IP: soatiga 10, email: soatiga 3), qolgan ish (qidiruv, kod yaratish, yuborish)
   * fonda — javob vaqti foydalanuvchi bor-yo'qligiga bog'liq bo'lmaydi.
   */
  forgot(emailRaw: string, ip: string) {
    const email = normEmail(emailRaw);
    const msg = "Juda ko'p so'rov. Birozdan so'ng (1 soat ichida) qayta urining";
    rateLimit(`pwreset-ip:${ip}`, 10, HOUR, msg);
    rateLimit(`pwreset-email:${email}`, 3, HOUR, msg);
    setImmediate(() => {
      this.issue(email, ip).catch((e) => this.logger.warn('Parol tiklash kodi yaratilmadi: ' + ((e as Error)?.name || 'xato')));
    });
    return { ok: true, message: FORGOT_MESSAGE };
  }

  private async issue(email: string, ip: string) {
    const found = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true, name: true, email: true, isActive: true },
    });
    const user = found?.isActive ? found : null;
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    const rec = await this.prisma.passwordResetCode.create({
      data: { email, userId: user?.id ?? null, codeHash: hashCode(salt, code), salt, expiresAt: new Date(Date.now() + CODE_TTL_MS), ip: ip.slice(0, 64) || null },
    });
    // bitta email uchun faqat eng yangi kod amal qiladi
    await this.prisma.passwordResetCode.updateMany({ where: { email, usedAt: null, id: { not: rec.id } }, data: { usedAt: new Date() } });
    if (!user) return;

    const text = `CRM parolni tiklash kodi: ${code}\n15 daqiqa amal qiladi.\nSiz so'ramagan bo'lsangiz, e'tibor bermang.`;
    let channel = false;
    let delivered = false;
    const chatId = this.tg.enabled() ? await this.notif.tgChatId(user.id) : null;
    if (chatId) { channel = true; delivered = (await this.tg.sendMessage(chatId, text)).ok || delivered; }
    if (this.mailer.enabled()) { channel = true; delivered = (await this.mailer.send(user.email, 'CRM: parolni tiklash kodi', text)) || delivered; }
    if (delivered) return;

    // kod yetib bormadi — super adminlarga bildirishnoma (kodning o'zi emas)
    const why = channel ? "kodni yetkazib bo'lmadi (Telegram/email xatosi)" : "Telegram/email ulanmagan";
    const admins = await this.prisma.user.findMany({ where: { isActive: true, role: { key: 'super_admin' } }, select: { id: true } });
    for (const a of admins) {
      await this.notif.notify(a.id, `${user.name} parolni tiklamoqchi, ${why} — Sozlamalar → Foydalanuvchilar'dan yangi parol bering`, { link: '/settings/users' });
    }
  }

  /** POST /auth/reset: kod tekshiriladi (bir martalik, 5 urinish, 15 daqiqa) va parol almashtiriladi; barcha sessiyalar yopiladi. */
  async reset(emailRaw: string, codeRaw: string, newPassword: string, meta: { ip: string; ua: string }) {
    const email = normEmail(emailRaw);
    const code = String(codeRaw ?? '').replace(/\s+/g, '');
    rateLimit(`pwreset-try-ip:${meta.ip}`, 30, HOUR, "Juda ko'p urinish. Birozdan so'ng qayta urining");
    if ((newPassword || '').length < 6) throw new BadRequestException({ error: 'BAD_PASS', message: 'Parol kamida 6 belgi bo`lsin' });

    const invalid = (left?: number) => new BadRequestException({
      error: 'CODE_INVALID',
      message: left !== undefined ? `Kod noto'g'ri. Qolgan urinishlar: ${left}` : "Kod noto'g'ri yoki eskirgan. Yangi kod so'rang",
      ...(left !== undefined ? { details: { attemptsLeft: left } } : {}),
    });
    const tooMany = () => new BadRequestException({ error: 'CODE_ATTEMPTS', message: "Noto'g'ri urinishlar soni tugadi. Yangi kod so'rang" });

    const rec = await this.prisma.passwordResetCode.findFirst({ where: { email }, orderBy: { createdAt: 'desc' } });
    if (!rec || !/^\d{6}$/.test(code)) throw invalid();
    if (rec.usedAt) throw rec.attempts >= MAX_ATTEMPTS ? tooMany() : invalid();
    if (rec.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException({ error: 'CODE_EXPIRED', message: "Kodning muddati o'tgan (15 daqiqa). Yangi kod so'rang" });
    }
    // urinish taqqoslashdan OLDIN atomik hisoblanadi (parallel so'rovlar 5 ta chegarani aylanib o'tmasin)
    const bumped = await this.prisma.passwordResetCode.updateMany({
      where: { id: rec.id, usedAt: null, attempts: { lt: MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (bumped.count !== 1) throw tooMany();
    const a = Buffer.from(hashCode(rec.salt, code), 'hex');
    const b = Buffer.from(rec.codeHash, 'hex');
    const match = a.length === b.length && timingSafeEqual(a, b);
    if (!match) {
      const left = MAX_ATTEMPTS - (rec.attempts + 1);
      if (left <= 0) {
        await this.prisma.passwordResetCode.updateMany({ where: { id: rec.id, usedAt: null }, data: { usedAt: new Date() } });
        throw tooMany();
      }
      throw invalid(left);
    }

    const user = rec.userId ? await this.prisma.user.findUnique({ where: { id: rec.userId }, select: { id: true, email: true, isActive: true } }) : null;
    if (!user || !user.isActive || normEmail(user.email) !== email) throw invalid();
    // bir martalik: kodni faqat bitta so'rov «yeydi»
    const consumed = await this.prisma.passwordResetCode.updateMany({ where: { id: rec.id, usedAt: null }, data: { usedAt: new Date() } });
    if (consumed.count !== 1) throw invalid();

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      // barcha qurilmalardagi sessiyalar (refresh token oilalari) yopiladi — access tokenlar ham darhol yaroqsiz (sessionAlive)
      this.prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
      this.prisma.passwordResetCode.updateMany({ where: { email, usedAt: null }, data: { usedAt: now } }),
    ]);

    // audit: «Лог авторизаций» (crm_activities, type='auth', text='password_reset')
    try {
      await this.prisma.activity.create({
        data: { leadId: null, type: 'auth', actorId: user.id, actorName: user.email.slice(0, 200), text: 'password_reset', dataJson: JSON.stringify({ ip: meta.ip || '', ua: meta.ua || '' }) },
      });
    } catch { /* jurnal yozilmasa ham parol almashadi */ }
    // yangi parol bilan darhol kira olsin: shu email bo'yicha login blokirovkasi olib tashlanadi
    rateReset(`login-acct:${email}`);
    rateReset(`login:${meta.ip || '-'}:${email}`);
    this.logger.log(`Parol tiklash kodi orqali yangilandi: user=${user.id} ip=${meta.ip || '-'}`);

    const note = "🔐 CRM parolingiz o'zgartirildi (parolni tiklash orqali). Barcha qurilmalardagi seanslar yopildi.\nAgar bu siz bo'lmasangiz, darhol administratorga murojaat qiling.";
    const chatId = this.tg.enabled() ? await this.notif.tgChatId(user.id) : null;
    if (chatId) this.tg.sendMessage(chatId, note).catch(() => undefined);
    if (this.mailer.enabled()) this.mailer.send(user.email, "CRM: parol o'zgartirildi", note).catch(() => undefined);
    return { success: true };
  }
}
