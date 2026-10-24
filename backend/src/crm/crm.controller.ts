import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CrmService } from './crm.service';
import {
  AddNoteDto,
  BulkDto,
  CreateLeadDto,
  CreateLeadTaskDto,
  CreateStageDto,
  MoveLeadDto,
  UpdateLeadDto,
  UpdateLeadTaskDto,
  UpdateStageDto,
} from './dto/crm.dto';

@Controller('crm')
@RequirePermissions('crm.view')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('pipeline')
  pipeline(@Query() q: Record<string, string>, @CurrentUser('id') userId?: string) {
    return this.crm.getPipeline(q.pipelineId, q, userId);
  }
  @Get('pipeline/stage-leads')
  stageLeads(@Query() q: Record<string, string>, @CurrentUser('id') userId?: string) {
    return this.crm.stageLeads(q, userId);
  }

  @Get('members')
  members() {
    return this.crm.listMembers();
  }

  // ── Bosqichlar ──
  @Get('stages')
  stages() {
    return this.crm.listStages();
  }
  @Post('stages')
  createStage(@Body() dto: CreateStageDto, @CurrentUser() user: AuthUser) {
    return this.crm.createStage(dto, user);
  }
  @Put('stages/:key')
  updateStage(@Param('key') key: string, @Body() dto: UpdateStageDto, @CurrentUser() user: AuthUser) {
    return this.crm.updateStage(key, dto, user);
  }
  @Delete('stages/:key')
  deleteStage(@Param('key') key: string, @CurrentUser() user: AuthUser) {
    return this.crm.deleteStage(key, user);
  }

  // ── Lidlar ──
  @Get('leads')
  listLeads(@Query() q: Record<string, string>, @CurrentUser('id') userId?: string) {
    return this.crm.listLeads(q, userId);
  }
  @Get('leads-export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="leads.csv"')
  exportCsv(@Query() q: Record<string, string>, @CurrentUser('id') userId?: string) {
    return this.crm.exportCsv(q, userId);
  }
  @Post('leads-import')
  importLeads(@Body() body: { rows: any[] }, @CurrentUser() user: AuthUser) {
    return this.crm.importLeads(body?.rows || [], user);
  }
  @Get('leads-check')
  checkDup(@Query('phone') phone?: string, @Query('email') email?: string, @Query('excludeId') excludeId?: string) {
    return this.crm.findDuplicates(phone, email, excludeId);
  }
  @Post('leads/bulk')
  bulk(@Body() dto: BulkDto, @CurrentUser() user: AuthUser) {
    return this.crm.bulk(dto, user);
  }
  @Post('leads/merge')
  merge(@Body() dto: { keepId: string; mergeIds: string[] }, @CurrentUser() user: AuthUser) {
    return this.crm.mergeLeads(dto.keepId, dto.mergeIds || [], user);
  }
  @Get('unsorted')
  unsorted(@Query() q: Record<string, string>, @CurrentUser('id') userId?: string) {
    return this.crm.listUnsorted(q, userId);
  }
  @Get('sources')
  sources() {
    return this.crm.listSources();
  }
  @Get('leads-duplicates')
  duplicateGroups(@Query('by') by: string | undefined) {
    return this.crm.duplicateGroups(by || 'phone');
  }
  @Post('unsorted/:id/accept')
  acceptUnsorted(@Param('id') id: string, @Body() dto: { assigneeId?: string; stageKey?: string; pipelineId?: string }, @CurrentUser() user: AuthUser) {
    return this.crm.acceptUnsorted(id, dto, user);
  }
  @Post('leads')
  createLead(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthUser) {
    return this.crm.createLead(dto, user);
  }
  @Get('leads/:id')
  getLead(@Param('id') id: string) {
    return this.crm.getLead(id);
  }
  @Put('leads/:id')
  updateLead(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: AuthUser) {
    return this.crm.updateLead(id, dto, user);
  }
  @Delete('leads/:id')
  deleteLead(@Param('id') id: string) {
    return this.crm.deleteLead(id);
  }
  @Post('leads/:id/contacts')
  addLeadContact(@Param('id') id: string, @Body() dto: { contactId?: string; name?: string; phone?: string; email?: string }, @CurrentUser() user: AuthUser) {
    return this.crm.addLeadContact(id, dto, user);
  }
  @Delete('leads/:id/contacts/:contactId')
  removeLeadContact(@Param('id') id: string, @Param('contactId') contactId: string, @CurrentUser() user: AuthUser) {
    return this.crm.removeLeadContact(id, contactId, user);
  }
  @Put('leads/:id/contacts/:contactId/main')
  setMainLeadContact(@Param('id') id: string, @Param('contactId') contactId: string) {
    return this.crm.setMainLeadContact(id, contactId);
  }
  @Patch('leads/:id/move')
  moveLead(@Param('id') id: string, @Body() dto: MoveLeadDto, @CurrentUser() user: AuthUser) {
    return this.crm.moveLead(id, dto.stageId, dto.position, user, dto.lostReason);
  }
  @Post('leads/:id/notes')
  addNote(@Param('id') id: string, @Body() dto: AddNoteDto, @CurrentUser() user: AuthUser) {
    return this.crm.addNote(id, dto, user);
  }

  // ── Vazifalar (zadacha) ──
  @Get('tasks')
  allTasks(@Query('status') status?: string, @Query('assigneeId') assigneeId?: string, @Query('type') type?: string, @Query('filter') filter?: string) {
    return this.crm.listAllTasks({ status: status || filter, assigneeId, type });
  }
  @Get('leads/:id/tasks')
  leadTasks(@Param('id') id: string) {
    return this.crm.listLeadTasks(id);
  }
  @Post('leads/:id/tasks')
  createTask(@Param('id') id: string, @Body() dto: CreateLeadTaskDto, @CurrentUser() user: AuthUser) {
    return this.crm.createTask(id, dto, user);
  }
  @Put('tasks/:id')
  updateTask(@Param('id') id: string, @Body() dto: UpdateLeadTaskDto, @CurrentUser() user: AuthUser) {
    return this.crm.updateTask(id, dto, user);
  }
  @Get('tasks-deleted')
  deletedTasks() {
    return this.crm.listDeletedTasks();
  }
  @Post('tasks-deleted/:id/restore')
  restoreTask(@Param('id') id: string) {
    return this.crm.restoreTask(id);
  }
  @Delete('tasks/:id')
  deleteTask(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.crm.deleteTask(id, user);
  }
}
