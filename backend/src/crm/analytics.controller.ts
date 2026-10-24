import { Controller, Get, Query } from '@nestjs/common';

import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CrmAnalyticsService } from './analytics.service';

@Controller('crm/analytics')
@RequirePermissions('crm.view')
export class CrmAnalyticsController {
  constructor(private readonly s: CrmAnalyticsService) {}

  @Get()
  overview(@Query('from') from?: string, @Query('to') to?: string, @Query('pipelineId') pipelineId?: string, @Query('userIds') userIds?: string) {
    return this.s.overview({ from, to, pipelineId, userIds });
  }

  @Get('calls')
  calls(@Query('from') from?: string, @Query('to') to?: string) {
    return this.s.calls({ from, to });
  }

  @Get('events')
  events(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('type') type?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.s.events({ from, to, type, userId, limit: limit ? Number(limit) : undefined });
  }

  @Get('timeline')
  timeline(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('pipelineId') pipelineId?: string,
    @Query('granularity') granularity?: string,
    @Query('userIds') userIds?: string,
  ) {
    return this.s.timeline({ from, to, pipelineId, granularity, userIds });
  }

  @Get('employees')
  employees(@Query('from') from?: string, @Query('to') to?: string, @Query('pipelineId') pipelineId?: string) {
    return this.s.employees({ from, to, pipelineId });
  }
}
