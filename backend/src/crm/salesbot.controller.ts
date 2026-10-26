import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RightsService } from '../common/rights/rights.service';
import { SalesbotService } from './salesbot.service';
import { RequireFeature } from '../billing/require-feature.decorator';

// amoCRM «AI-агенты и боты» → «Список ботов» va Salesbot konstruktori
@Controller('crm')
@RequireFeature('automation')
@RequirePermissions('crm.view')
export class SalesbotController {
  constructor(private readonly s: SalesbotService, private readonly r: RightsService) {}

  @Get('salesbots') list() { return this.s.list(); }
  @Get('salesbots/:id') get(@Param('id') id: string) { return this.s.get(id); }
  @Post('salesbots') @RequirePermissions('crm.settings') create(@Body() dto: any, @CurrentUser() user: AuthUser) { return this.s.create(dto, user); }
  @Put('salesbots/:id') @RequirePermissions('crm.settings') update(@Param('id') id: string, @Body() dto: any) { return this.s.update(id, dto); }
  @Delete('salesbots/:id') @RequirePermissions('crm.settings') remove(@Param('id') id: string) { return this.s.remove(id); }
  // bitim kartochkasidan qo'lda ishga tushirish / to'xtatish
  @Post('salesbots/:id/run') async run(@Param('id') id: string, @Body() dto: { leadId?: string }, @CurrentUser() u: AuthUser) { await this.r.assertLead(u, String(dto?.leadId || ''), 'edit'); return this.s.start(id, String(dto?.leadId || '')); }
  @Get('leads/:id/salesbot-runs') async runs(@Param('id') id: string, @CurrentUser() u: AuthUser) { await this.r.assertLead(u, id, 'view'); return this.s.leadRuns(id); }
  @Post('leads/:id/salesbot-stop') async stop(@Param('id') id: string, @CurrentUser() u: AuthUser) { await this.r.assertLead(u, id, 'edit'); return this.s.stopLead(id); }
}
