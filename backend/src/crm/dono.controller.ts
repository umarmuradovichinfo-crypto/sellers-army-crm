import { Body, Controller, Get, Post } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { DonoService } from './dono.service';

// amoCRM «Доно» — mahsulot ichidagi AI yordamchi
@Controller('crm/dono')
@RequirePermissions('crm.view')
export class DonoController {
  constructor(private readonly s: DonoService) {}

  @Get() info() { return this.s.info(); }
  @Post('chat') chat(@Body() dto: any, @CurrentUser() user: AuthUser) { return this.s.chat(dto, user); }
}
