import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CallbackService } from './callback.service';
import { PbxService } from './pbx.service';

// «Настройка АТС» (o'z stansiyamiz): faqat telefoniya sozlamasi huquqi bilan
@Controller('pbx')
@RequirePermissions('crm.settings')
export class PbxController {
  constructor(private readonly s: PbxService, private readonly cb: CallbackService) {}

  @Get('modules') list(@Query('type') type?: string) { return this.s.list(type); }
  @Get('modules/next-number') next(@Query('type') type: string) { return this.s.nextNumber(type); }
  @Get('modules/:id') get(@Param('id') id: string) { return this.s.get(id); }
  @Post('modules') create(@Body() dto: any) { return this.s.create(dto); }
  @Put('modules/:id') update(@Param('id') id: string, @Body() dto: any) { return this.s.update(id, dto); }
  @Delete('modules/:id') remove(@Param('id') id: string) { return this.s.remove(id); }
  @Get('flow/validate') validate() { return this.s.validateFlow(); }

  @Get('asterisk/preview') asterisk() { return this.s.asteriskPreview(); }

  @Get('callback') callbackCfg() { return this.cb.config(); }
  @Put('callback') callbackSave(@Body() dto: any) { return this.cb.save(dto); }

  @Get('blacklist') blacklist() { return this.s.blacklist(); }
  @Post('blacklist') blacklistAdd(@Body() dto: any) { return this.s.blacklistAdd(dto); }
  @Delete('blacklist/:id') blacklistRemove(@Param('id') id: string) { return this.s.blacklistRemove(id); }

  @Get('music') music() { return this.s.music(); }
  @Put('music') saveMusic(@Body() dto: any) { return this.s.saveMusic(dto); }
  @Get('outgoing') outgoing() { return this.s.outgoing(); }
  @Put('outgoing') saveOutgoing(@Body() dto: any) { return this.s.saveOutgoing(dto); }
}
