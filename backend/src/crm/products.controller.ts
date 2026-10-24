import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';

import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ProductsService } from './products.service';

@Controller('crm/products')
@RequirePermissions('crm.view')
export class ProductsController {
  constructor(private readonly s: ProductsService) {}

  @Get() list() { return this.s.list(); }
  @Post() @RequirePermissions('crm.settings') create(@Body() dto: any) { return this.s.create(dto); }
  @Put(':id') @RequirePermissions('crm.settings') update(@Param('id') id: string, @Body() dto: any) { return this.s.update(id, dto); }
  @Delete(':id') @RequirePermissions('crm.settings') remove(@Param('id') id: string) { return this.s.remove(id); }
}
