import { Module } from '@nestjs/common';

import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { OnlinePbxClient } from './onlinepbx.client';
import { OnlinePbxConfigService } from './onlinepbx-config.service';
import { WebhookController } from './webhook.controller';

@Module({
  controllers: [CallsController, WebhookController],
  providers: [CallsService, OnlinePbxClient, OnlinePbxConfigService],
})
export class OnlinePbxModule {}
