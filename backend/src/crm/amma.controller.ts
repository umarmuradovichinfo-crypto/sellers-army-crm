import { Body, Controller, Get, Post } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { AmmaService } from './amma.service';

// amoCRM «Амма» — mahsulot ichidagi AI yordamchi
@Controller('crm/amma')
@RequirePermissions('crm.view')
export class AmmaController {
  constructor(private readonly s: AmmaService) {}

  @Get() info() { return this.s.info(); }
  @Post('chat') chat(@Body() dto: any, @CurrentUser() user: AuthUser) { return this.s.chat(dto, user); }
}
