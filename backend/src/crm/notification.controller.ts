import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationService } from './notification.service';

// Har qanday kirgan foydalanuvchi o'z bildirishnomalarini ko'radi (maxsus ruxsat shart emas)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly s: NotificationService) {}

  @Get() list(@CurrentUser('id') userId: string) { return this.s.list(userId); }
  // amoCRM «Настройки уведомлений» (profil)
  @Get('telegram') tgStatus(@CurrentUser('id') userId: string) { return this.s.tgStatus(userId); }
  @Delete('telegram') tgUnlink(@CurrentUser('id') userId: string) { return this.s.tgUnlink(userId); }
  @Get('prefs') prefs(@CurrentUser('id') userId: string) { return this.s.prefs(userId).then((prefs) => ({ prefs })); }
  @Put('prefs') savePrefs(@CurrentUser('id') userId: string, @Body() body: any) { return this.s.savePrefs(userId, body?.prefs || body); }
  @Post(':id/read') read(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.s.markRead(userId, id); }
  @Post('read-all') readAll(@CurrentUser('id') userId: string) { return this.s.markAllRead(userId); }
}
