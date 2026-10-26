import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { GoalsService } from './goals.service';

@Controller('crm/goals')
@RequirePermissions('crm.view')
export class GoalsController {
  constructor(private readonly s: GoalsService) {}

  @Get() list(@Query('period') period?: string, @CurrentUser('id') userId?: string) { return this.s.list(period, userId); }
  @Post() @RequirePermissions('crm.settings') upsert(@Body() dto: any) { return this.s.upsert(dto); }
  @Delete(':id') @RequirePermissions('crm.settings') remove(@Param('id') id: string) { return this.s.remove(id); }
}
