import { timingSafeEqual } from 'crypto';

import {
  BadRequestException,
  ForbiddenException,
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

type SetupInput = {
  name: string;
  email: string;
  password: string;
  setupToken?: string;
};

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
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return null;
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
    const user = await this.validateUser(email, password);
    await this.logAuth(user?.id || null, email, !!user, meta);
    if (!user) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: "Email yoki parol noto'g'ri",
      });
    }
    return this.loginResponse(user.id);
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
    const email = dto.email.trim();
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

  private async loginResponse(userId: string) {
    const ctx = (await this.buildUserContext(userId))!;
    const tokens = await this.issueTokens(userId);

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
    let payload: { sub: string };
    try {
      payload = await this.jwt.verifyAsync<{ sub: string }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({
        error: 'INVALID_TOKEN',
        message: 'Sessiya muddati tugagan',
      });
    }

    const stored = await this.prisma.refreshToken.findMany({
      where: { userId: payload.sub, revokedAt: null },
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

    // Rotatsiyasiz: eski refresh token BEKOR QILINMAYDI — faqat yangi access token beramiz.
    // Sabab: foydalanuvchi CRM'ni alohida tabda ochadi; ikkala tab bir vaqtda refresh qilsa,
    // rotatsiya biri RT'ni bekor qilib, ikkinchisini logout qilardi ("tez-tez login"). Endi yo'q.
    const token = await this.signAccessToken(payload.sub);
    return { token, refreshToken };
  }

  async logout(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private ttl(v: string | undefined, def: string): JwtSignOptions['expiresIn'] {
    const s = (v ?? '').trim();
    return (/^\d+\s*(ms|s|m|h|d|w|y)?$/i.test(s) ? s : def) as JwtSignOptions['expiresIn'];
  }

  // Faqat access token — refresh'da rotatsiyasiz yangilash uchun.
  private async signAccessToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.ttl(this.config.get<string>('JWT_ACCESS_TTL'), '1h'),
      },
    );
  }

  private async issueTokens(userId: string): Promise<Tokens> {
    const accessTtl = this.ttl(this.config.get<string>('JWT_ACCESS_TTL'), '1h');
    const refreshTtl = this.ttl(this.config.get<string>('JWT_REFRESH_TTL'), '30d');

    const token = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: accessTtl,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtl,
      },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    const expiresAt = new Date(decoded.exp * 1000);
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return { token, refreshToken };
  }
}
