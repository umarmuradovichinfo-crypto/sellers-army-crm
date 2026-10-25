import { clientIp } from '../common/guards/ip-whitelist.guard';
import { Body, Controller, Req, Get, Param, Patch, Post, Put } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import {
  ChangeOwnPasswordDto,
  CreateRoleDto,
  CreateUserDto,
  ResetPasswordDto,
  SetPermissionDto,
  UpdateUserDto,
} from './dto/settings.dto';
import { SettingsService } from './settings.service';

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
  setPermission(@Body() dto: SetPermissionDto) {
    return this.settings.setPermission(dto.roleKey, dto.permission, dto.allowed);
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
  createUser(@Body() dto: CreateUserDto) {
    return this.settings.createUser(dto);
  }

  @Patch('users/:id')
  @RequirePermissions('settings.roles.manage')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @CurrentUser('id') uid: string) {
    return this.settings.updateUser(id, dto, uid);
  }

  @Post('users/:id/password')
  @RequirePermissions('settings.roles.manage')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.settings.resetPassword(id, dto.password);
  }

  // O'z parolini o'zgartirish (ruxsat talab qilinmaydi — faqat login)
  @Post('me/password')
  changeOwnPassword(@CurrentUser('id') uid: string, @Body() dto: ChangeOwnPasswordDto) {
    return this.settings.changeOwnPassword(uid, dto.currentPassword, dto.password);
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
