import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { CallsController } from './calls.controller';
import { CallsService } from './calls.service';
import { OnlinePbxClient } from './onlinepbx.client';
import { OnlinePbxConfigService } from './onlinepbx-config.service';
import { OwnPbxProvider } from './own-pbx.provider';
import { PbxGateway } from './pbx.gateway';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [CrmModule],
  controllers: [CallsController, WebhookController],
  providers: [CallsService, OnlinePbxClient, OnlinePbxConfigService, OwnPbxProvider, PbxGateway],
  exports: [PbxGateway, OwnPbxProvider],
})
export class OnlinePbxModule {}
