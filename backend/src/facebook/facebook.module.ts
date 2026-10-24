import { Module } from '@nestjs/common';

import { CrmModule } from '../crm/crm.module';
import { FacebookClient } from './facebook.client';
import { FacebookConnectorService } from './facebook-connector.service';
import { FacebookConfigService } from './facebook-config.service';
import { FacebookController, FacebookWebhookController } from './facebook.controller';
import { FacebookService } from './facebook.service';

// Facebook Lead Ads — CrmFormsService (lid) ni qayta ishlatadi.
@Module({
  imports: [CrmModule],
  controllers: [FacebookController, FacebookWebhookController],
  providers: [FacebookService, FacebookConfigService, FacebookConnectorService, FacebookClient],
})
export class FacebookModule {}
