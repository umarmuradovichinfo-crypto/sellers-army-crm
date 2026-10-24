import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ContactsService } from './contacts.service';

@Controller('crm')
@RequirePermissions('crm.view')
export class ContactsController {
  constructor(private readonly s: ContactsService) {}

  // ── Kompaniyalar ──
  @Get('companies') companies(@Query() q: Record<string, string>, @CurrentUser('id') uid?: string) { return this.s.listCompanies(q, uid); }
  @Get('companies/:id') company(@Param('id') id: string) { return this.s.getCompany(id); }
  @Post('companies') createCompany(@Body() dto: any, @CurrentUser('id') userId: string) { return this.s.createCompany(dto, userId); }
  @Put('companies/:id') updateCompany(@Param('id') id: string, @Body() dto: any) { return this.s.updateCompany(id, dto); }
  @Delete('companies/:id') deleteCompany(@Param('id') id: string) { return this.s.deleteCompany(id); }

  // ── Kontaktlar ──
  @Get('contacts') contacts(@Query() q: Record<string, string>, @CurrentUser('id') uid?: string) { return this.s.listContacts(q, uid); }

  // ── Kontakt + kompaniya birlashgan ro'yxat (Ro'yxatlar sahifasi) ──
  @Get('entities') entities(@Query() q: Record<string, string>, @CurrentUser('id') uid?: string) { return this.s.listEntities(q, uid); }
  @Post('entities/bulk-delete') bulkDelete(@Body() dto: any, @CurrentUser('id') uid?: string) { return this.s.bulkDelete(dto || {}, uid); }
  @Get('contacts/:id') contact(@Param('id') id: string) { return this.s.getContact(id); }
  @Post('contacts') createContact(@Body() dto: any, @CurrentUser('id') userId: string) { return this.s.createContact(dto, userId); }
  @Put('contacts/:id') updateContact(@Param('id') id: string, @Body() dto: any) { return this.s.updateContact(id, dto); }
  @Delete('contacts/:id') deleteContact(@Param('id') id: string) { return this.s.deleteContact(id); }
}
