import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RightsService } from '../common/rights/rights.service';
import { ProductsService } from './products.service';

// amoCRM «Права доступа» → «Товары»: Запрещено / Внутри сделки / Разрешено (katalog sozlamasi — crm.settings ham kerak)
@Controller('crm/products')
@RequirePermissions('crm.view')
export class ProductsController {
  constructor(private readonly s: ProductsService, private readonly r: RightsService) {}

  private async need(u: AuthUser, action: 'view' | 'add' | 'edit' | 'delete') {
    if ((await this.r.level(u, 'products', action)) === 'D') throw new ForbiddenException({ error: 'FORBIDDEN', message: "Mahsulotlar uchun huquqingiz yo'q" });
  }

  @Get() async list(@CurrentUser() u: AuthUser) { await this.need(u, 'view'); return this.s.list(); }
  @Post() @RequirePermissions('crm.settings') async create(@Body() dto: any, @CurrentUser() u: AuthUser) { await this.need(u, 'add'); return this.s.create(dto); }
  @Put(':id') @RequirePermissions('crm.settings') async update(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: AuthUser) { await this.need(u, 'edit'); return this.s.update(id, dto); }
  @Delete(':id') @RequirePermissions('crm.settings') async remove(@Param('id') id: string, @CurrentUser() u: AuthUser) { await this.need(u, 'delete'); return this.s.remove(id); }
}
