import { Module } from '@nestjs/common';

import { ActivityService } from './activity.service';
import { CrmAnalyticsController } from './analytics.controller';
import { CrmAnalyticsService } from './analytics.service';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { ChatController, TelegramWebhookController } from './chat.controller';
import { ChatService } from './chat.service';
import { TelegramClient } from './telegram.client';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmFormsController, PublicCrmFormsController } from './crm-forms.controller';
import { CrmFormsService } from './crm-forms.service';
import { CrmSettingsController } from './crm-settings.controller';
import { CrmSettingsService } from './crm-settings.service';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ReminderService } from './reminder.service';

@Module({
  controllers: [
    CrmController,
    CrmSettingsController,
    AutomationController,
    CrmAnalyticsController,
    ContactsController,
    NotificationController,
    CrmFormsController,
    PublicCrmFormsController,
    ProductsController,
    GoalsController,
    ChatController,
    TelegramWebhookController,
  ],
  providers: [
    CrmService,
    ActivityService,
    AutomationService,
    NotificationService,
    CrmSettingsService,
    CrmAnalyticsService,
    ContactsService,
    CrmFormsService,
    ProductsService,
    GoalsService,
    ReminderService,
    ChatService,
    TelegramClient,
  ],
  exports: [NotificationService, ActivityService, CrmFormsService],
})
export class CrmModule {}
