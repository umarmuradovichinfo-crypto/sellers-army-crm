import { Body, Controller, Get, Query, Headers, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ChatService } from './chat.service';

// Ommaviy — Telegram webhook (login'siz)
@Controller('telegram')
export class TelegramWebhookController {
  constructor(private readonly chat: ChatService) {}

  @Public()
  @Post('webhook')
  webhook(@Body() body: any, @Headers('x-telegram-bot-api-secret-token') secret?: string) {
    return this.chat.handleTelegramUpdate(body, secret);
  }
}

// CRM ichidagi suhbatlar
@Controller('crm')
@RequirePermissions('crm.view')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('chat-status') status() { return this.chat.enabled(); }
  @Get('conversations') conversations() { return this.chat.listConversations(); }
  @Get('chat-stats') chatStats(@Query('from') from?: string, @Query('to') to?: string) { return this.chat.chatStats({ from, to }); }
  @Get('leads/:id/messages') messages(@Param('id') id: string) { return this.chat.listMessages(id); }
  @Post('leads/:id/messages') send(@Param('id') id: string, @Body() body: { text: string }, @CurrentUser() user: AuthUser) { return this.chat.sendMessage(id, body?.text, user); }
  @Post('telegram-webhook-setup') @RequirePermissions('crm.settings') setup(@Body() body: { url: string }) { return this.chat.setupWebhook(body?.url); }
}
