import { Controller, Get, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationService } from './notification.service';

// Har qanday kirgan foydalanuvchi o'z bildirishnomalarini ko'radi (maxsus ruxsat shart emas)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly s: NotificationService) {}

  @Get() list(@CurrentUser('id') userId: string) { return this.s.list(userId); }
  @Post(':id/read') read(@Param('id') id: string, @CurrentUser('id') userId: string) { return this.s.markRead(userId, id); }
  @Post('read-all') readAll(@CurrentUser('id') userId: string) { return this.s.markAllRead(userId); }
}
