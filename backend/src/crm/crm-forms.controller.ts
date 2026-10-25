import { Body, Controller, Delete, Get, Headers, Param, Post, Put, Query, Req } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CrmFormsService } from './crm-forms.service';
import { pickUtm } from './utm';
import { rateLimit } from '../common/rate-limit';
import { clientIp } from '../common/guards/ip-whitelist.guard';

// Admin — lead-capture formalarni boshqarish
@Controller('crm/forms')
@RequirePermissions('crm.view')
export class CrmFormsController {
  constructor(private readonly s: CrmFormsService) {}

  @Get() list() { return this.s.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.s.get(id); }
  @Post() @RequirePermissions('crm.settings') create(@Body() dto: any, @CurrentUser('id') userId: string) { return this.s.create(dto, userId); }
  @Put(':id') @RequirePermissions('crm.settings') update(@Param('id') id: string, @Body() dto: any) { return this.s.update(id, dto); }
  @Delete(':id') @RequirePermissions('crm.settings') remove(@Param('id') id: string) { return this.s.remove(id); }
}

// Ommaviy (login'siz) — formani ko'rish va to'ldirish
@Controller('public/crm-forms')
export class PublicCrmFormsController {
  constructor(private readonly s: CrmFormsService) {}

  @Public() @Get(':slug') get(@Param('slug') slug: string) { return this.s.getPublic(slug); }
  // UTM: querystring (?utm_source=..), body.utm (sahifa URL'idan), body.referrer / Referer sarlavhasi
  @Public() @Post(':slug') submit(
    @Param('slug') slug: string,
    @Body() body: { answers?: Record<string, any>; utm?: Record<string, any>; referrer?: string },
    @Query() query: Record<string, any>,
    @Headers('referer') referer?: string,
    @Req() req?: any,
  ) {
    // spamdan himoya: bitta IP'dan bitta formaga 10 daqiqada 20 tagacha ariza
    rateLimit(`form:${clientIp(req)}:${slug}`, 20, 10 * 60_000, "Juda ko'p ariza yuborildi. Birozdan so'ng qayta urining");
    return this.s.submit(slug, body?.answers || {}, { ...pickUtm(body?.utm), ...pickUtm(query), referrer: body?.referrer || referer });
  }
}
