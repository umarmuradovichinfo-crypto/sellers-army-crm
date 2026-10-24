import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common';

import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { ActivityService } from './activity.service';

/** Market → "WEB HOOKS": akkaunt hodisalari uchun tashqi URL'lar. */
@Controller('crm/webhooks')
@RequirePermissions('settings.roles.manage')
export class WebhooksController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list() {
    return this.activity.getWebhooks();
  }

  @Put()
  async save(@Body() body: { webhooks?: unknown }) {
    try {
      return await this.activity.saveWebhooks(body);
    } catch (e) {
      throw new BadRequestException({ error: 'BAD_WEBHOOK', message: (e as Error).message });
    }
  }
}
