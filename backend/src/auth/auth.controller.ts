import { clientIp } from '../common/guards/ip-whitelist.guard';
import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';

import {
  CurrentUser,
  type AuthUser,
} from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SetupDto } from './dto/setup.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: { ip?: string; headers?: Record<string, unknown> }) {
    // "Лог авторизаций" uchun IP va brauzer
    const ua = String(req?.headers?.['user-agent'] || '').slice(0, 300);
    return this.auth.login(dto.email, dto.password, { ip: clientIp(req), ua });
  }

  /** Avtorizatsiya jurnali (amoCRM "Лог авторизаций") — faqat rollarni boshqaradiganlar */
  @Get('log')
  @RequirePermissions('settings.roles.manage')
  authLog() {
    return this.auth.authLog();
  }

  /** Birinchi ishga tushirish: hech qanday foydalanuvchi yo'qmi? (ochiq) */
  @Public()
  @Get('setup-status')
  setupStatus() {
    return this.auth.setupStatus();
  }

  /** Birinchi super adminni yaratadi (faqat foydalanuvchilar yo'q bo'lganda). */
  @Public()
  @Post('setup')
  @HttpCode(200)
  setup(@Body() dto: SetupDto) {
    return this.auth.setup(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return {
      user: {
        id: user.id,
        name: user.name,
        initials: user.initials,
        email: user.email,
        role: user.role,
      },
      permissions: user.permissions,
    };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser) {
    await this.auth.logout(user.id, user.sid);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }
}
