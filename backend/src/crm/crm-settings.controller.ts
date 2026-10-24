import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CrmSettingsService } from './crm-settings.service';
import { PipelineSettingsService } from './pipeline-settings.service';

// O'qish ruxsati keng (crm.view), yozish admin sozlamasi (crm.settings)
@Controller('crm')
@RequirePermissions('crm.view')
export class CrmSettingsController {
  constructor(private readonly s: CrmSettingsService, private readonly ps: PipelineSettingsService) {}

  // ── Voronkalar ──
  @Get('pipelines') pipelines() { return this.s.listPipelines(); }
  @Post('pipelines') @RequirePermissions('crm.settings') createPipeline(@Body() dto: any) { return this.s.createPipeline(dto); }
  @Put('pipelines/:id') @RequirePermissions('crm.settings') updatePipeline(@Param('id') id: string, @Body() dto: any) { return this.s.updatePipeline(id, dto); }
  @Delete('pipelines/:id') @RequirePermissions('crm.settings') deletePipeline(@Param('id') id: string) { return this.s.deletePipeline(id); }

  // ── Voronka sozlamalari: "Saralanmagan" switch + dublikatlar nazorati (pipelineId = 'main' | id) ──
  @Get('pipeline-settings') pipelineSettings(@Query('pipelineId') pid?: string) { return this.ps.get(pid).then((settings) => ({ settings })); }
  @Put('pipeline-settings') @RequirePermissions('crm.settings') savePipelineSettings(@Query('pipelineId') pid: string | undefined, @Body() dto: any) { return this.ps.save(pid, dto).then((settings) => ({ settings })); }

  // ── Maxsus maydonlar ──
  @Get('fields') fields(@Query('entity') entity?: string) { return this.s.listFields(entity || 'lead'); }
  @Post('fields') @RequirePermissions('crm.settings') createField(@Body() dto: any) { return this.s.createField(dto); }
  @Post('fields/reorder') @RequirePermissions('crm.settings') reorderFields(@Body() dto: { ids?: string[] }) { return this.s.reorderFields(dto?.ids || []); }
  @Put('fields/:id') @RequirePermissions('crm.settings') updateField(@Param('id') id: string, @Body() dto: any) { return this.s.updateField(id, dto); }
  @Delete('fields/:id') @RequirePermissions('crm.settings') deleteField(@Param('id') id: string) { return this.s.deleteField(id); }

  // ── Yo'qotish sabablari ──
  @Get('lost-reasons') lostReasons() { return this.s.listLostReasons(); }
  @Post('lost-reasons') @RequirePermissions('crm.settings') createLostReason(@Body() dto: any) { return this.s.createLostReason(dto); }
  @Post('lost-reasons/reorder') @RequirePermissions('crm.settings') reorderLostReasons(@Body() dto: { ids?: string[] }) { return this.s.reorderLostReasons(dto?.ids || []); }
  @Put('lost-reasons/:id') @RequirePermissions('crm.settings') updateLostReason(@Param('id') id: string, @Body() dto: any) { return this.s.updateLostReason(id, dto); }
  @Delete('lost-reasons/:id') @RequirePermissions('crm.settings') deleteLostReason(@Param('id') id: string) { return this.s.deleteLostReason(id); }

  // ── Teglar katalogi ──
  @Get('tags') tags() { return this.s.listTags(); }
  @Post('tags') upsertTag(@Body() dto: any) { return this.s.upsertTag(dto); }
  @Put('tags/:id') @RequirePermissions('crm.settings') updateTag(@Param('id') id: string, @Body() dto: any) { return this.s.updateTag(id, dto); }
  @Post('tags/merge') @RequirePermissions('crm.settings') mergeTags(@Body() dto: any) { return this.s.mergeTags(dto); }
  @Post('tags/bulk-delete') @RequirePermissions('crm.settings') deleteTags(@Body() dto: { ids?: string[] }) { return this.s.deleteTags(dto?.ids || []); }
  @Delete('tags/:id') @RequirePermissions('crm.settings') deleteTag(@Param('id') id: string) { return this.s.deleteTag(id); }

  // ── Saqlangan filtrlar ──
  @Get('filters') filters(@CurrentUser('id') userId: string) { return this.s.listFilters(userId); }
  @Post('filters') createFilter(@Body() dto: any, @CurrentUser('id') userId: string) { return this.s.createFilter(userId, dto); }
  @Delete('filters/:id') deleteFilter(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.s.deleteFilter(userId, id); }
}
