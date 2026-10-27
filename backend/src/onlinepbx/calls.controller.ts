import { RightsService } from '../common/rights/rights.service';
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CallsService } from './calls.service';
import { ClickCallDto, ExtensionDto } from './dto/calls.dto';

@Controller('crm')
@RequirePermissions('crm.view')
export class CallsController {
  constructor(private readonly calls: CallsService, private readonly rights: RightsService) {}

  @Post('leads/:id/call')
  async call(@Param('id') id: string, @Body() dto: ClickCallDto, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'view');
    return this.calls.clickToCall(user, id, dto.from);
  }

  @Get('leads/:id/calls')
  async leadCalls(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rights.assertLead(user, id, 'view');
    return this.calls.leadCalls(id);
  }

  // Barcha qo'ng'iroqlar ro'yxati (CRM "Qo'ng'iroqlar" bo'limi)
  @Get('calls/stats')
  callsStats(@Query() q: Record<string, string>, @CurrentUser('id') userId: string) {
    return this.calls.callsStats(q, userId);
  }

  @Get('calls/report')
  callsReport(@Query() q: Record<string, string>, @CurrentUser('id') userId: string) {
    return this.calls.callsReport(q, userId);
  }

  @Get('calls')
  listCalls(@CurrentUser('id') userId: string, @Query('filter') filter?: string, @Query('limit') limit?: string) {
    return this.calls.listCalls({ filter, limit: limit ? Number(limit) : undefined }, userId);
  }

  // OnlinePBX tarixidan qo'ng'iroq/yozuvlarni qo'lda sinxronlash (so'nggi 7 kun)
  @Post('calls/sync')
  @RequirePermissions('crm.settings') // tashqi API'ni qayta-qayta chaqirish — faqat sozlama huquqi bilan
  syncCalls() {
    return this.calls.syncHistory({ force: true, days: 7 });
  }

  // Qo'ng'iroq yozuvi — server orqali (chatda ijro; tashqi havolaga o'tkazmaydi)
  @Get('calls/:id/recording')
  async recording(@Param('id') id: string, @Res() res: Response, @CurrentUser() user: AuthUser) {
    await this.rights.assertCall(user, id);
    const rec = await this.calls.getRecording(id);
    res.setHeader('Content-Type', rec.contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Length', String(rec.buffer.length));
    res.end(rec.buffer);
  }

  @Post('calls/dial')
  dial(@Body() dto: { to?: string }, @CurrentUser() user: AuthUser) {
    return this.calls.dial(user, dto?.to || '');
  }

  // Softphone rejim: MicroSIP o'zi teradi — biz faqat log yozamiz (yozuv webhookdan)
  @Post('calls/soft-log')
  softLog(@Body() dto: { leadId?: string; to?: string }, @CurrentUser() user: AuthUser) {
    return this.calls.softLog(user, { leadId: dto?.leadId, to: dto?.to });
  }

  @Get('calls/incoming')
  incoming(@CurrentUser('id') userId: string) {
    return this.calls.incoming(userId);
  }

  @Post('calls/:id/dismiss')
  async dismiss(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.rights.assertCall(user, id);
    return this.calls.dismissIncoming(id);
  }

  // Operator ichki raqami (har sotuvchi o'ziniki)
  @Get('my-extension')
  myExt(@CurrentUser() user: AuthUser) {
    return this.calls.getMyExtension(user);
  }

  // Brauzer WebRTC-telefoni (JsSIP) sozlamasi — operator o'ziniki
  @Get('webrtc/config')
  webrtcConfig(@CurrentUser() user: AuthUser) {
    return this.calls.getWebrtcConfig(user);
  }
  @Get('lead-by-phone')
  leadByPhone(@Query('phone') phone: string, @CurrentUser('id') userId: string) {
    return this.calls.leadByPhonePublic(phone || '', userId);
  }
  @Put('webrtc/config')
  saveWebrtc(@Body() dto: { extension?: string; sipPassword?: string }, @CurrentUser() user: AuthUser) {
    return this.calls.saveWebrtcConfig(user, dto);
  }
  @Put('my-extension')
  setExt(@Body() dto: ExtensionDto, @CurrentUser() user: AuthUser) {
    return this.calls.setMyExtension(user, dto.extension);
  }

  // ── OnlinePBX ulanish sozlamalari (faqat admin — crm.settings) ──
  @Get('pbx/config')
  @RequirePermissions('crm.settings')
  pbxConfig() {
    return this.calls.getConfig();
  }

  @Put('pbx/config')
  @RequirePermissions('crm.settings')
  savePbxConfig(@Body() dto: { provider?: 'onlinepbx' | 'own'; domain?: string; apiKey?: string; defaultExt?: string; webhookSecret?: string; callMode?: string; dialScheme?: string; popups?: boolean }) {
    return this.calls.saveConfig(dto);
  }

  @Post('pbx/test')
  @RequirePermissions('crm.settings')
  testPbx() {
    return this.calls.testConnection();
  }
}
