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
  @Get('prefs') async prefs(@CurrentUser('id') userId: string) { return { prefs: await this.s.prefs(userId), digest: await this.s.digestOn(userId) }; }
  @Put('prefs') savePrefs(@CurrentUser('id') userId: string, @Body() body: any) { return this.s.savePrefs(userId, body?.prefs || {}, typeof body?.digest === 'boolean' ? body.digest : undefined); }
  @Post('digest-run') digestRun(@CurrentUser('id') userId: string) { return this.s.sendDigest(userId).then((sent) => ({ sent })); }
  @Post(':id/read') read(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.s.markRead(userId, id); }
  @Post('read-all') readAll(@CurrentUser('id') userId: string) { return this.s.markAllRead(userId); }
}
