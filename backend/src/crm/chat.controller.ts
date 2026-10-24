import { BadRequestException, Body, Controller, Get, Query, Headers, Param, Post, Put } from '@nestjs/common';

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
  @Get('conversations') conversations(@Query() q: Record<string, string>, @CurrentUser('id') userId?: string) { return this.chat.listConversations(q, userId); }
  @Post('conversations/:leadId/:action') conversation(@Param('leadId') leadId: string, @Param('action') action: string, @CurrentUser() user: AuthUser) {
    if (!['close', 'reopen', 'fav'].includes(action)) throw new BadRequestException({ error: 'BAD_ACTION', message: 'Noto`g`ri amal' });
    return this.chat.setConversation(leadId, action as 'close' | 'reopen' | 'fav', user);
  }
  @Get('chat-settings') chatSettings() { return this.chat.getChatSettings(); }
  @Put('chat-settings') @RequirePermissions('settings.roles.manage') saveChatSettings(@Body() body: any) { return this.chat.saveChatSettings(body); }
  @Get('chat-stats') chatStats(@Query('from') from?: string, @Query('to') to?: string) { return this.chat.chatStats({ from, to }); }
  @Get('leads/:id/messages') messages(@Param('id') id: string, @CurrentUser('id') userId?: string) { return this.chat.listMessages(id, userId); }
  @Post('leads/:id/messages') send(@Param('id') id: string, @Body() body: { text: string }, @CurrentUser() user: AuthUser) { return this.chat.sendMessage(id, body?.text, user); }
  @Post('telegram-webhook-setup') @RequirePermissions('crm.settings') setup(@Body() body: { url: string }) { return this.chat.setupWebhook(body?.url); }
}
