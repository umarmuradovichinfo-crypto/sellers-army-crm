import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

import type { AuthUser } from '../common/decorators/current-user.decorator';
import { initialsOf } from '../common/utils/initials';
import { PrismaService } from '../prisma/prisma.service';

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

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException({
        error: 'INVALID_CREDENTIALS',
        message: "Email yoki parol noto'g'ri",
      });
    }
    const ctx = (await this.buildUserContext(user.id))!;
    const tokens = await this.issueTokens(user.id);

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
