import { Body, Controller, Post, Query } from '@nestjs/common';

import { Public } from '../common/decorators/public.decorator';
import { CallsService } from './calls.service';

// Ommaviy (login'siz) — OnlinePBX qo'ng'iroq hodisalarini qabul qiladi.
// OnlinePBX panelida webhook URL: https://<domen>/api/v1/onlinepbx/webhook
// (Sozlamada secret bo'lsa: .../webhook?secret=<secret>)
@Controller('onlinepbx')
export class WebhookController {
  constructor(private readonly calls: CallsService) {}

  @Public()
  @Post('webhook')
  webhook(@Body() body: any, @Query('secret') secret?: string) {
    return this.calls.handleWebhook(body, secret);
  }
}
