import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RightsService } from '../common/rights/rights.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ContactsService } from './contacts.service';

@Controller('crm')
@RequirePermissions('crm.view')
export class ContactsController {
  constructor(private readonly s: ContactsService, private readonly r: RightsService) {}

  // ── Kompaniyalar ──
  @Get('companies') companies(@Query() q: Record<string, string>, @CurrentUser('id') uid?: string) { return this.s.listCompanies(q, uid); }
  @Get('companies/:id') async company(@Param('id') id: string, @CurrentUser() u: AuthUser) { await this.r.assertEntity(u, 'companies', id, 'view'); return this.s.getCompany(id, u.id); }
  @Post('companies') async createCompany(@Body() dto: any, @CurrentUser() u: AuthUser) { await this.r.assertAdd(u, 'companies'); return this.s.createCompany(dto, u.id); }
  @Put('companies/:id') async updateCompany(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: AuthUser) { await this.r.assertEntity(u, 'companies', id, 'edit'); return this.s.updateCompany(id, dto); }
  @Delete('companies/:id') async deleteCompany(@Param('id') id: string, @CurrentUser() u: AuthUser) { await this.r.assertEntity(u, 'companies', id, 'delete'); return this.s.deleteCompany(id); }

  // ── Kontaktlar ──
  @Get('contacts') contacts(@Query() q: Record<string, string>, @CurrentUser('id') uid?: string) { return this.s.listContacts(q, uid); }

  // ── Kontakt + kompaniya birlashgan ro'yxat (Ro'yxatlar sahifasi) ──
  @Get('entities') entities(@Query() q: Record<string, string>, @CurrentUser('id') uid?: string) { return this.s.listEntities(q, uid); }
  @Post('entities/bulk-delete') bulkDelete(@Body() dto: any, @CurrentUser('id') uid?: string) { return this.s.bulkDelete(dto || {}, uid); }
  @Get('contacts/:id') async contact(@Param('id') id: string, @CurrentUser() u: AuthUser) { await this.r.assertEntity(u, 'contacts', id, 'view'); return this.s.getContact(id); }
  @Post('contacts') async createContact(@Body() dto: any, @CurrentUser() u: AuthUser) { await this.r.assertAdd(u, 'contacts'); return this.s.createContact(dto, u.id); }
  @Put('contacts/:id') async updateContact(@Param('id') id: string, @Body() dto: any, @CurrentUser() u: AuthUser) { await this.r.assertEntity(u, 'contacts', id, 'edit'); return this.s.updateContact(id, dto); }
  @Delete('contacts/:id') async deleteContact(@Param('id') id: string, @CurrentUser() u: AuthUser) { await this.r.assertEntity(u, 'contacts', id, 'delete'); return this.s.deleteContact(id); }
}
