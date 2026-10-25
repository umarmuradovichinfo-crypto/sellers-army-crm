import { Body, Controller, ForbiddenException, Get, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CrmAnalyticsService } from './analytics.service';

/**
 * amoCRM ish stoli: foydalanuvchi joylashuvi (vidjetlar tartibi, o'lchami, filtr vidjetlari, mavzu, fon)
 * va «Применить настройки рабочего стола ко всем пользователям» (umumiy standart).
 */
@Controller('crm/dashboard')
@RequirePermissions('crm.view')
export class DashboardController {
  constructor(private readonly prisma: PrismaService, private readonly analytics: CrmAnalyticsService) {}

  private async read(key: string) {
    const row = await this.prisma.appSetting.findUnique({ where: { key } });
    try { return row ? JSON.parse(row.value) : null; } catch { return null; }
  }

  @Get()
  async get(@CurrentUser('id') userId: string) {
    return { layout: (await this.read(`dashboard:${userId}`)) || (await this.read('dashboard:default')) };
  }

  @Put()
  async save(@Body() dto: { layout?: any; applyAll?: boolean }, @CurrentUser() user: AuthUser) {
    const layout = dto?.layout && typeof dto.layout === 'object' ? dto.layout : {};
    const value = JSON.stringify(layout).slice(0, 200_000);
    if (dto?.applyAll) {
      if (!user.permissions?.includes('crm.settings')) throw new ForbiddenException({ error: 'FORBIDDEN', message: 'Faqat administrator barcha uchun qo`llay oladi' });
      // barcha foydalanuvchilarga: shaxsiy joylashuvlar o'chiriladi, umumiy standart yoziladi
      await this.prisma.appSetting.deleteMany({ where: { key: { startsWith: 'dashboard:' } } });
      await this.prisma.appSetting.create({ data: { key: 'dashboard:default', value } });
      return { ok: true };
    }
    const key = `dashboard:${user.id}`;
    await this.prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    return { ok: true };
  }

  @Get('widget')
  widget(@Query() q: Record<string, string>, @CurrentUser('id') userId?: string) {
    return this.analytics.widgetData(q, userId);
  }
}
