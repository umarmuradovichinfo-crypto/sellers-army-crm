import { Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from '@nestjs/common';
import type { Response } from 'express';

import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AutoRecallService } from './autorecall.service';
import { CallbackService } from './callback.service';
import { PbxService } from './pbx.service';
import { RecordingRetentionService } from './recording-retention.service';

// «Настройка АТС» (o'z stansiyamiz): faqat telefoniya sozlamasi huquqi bilan
@Controller('pbx')
@RequirePermissions('crm.settings')
export class PbxController {
  constructor(private readonly s: PbxService, private readonly cb: CallbackService, private readonly recall: AutoRecallService, private readonly retention: RecordingRetentionService) {}

  @Get('modules') list(@Query('type') type?: string) { return this.s.list(type); }
  @Get('modules/next-number') next(@Query('type') type: string) { return this.s.nextNumber(type); }
  @Get('modules/:id') get(@Param('id') id: string) { return this.s.get(id); }
  @Post('modules') create(@Body() dto: any) { return this.s.create(dto); }
  @Put('modules/:id') update(@Param('id') id: string, @Body() dto: any) { return this.s.update(id, dto); }
  @Delete('modules/:id') remove(@Param('id') id: string) { return this.s.remove(id); }
  @Get('flow/validate') validate() { return this.s.validateFlow(); }

  @Get('asterisk/preview') asterisk() { return this.s.asteriskPreview(); }

  @Post('asterisk/apply') asteriskApply() { return this.s.applyAsterisk(); }
  @Post('configurator') deviceConfig(@Body() dto: any) { return this.s.deviceConfig(dto); }

  @Get('audio') audioList() { return this.s.audioList(); }
  @Post('audio') audioAdd(@Body() dto: any) { return this.s.audioAdd(dto); }
  @Get('audio/:id/file')
  async audioFile(@Param('id') id: string, @Res() res: Response) {
    const f = await this.s.audioFile(id);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Length', String(f.buffer.length));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.end(f.buffer);
  }
  @Delete('audio/:id') audioRemove(@Param('id') id: string) { return this.s.audioRemove(id); }

  @Get('autorecall') autorecall() { return this.recall.config(); }
  @Put('autorecall') autorecallSave(@Body() dto: any) { return this.recall.save(dto); }

  @Get('callback') callbackCfg() { return this.cb.config(); }
  @Put('callback') callbackSave(@Body() dto: any) { return this.cb.save(dto); }

  @Get('blacklist') blacklist() { return this.s.blacklist(); }
  @Post('blacklist') blacklistAdd(@Body() dto: any) { return this.s.blacklistAdd(dto); }
  @Delete('blacklist/:id') blacklistRemove(@Param('id') id: string) { return this.s.blacklistRemove(id); }

  @Get('music') music() { return this.s.music(); }
  @Put('music') saveMusic(@Body() dto: any) { return this.s.saveMusic(dto); }
  @Get('outgoing') outgoing() { return this.s.outgoing(); }
  @Get('recording') recording() { return this.s.recording(); }
  @Put('recording') saveRecording(@Body() dto: any) { return this.s.saveRecording(dto); }
  /** Saqlash muddatini darhol qo'llash (kunlik fon vazifasini kutmasdan). */
  @Post('recording/cleanup') recordingCleanup() { return this.retention.cleanup(); }
  @Put('outgoing') saveOutgoing(@Body() dto: any) { return this.s.saveOutgoing(dto); }
}
