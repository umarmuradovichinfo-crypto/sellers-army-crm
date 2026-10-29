import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PbxAiService } from './ai.service';

// «ИИ-менеджер»: sozlama — faqat telefoniya sozlamasi huquqi bilan; qo'ng'iroqlar ro'yxati/tafsiloti/qayta ishga tushirish — huquqlar matritsasi bo'yicha
@Controller('pbx/ai')
@RequirePermissions('crm.view')
export class PbxAiController {
  constructor(private readonly ai: PbxAiService) {}

  @Get() @RequirePermissions('crm.settings') info() { return this.ai.info(); }
  @Put() @RequirePermissions('crm.settings') save(@Body() dto: any) { return this.ai.saveSettings(dto && typeof dto === 'object' ? dto : {}); }
  /** Navbatni hozir qayta ishlash (fon siklini kutmasdan). */
  @Post('tick') @RequirePermissions('crm.settings') tick() { return this.ai.tick({ drain: true }); }
  /** Saqlash muddatini darhol qo'llash. */
  @Post('cleanup') @RequirePermissions('crm.settings') cleanup() { return this.ai.cleanup(); }

  @Get('calls') list(@Query() q: Record<string, string>, @CurrentUser('id') userId: string) { return this.ai.list(q || {}, userId); }
  @Get('calls/:callLogId') get(@Param('callLogId') id: string, @CurrentUser() user: AuthUser) { return this.ai.get(id, user); }
  @Post('calls/:callLogId/run') run(@Param('callLogId') id: string, @Body() dto: any, @CurrentUser() user: AuthUser) { return this.ai.run(id, user, { restt: dto?.restt === true }); }
}
