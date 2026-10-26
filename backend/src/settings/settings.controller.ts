import { clientIp } from '../common/guards/ip-whitelist.guard';
import { Body, Controller, ForbiddenException, Query, Req, Res, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import {
  ChangeOwnPasswordDto,
  CreateRoleDto,
  CreateUserDto,
  ResetPasswordDto,
  SaveProfileDto,
  SetPermissionDto,
  UpdateUserDto,
} from './dto/settings.dto';
import { SettingsService } from './settings.service';
import { RequireFeature } from '../billing/require-feature.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Rollar + ruxsatlar matritsasi
  @Get('access')
  @RequirePermissions('settings.view')
  access() {
    return this.settings.getAccess();
  }

  @Patch('access')
  @RequirePermissions('settings.roles.manage')
  setPermission(@Body() dto: SetPermissionDto, @CurrentUser() me: AuthUser) {
    // «Rollarni boshqarish» huquqini faqat super_admin beradi/oladi (aks holda delegat admin o'zini kengaytirib oladi)
    if (dto.permission === 'settings.roles.manage' && me.role !== 'super_admin') throw new ForbiddenException({ error: 'FORBIDDEN', message: "Bu ruxsatni faqat super admin o'zgartiradi" });
    return this.settings.setPermission(dto.roleKey, dto.permission, dto.allowed);
  }

  // amoCRM «Права доступа» matritsasi (huquq profili bo'yicha)
  @Put('roles/:key/rights')
  @RequirePermissions('settings.roles.manage')
  setRights(@Param('key') key: string, @Body() body: { rights?: unknown }) {
    return this.settings.setRights(key, body?.rights);
  }

  @Post('roles')
  @RequirePermissions('settings.roles.manage')
  createRole(@Body() dto: CreateRoleDto) {
    return this.settings.createRole(dto.name);
  }

  // ── Foydalanuvchilar (login/parol berish) ──
  @Get('users')
  @RequirePermissions('settings.roles.manage')
  users() {
    return this.settings.listUsers();
  }

  @Post('users')
  @RequirePermissions('settings.roles.manage')
  createUser(@Body() dto: CreateUserDto, @CurrentUser() me: AuthUser) {
    if (dto.roleKey === 'super_admin' && me.role !== 'super_admin') throw new ForbiddenException({ error: 'FORBIDDEN', message: "Super admin'ni faqat super admin yarata oladi" });
    return this.settings.createUser(dto);
  }

  @Patch('users/:id')
  @RequirePermissions('settings.roles.manage')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser() me: AuthUser) {
    return this.settings.updateUser(id, dto, me.id, me.role);
  }

  // amoCRM «Настройка групп»
  @Get('groups')
  groups() {
    return this.settings.listGroups();
  }
  @Post('groups')
  @RequirePermissions('settings.roles.manage')
  createGroup(@Body() b: { name?: string }) {
    return this.settings.createGroup(b?.name);
  }
  @Patch('groups/:id')
  @RequirePermissions('settings.roles.manage')
  renameGroup(@Param('id') id: string, @Body() b: { name?: string }) {
    return this.settings.renameGroup(id, b?.name);
  }
  @Delete('groups/:id')
  @RequirePermissions('settings.roles.manage')
  deleteGroup(@Param('id') id: string, @Query('moveTo') moveTo?: string) {
    return this.settings.deleteGroup(id, moveTo);
  }

  @Post('users/:id/password')
  @RequirePermissions('settings.roles.manage')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto, @CurrentUser() me: AuthUser) {
    return this.settings.resetPassword(id, dto.password, id === me.id ? me.sid : undefined, me.role);
  }

  // O'z parolini o'zgartirish (ruxsat talab qilinmaydi — faqat login)
  @Post('me/password')
  changeOwnPassword(@CurrentUser() me: AuthUser, @Body() dto: ChangeOwnPasswordDto) {
    return this.settings.changeOwnPassword(me.id, dto.currentPassword, dto.password, me.sid);
  }

  // amoCRM «Настройки профиля» (har qanday foydalanuvchi — faqat o'zini)
  @Get('me/profile')
  profile(@CurrentUser() me: AuthUser) {
    return this.settings.getProfile(me.id, me.sid);
  }

  @Put('me/profile')
  async saveProfile(@CurrentUser() me: AuthUser, @Body() dto: SaveProfileDto) {
    await this.settings.saveProfile(me.id, dto);
    return this.settings.getProfile(me.id, me.sid);
  }

  @Delete('me/sessions/:id')
  closeSession(@CurrentUser('id') uid: string, @Param('id') id: string) {
    return this.settings.closeSession(uid, id);
  }

  // Xavfsizlik: IP oq ro'yxati
  @Get('security')
  @RequirePermissions('settings.roles.manage')
  security(@Req() req: any) {
    return this.settings.getSecurity(clientIp(req));
  }
  @Put('security')
  @RequirePermissions('settings.roles.manage')
  saveSecurity(@Body() body: { ips?: unknown }, @Req() req: any) {
    return this.settings.saveSecurity(body, clientIp(req));
  }

  // amoCRM «Резервное копирование»: butun akkaunt JSON fayl bo'lib yuklanadi (oqim — xotirani to'ldirmaydi)
  @Get('backup')
  @RequireFeature('backup', { all: true })
  @RequirePermissions('settings.roles.manage')
  async backup(@Res() res: Response) {
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="crm-backup-${day}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    let aborted = false;
    res.once('close', () => { aborted = true; }); // mijoz uzilsa 'drain' hech qachon kelmaydi — osilib qolmasin
    try {
      for await (const chunk of this.settings.backupChunks()) {
        if (aborted) return;
        if (!res.write(chunk)) await new Promise<void>((r) => { res.once('drain', () => r()); res.once('close', () => r()); });
      }
      res.end();
    } catch (e) {
      res.destroy(e as Error); // yarim fayl «muvaffaqiyatli» deb berilmasin
    }
  }

  // Umumiy sozlamalar (akkaunt nomi, mintaqa, formatlar, rolga qarab chap menyu) — interfeys har bir foydalanuvchi uchun
  // yuklaydi (sotuvchida settings.view yo'q, aks holda unga «menyuni rolga qarab sozlash» qo'llanmas edi). Faqat o'qish.
  @Get('general')
  general() {
    return this.settings.getGeneral();
  }

  @Put('general')
  @RequirePermissions('settings.roles.manage')
  saveGeneral(@Body() body: Record<string, unknown>) {
    return this.settings.saveGeneral(body);
  }
}
