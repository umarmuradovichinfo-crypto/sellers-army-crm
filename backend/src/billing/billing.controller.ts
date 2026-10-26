import { Body, Controller, ForbiddenException, Get, Post } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // Banner uchun (har bir kirgan foydalanuvchi)
  @Get('status')
  status() { return this.billing.status(); }

  @Get()
  @RequirePermissions('settings.view')
  overview() { return this.billing.overview(); }

  // Litsenziya kodini faqat super admin kiritadi
  @Post('activate')
  @RequirePermissions('settings.view')
  activate(@Body() body: { code?: string }, @CurrentUser() me: AuthUser) {
    if (me.role !== 'super_admin') throw new ForbiddenException({ error: 'FORBIDDEN', message: 'Obunani faqat super admin faollashtiradi' });
    return this.billing.activate(String(body?.code || ''));
  }
}
