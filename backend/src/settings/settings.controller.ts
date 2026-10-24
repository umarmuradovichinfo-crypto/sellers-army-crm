import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import {
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

  // Umumiy sozlamalar (akkaunt nomi, mintaqa, formatlar)
  @Get('general')
  @RequirePermissions('settings.view')
  general() {
    return this.settings.getGeneral();
  }

  @Put('general')
  @RequirePermissions('settings.roles.manage')
  saveGeneral(@Body() body: Record<string, unknown>) {
    return this.settings.saveGeneral(body);
  }
}
