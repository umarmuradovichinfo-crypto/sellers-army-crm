import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CrmImportService } from './crm-import.service';

@Controller('crm')
@RequirePermissions('crm.view')
export class CrmImportController {
  constructor(private readonly s: CrmImportService) {}

  // amoCRM «Импорт из Google таблиц»: "havola orqali ko'rish" ochiq jadval CSV ko'rinishida olinadi
  @Post('import-sheet')
  sheet(@Body() body: { url?: string }) {
    return this.s.fetchSheet(String(body?.url || ''));
  }
  // «Посмотреть импортированные файлы»
  @Get('import-history')
  history() {
    return this.s.history();
  }
  @Post('import-history')
  addHistory(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.s.addHistory(body || {}, user);
  }

  // entity = leads | contacts; body: { rows: [{_row, name, phone, ...}], options: {...} }
  @Post('import/:entity')
  run(@Param('entity') entity: string, @Body() body: { rows?: any[]; options?: any }, @CurrentUser() user: AuthUser) {
    return this.s.run(entity, body?.rows || [], body?.options || {}, user);
  }
}
