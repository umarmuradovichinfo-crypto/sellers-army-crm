import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CrmFormsService } from './crm-forms.service';

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
  @Public() @Post(':slug') submit(@Param('slug') slug: string, @Body() body: { answers?: Record<string, any> }) { return this.s.submit(slug, body?.answers || {}); }
}
