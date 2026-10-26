import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AutomationService } from './automation.service';
import { RequireFeature } from '../billing/require-feature.decorator';

@Controller('crm/automations')
@RequireFeature('automation')
@RequirePermissions('crm.automation')
export class AutomationController {
  constructor(private readonly s: AutomationService) {}

  @Get() list() { return this.s.list(); }
  @Post('tick') tick() { return this.s.tick(); }
  @Post() create(@Body() dto: any, @CurrentUser('id') userId: string) { return this.s.create(dto, userId); }
  @Put(':id') update(@Param('id') id: string, @Body() dto: any) { return this.s.update(id, dto); }
  @Delete(':id') remove(@Param('id') id: string) { return this.s.remove(id); }
}
