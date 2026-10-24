import { Body, Controller, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CrmImportService } from './crm-import.service';

@Controller('crm')
@RequirePermissions('crm.view')
export class CrmImportController {
  constructor(private readonly s: CrmImportService) {}

  // entity = leads | contacts; body: { rows: [{_row, name, phone, ...}], options: {...} }
  @Post('import/:entity')
  run(@Param('entity') entity: string, @Body() body: { rows?: any[]; options?: any }, @CurrentUser() user: AuthUser) {
    return this.s.run(entity, body?.rows || [], body?.options || {}, user);
  }
}
