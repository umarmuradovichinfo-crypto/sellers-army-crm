import { IcalController } from './ical.controller';
import { WebhooksController } from './webhooks.controller';
import { Module } from '@nestjs/common';

import { ActivityService } from './activity.service';
import { CrmAnalyticsController } from './analytics.controller';
import { DashboardController } from './dashboard.controller';
import { DonoController } from './dono.controller';
import { DonoService } from './dono.service';
import { SalesbotController } from './salesbot.controller';
import { SalesbotService } from './salesbot.service';
import { CrmAnalyticsService } from './analytics.service';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { ChatController, TelegramWebhookController, ShortLinkController } from './chat.controller';
import { ChatService } from './chat.service';
import { TelegramClient } from './telegram.client';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { CrmController } from './crm.controller';
import { CrmImportController } from './crm-import.controller';
import { CrmImportService } from './crm-import.service';
import { CrmService } from './crm.service';
import { CrmFormsController, PublicCrmFormsController } from './crm-forms.controller';
import { CrmFormsService } from './crm-forms.service';
import { CrmSettingsController } from './crm-settings.controller';
import { CrmSettingsService } from './crm-settings.service';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { PipelineSettingsService } from './pipeline-settings.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ReminderService } from './reminder.service';

@Module({
  controllers: [IcalController, WebhooksController, 
    CrmController,
    CrmSettingsController,
    CrmImportController,
    AutomationController,
    CrmAnalyticsController,
    DashboardController,
    SalesbotController,
    DonoController,
    ContactsController,
    NotificationController,
    CrmFormsController,
    PublicCrmFormsController,
    ProductsController,
    GoalsController,
    ChatController,
    TelegramWebhookController,
    ShortLinkController,
  ],
  providers: [
    CrmService,
    ActivityService,
    AutomationService,
    SalesbotService,
    DonoService,
    PipelineSettingsService,
    NotificationService,
    CrmSettingsService,
    CrmImportService,
    CrmAnalyticsService,
    ContactsService,
    CrmFormsService,
    ProductsService,
    GoalsService,
    ReminderService,
    ChatService,
    TelegramClient,
  ],
  exports: [ChatService, NotificationService, ActivityService, CrmFormsService, AutomationService, PipelineSettingsService],
})
export class CrmModule {}
