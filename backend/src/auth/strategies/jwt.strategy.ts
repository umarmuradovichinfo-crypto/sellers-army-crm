import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly auth: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: { sub: string; sid?: string }): Promise<AuthUser> {
    const ctx = await this.auth.buildUserContext(payload.sub);
    if (!ctx) throw new UnauthorizedException();
    // «Сеансы» → «Выйти»: yopilgan sessiyaning access tokeni ham darhol ishlamaydi
    if (payload.sid && !(await this.auth.sessionAlive(payload.sub, payload.sid))) throw new UnauthorizedException();
    return { ...ctx, sid: payload.sid }; // req.user bo'ladi
  }
}
