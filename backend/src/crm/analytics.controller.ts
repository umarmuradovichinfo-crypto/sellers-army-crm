import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CrmAnalyticsService } from './analytics.service';

/**
 * Analitika. overview / timeline / employees bitimlar filtrining BARCHA parametrlarini qabul qiladi
 * (dateField, datePreset, from, to, stages, sources, assigneeIds, userIds, tags, cf, utm, ... — GET /crm/leads bilan bir xil).
 */
@Controller('crm/analytics')
@RequirePermissions('crm.view')
export class CrmAnalyticsController {
  constructor(private readonly s: CrmAnalyticsService) {}

  @Get()
  overview(@Query() q: Record<string, any>, @CurrentUser('id') userId?: string) {
    return this.s.overview(q, userId);
  }

  @Get('calls')
  calls(@Query('from') from?: string, @Query('to') to?: string, @Query('datePreset') datePreset?: string) {
    return this.s.calls({ from, to, datePreset });
  }

  @Get('events')
  events(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('datePreset') datePreset?: string,
    @Query('type') type?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.s.events({ from, to, datePreset, type, userId, limit: limit ? Number(limit) : undefined });
  }

  @Get('timeline')
  timeline(@Query() q: Record<string, any>, @CurrentUser('id') userId?: string) {
    return this.s.timeline(q, userId);
  }

  @Get('employees')
  employees(@Query() q: Record<string, any>, @CurrentUser('id') userId?: string) {
    return this.s.employees(q, userId);
  }
}
