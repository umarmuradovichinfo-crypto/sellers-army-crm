import { RightsService } from '../common/rights/rights.service';
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
import { CrmService, type MergePick } from './crm.service';
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
  constructor(private readonly crm: CrmService, private readonly rights: RightsService) {}

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
  async importLeads(@Body() body: { rows: any[] }, @CurrentUser() user: AuthUser) {
    await this.rights.assertAdd(user, 'leads');
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
  async merge(@Body() dto: { keepId: string; mergeIds: string[]; pick?: MergePick }, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, dto.keepId, 'edit');
    for (const id of dto.mergeIds || []) await this.rights.assertLead(user, id, 'delete');
    return this.crm.mergeLeads(dto.keepId, dto.mergeIds || [], user, dto.pick);
  }
  @Post('leads-duplicates/ignore')
  ignoreDuplicates(@Body() dto: { ids?: string[] }) {
    return this.crm.ignoreDuplicates(dto?.ids || []);
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
  async acceptUnsorted(@Param('id') id: string, @Body() dto: { assigneeId?: string; stageKey?: string; pipelineId?: string }, @CurrentUser() user: AuthUser) {
    await this.rights.assertUnsorted(user, id, 'edit');
    return this.crm.acceptUnsorted(id, dto, user);
  }
  @Post('leads')
  async createLead(@Body() dto: CreateLeadDto, @CurrentUser() user: AuthUser) {
    await this.rights.assertAdd(user, 'leads');
    return this.crm.createLead(dto, user);
  }
  @Get('leads/:id')
  async getLead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'view');
    return this.crm.getLead(id);
  }
  @Put('leads/:id')
  async updateLead(@Param('id') id: string, @Body() dto: UpdateLeadDto, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'edit');
    return this.crm.updateLead(id, dto, user);
  }
  @Delete('leads/:id')
  async deleteLead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'delete');
    return this.crm.deleteLead(id);
  }
  @Post('leads/:id/contacts')
  async addLeadContact(@Param('id') id: string, @Body() dto: { contactId?: string; name?: string; phone?: string; email?: string }, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'edit');
    return this.crm.addLeadContact(id, dto, user);
  }
  @Delete('leads/:id/contacts/:contactId')
  async removeLeadContact(@Param('id') id: string, @Param('contactId') contactId: string, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'edit');
    return this.crm.removeLeadContact(id, contactId, user);
  }
  @Put('leads/:id/contacts/:contactId/main')
  async setMainLeadContact(@Param('id') id: string, @Param('contactId') contactId: string, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'edit');
    return this.crm.setMainLeadContact(id, contactId);
  }
  @Patch('leads/:id/move')
  async moveLead(@Param('id') id: string, @Body() dto: MoveLeadDto, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'edit');
    return this.crm.moveLead(id, dto.stageId, dto.position, user, dto.lostReason);
  }
  @Post('leads/:id/notes')
  async addNote(@Param('id') id: string, @Body() dto: AddNoteDto, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'view');
    return this.crm.addNote(id, dto, user);
  }

  // ── Vazifalar (zadacha) ──
  @Get('tasks')
  allTasks(@CurrentUser('id') userId: string, @Query('status') status?: string, @Query('assigneeId') assigneeId?: string, @Query('type') type?: string, @Query('filter') filter?: string) {
    return this.crm.listAllTasks({ status: status || filter, assigneeId, type }, userId);
  }
  @Get('leads/:id/tasks')
  async leadTasks(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'view');
    return this.crm.listLeadTasks(id);
  }
  @Post('leads/:id/tasks')
  async createTask(@Param('id') id: string, @Body() dto: CreateLeadTaskDto, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'view');
    return this.crm.createTask(id, dto, user);
  }
  @Put('tasks/:id')
  async updateTask(@Param('id') id: string, @Body() dto: UpdateLeadTaskDto, @CurrentUser() user: AuthUser) {
    await this.rights.assertTask(user, id, 'edit');
    return this.crm.updateTask(id, dto, user);
  }
  @Get('task-types')
  taskTypes() {
    return this.crm.getTaskTypes();
  }
  @Put('task-types')
  @RequirePermissions('crm.settings')
  saveTaskTypes(@Body() body: { custom?: unknown }) {
    return this.crm.saveTaskTypes(body);
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
  async deleteTask(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rights.assertTask(user, id, 'delete');
    return this.crm.deleteTask(id, user);
  }
}
