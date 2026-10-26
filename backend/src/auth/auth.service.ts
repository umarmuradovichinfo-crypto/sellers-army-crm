import { timingSafeEqual } from 'crypto';

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { initialsOf } from '../common/utils/initials';
import { PrismaService } from '../prisma/prisma.service';
import { rateCount, rateHit, rateReset } from '../common/rate-limit';

type SetupInput = {
  name: string;
  email: string;
  password: string;
  setupToken?: string;
};

// mavjud bo'lmagan foydalanuvchi uchun taqqoslash (javob vaqtini tenglashtirish)
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);
type Tokens = { token: string; refreshToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** Email + parolni tekshiradi. */
  async validateUser(email: string, password: string) {
    // email foydalanuvchi yaratilganda kichik harfga o'tkaziladi — login ham shunday (telefon klaviaturasi birinchi harfni katta qiladi)
    const e = String(email || '').trim();
    if (!e) return null;
    const user = await this.prisma.user.findFirst({ where: { email: { equals: e, mode: 'insensitive' } } });
    // mavjud bo'lmagan/nofaol email uchun ham bcrypt ishlaydi — javob vaqti bo'yicha foydalanuvchi aniqlanmasin
    if (!user || !user.isActive) { await bcrypt.compare(password, DUMMY_HASH); return null; }
    const ok = await bcrypt.compare(password, user.passwordHash);
    return ok ? user : null;
  }

  /** JWT/`/auth/me` uchun foydalanuvchi konteksti (rol + ruxsatlar). */
  async buildUserContext(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
      },
    });
    if (!user || !user.isActive) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      initials: initialsOf(user.name),
      role: user.role.key,
      permissions: user.role.permissions.map((rp) => rp.permission.key),
    };
  }

  async login(email: string, password: string, meta?: { ip?: string; ua?: string }) {
    // parol tanlashdan himoya: bitta email+IP uchun 15 daqiqada 10 ta, bitta IP uchun 50 ta xato urinish
    const ip = meta?.ip || '-';
    const kEmail = `login:${ip}:${String(email || '').trim().toLowerCase()}`;
    const kIp = `login-ip:${ip}`;
    const kAcct = `login-acct:${String(email || '').trim().toLowerCase()}`; // IP almashtirib bitta akkauntni tanlashga qarshi (IP'siz umumiy limit)
    const WIN = 15 * 60_000;
    if (rateCount(kEmail, WIN) >= 10 || rateCount(kIp, WIN) >= 50 || rateCount(kAcct, WIN) >= 30) {
      throw new HttpException({ error: 'TOO_MANY_ATTEMPTS', message: "Juda ko'p noto'g'ri urinish. 15 daqiqadan so'ng qayta urining" }, HttpStatus.TOO_MANY_REQUESTS);
    }
    rateHit(kEmail); // urinish bcrypt'dan OLDIN hisoblanadi (parallel so'rovlar limitni aylanib o'tmasin)
    const user = await this.validateUser(email, password);
    await this.logAuth(user?.id || null, email, !!user, meta);
    if (user) rateReset(kEmail);
    else { rateHit(kIp); rateHit(kAcct); }
    if (!user) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: "Email yoki parol noto'g'ri",
      });
    }
    return this.loginResponse(user.id, meta);
  }

  /** Avtorizatsiya jurnali (Sozlamalar → Foydalanuvchilar → "…" → Лог авторизаций): crm_activities, type='auth'. */
  private async logAuth(userId: string | null, email: string, ok: boolean, meta?: { ip?: string; ua?: string }) {
    try {
      await this.prisma.activity.create({
        data: { leadId: null, type: 'auth', actorId: userId, actorName: String(email || '').slice(0, 200), text: ok ? 'ok' : 'fail', dataJson: JSON.stringify({ ip: meta?.ip || '', ua: meta?.ua || '' }) },
      });
    } catch { /* jurnal yozilmasa ham kirish ishlaydi */ }
  }

  /** Oxirgi kirishlar (eng yangisi birinchi). */
  async authLog(limit = 200) {
    const rows = await this.prisma.activity.findMany({ where: { type: 'auth' }, orderBy: { createdAt: 'desc' }, take: Math.min(500, Math.max(1, limit)) });
    const ids = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[];
    const users = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const name = new Map(users.map((u) => [u.id, u.name]));
    return {
      items: rows.map((r) => {
        let d: { ip?: string; ua?: string } = {};
        try { d = JSON.parse(r.dataJson || '{}'); } catch { /* */ }
        return { at: r.createdAt.toISOString(), email: r.actorName, name: r.actorId ? name.get(r.actorId) || null : null, ok: r.text === 'ok', ip: d.ip || '', ua: d.ua || '' };
      }),
    };
  }

  private setupTokenRequired(): string {
    return (this.config.get<string>('SETUP_TOKEN') ?? '').trim();
  }

  /** Birinchi sozlash holati: foydalanuvchi yo'q bo'lsa needsSetup=true. */
  async setupStatus() {
    const needsSetup = (await this.prisma.user.count()) === 0;
    return { needsSetup, tokenRequired: needsSetup && !!this.setupTokenRequired() };
  }

  /** Birinchi super adminni yaratadi; keyin login javobini qaytaradi. */
  async setup(dto: SetupInput) {
    const required = this.setupTokenRequired();
    if (required) {
      const a = Buffer.from(dto.setupToken ?? '');
      const b = Buffer.from(required);
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw new ForbiddenException({
          error: 'INVALID_SETUP_TOKEN',
          message: "Sozlash kodi noto'g'ri",
        });
      }
    }
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException({ message: 'Ism kiritilishi shart' });
    }
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const userId = await this.prisma.$transaction(async (tx) => {
      // Bir vaqtdagi ikki so'rov ikkita admin yaratmasligi uchun tranzaksiya darajasidagi qulf.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(727001)`;
      if ((await tx.user.count()) > 0) {
        throw new ForbiddenException({
          error: 'SETUP_DONE',
          message: 'Sozlash allaqachon bajarilgan',
        });
      }
      const role = await tx.role.findUnique({ where: { key: 'super_admin' } });
      if (!role) {
        throw new ServiceUnavailableException({
          message: "Rollar topilmadi (seed ishga tushmagan)",
        });
      }
      const user = await tx.user.create({
        data: { name, email, passwordHash, roleId: role.id },
      });
      return user.id;
    });
    return this.loginResponse(userId);
  }

  private async loginResponse(userId: string, meta?: { ip?: string; ua?: string }) {
    const ctx = (await this.buildUserContext(userId))!;
    const tokens = await this.issueTokens(userId, meta);

    return {
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      user: {
        id: ctx.id,
        name: ctx.name,
        initials: ctx.initials,
        email: ctx.email,
        role: ctx.role,
      },
      permissions: ctx.permissions,
    };
  }

  async refresh(refreshToken: string): Promise<Tokens> {
    let payload: { sub: string; sid?: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string; sid?: string }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        error: 'INVALID_TOKEN',
        message: 'Sessiya muddati tugagan',
      });
    }

    const stored = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null, ...(payload.sid ? { id: payload.sid } : {}) },
    });
    let matched: (typeof stored)[number] | null = null;
    for (const t of stored) {
      if (await bcrypt.compare(refreshToken, t.tokenHash)) {
        matched = t;
        break;
      }
    }
    if (!matched || matched.expiresAt < new Date()) {
      throw new UnauthorizedException({
        error: 'INVALID_TOKEN',
        message: 'Sessiya yaroqsiz',
      });
    }
    // o'chirilgan foydalanuvchi yangi access token ololmaydi
    const alive = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { isActive: true } });
    if (!alive?.isActive) throw new UnauthorizedException({ error: 'INVALID_TOKEN', message: 'Hisob o\'chirilgan' });

    // Rotatsiyasiz: eski refresh token BEKOR QILINMAYDI — faqat yangi access token beramiz.
    // Sabab: foydalanuvchi CRM'ni alohida tabda ochadi; ikkala tab bir vaqtda refresh qilsa,
    // rotatsiya biri RT'ni bekor qilib, ikkinchisini logout qilardi ("tez-tez login"). Endi yo'q.
    await this.prisma.refreshToken.update({ where: { id: matched.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    const token = await this.signAccessToken(payload.sub, matched.id);
    return { token, refreshToken };
  }

  /** «выйти»: amoCRM kabi faqat joriy sessiya yopiladi (sid yo'q eski tokenlar — hammasi). */
  async logout(userId: string, sid?: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null, ...(sid ? { id: sid } : {}) },
      data: { revokedAt: new Date() },
    });
  }

  /** Access token sessiyasi hali ochiqmi («Сеансы» → «Выйти» qilingan bo'lsa — yo'q). */
  async sessionAlive(userId: string, sid: string): Promise<boolean> {
    const r = await this.prisma.refreshToken.findFirst({ where: { id: sid, userId }, select: { revokedAt: true, expiresAt: true } });
    return !!r && !r.revokedAt && r.expiresAt > new Date();
  }

  private ttl(v: string | undefined, def: string): JwtSignOptions['expiresIn'] {
    const s = (v ?? '').trim();
    return (/^\d+\s*(ms|s|m|h|d|w|y)?$/i.test(s) ? s : def) as JwtSignOptions['expiresIn'];
  }

  // Faqat access token — refresh'da rotatsiyasiz yangilash uchun.
  private async signAccessToken(userId: string, sid?: string): Promise<string> {
    return this.jwt.signAsync(
      sid ? { sub: userId, sid } : { sub: userId },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.ttl(this.config.get<string>('JWT_ACCESS_TTL'), '1h'),
      },
    );
  }

  private async issueTokens(userId: string, meta?: { ip?: string; ua?: string }): Promise<Tokens> {
    const refreshTtl = this.ttl(this.config.get<string>('JWT_REFRESH_TTL'), '30d');
    // sessiya yozuvi avval yaratiladi — uning id'si (sid) ikkala tokenga yoziladi
    const session = await this.prisma.refreshToken.create({
      data: { userId, tokenHash: '', expiresAt: new Date(Date.now() + 60_000), ip: meta?.ip || null, ua: meta?.ua || null, lastUsedAt: new Date() },
    });
    const token = await this.signAccessToken(userId, session.id);
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, sid: session.id },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtl,
      },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.refreshToken.update({
      where: { id: session.id },
      data: { tokenHash, expiresAt },
    });

    return { token, refreshToken };
  }
}
