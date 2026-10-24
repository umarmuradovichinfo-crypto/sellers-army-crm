-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "avatar" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "extension" TEXT,
    "sipPassword" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_pipelines" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_stages" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3F77DD',
    "kind" TEXT NOT NULL DEFAULT 'open',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "pipelineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "company" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "source" TEXT,
    "value" INTEGER NOT NULL DEFAULT 0,
    "pipelineId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'new',
    "queue" INTEGER NOT NULL DEFAULT 0,
    "assigneeId" TEXT,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "customJson" TEXT NOT NULL DEFAULT '{}',
    "itemsJson" TEXT NOT NULL DEFAULT '[]',
    "unsorted" BOOLEAN NOT NULL DEFAULT false,
    "formId" TEXT,
    "hot" BOOLEAN NOT NULL DEFAULT false,
    "nextTask" TEXT,
    "nextTaskDate" TIMESTAMP(3),
    "notesJson" TEXT NOT NULL DEFAULT '[]',
    "telegramChatId" TEXT,
    "lostReason" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_logs" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "userId" TEXT,
    "phone" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'out',
    "status" TEXT NOT NULL DEFAULT 'ringing',
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "recordUrl" TEXT,
    "externalId" TEXT,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_tasks" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'task',
    "dueDate" TIMESTAMP(3),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "result" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_fields" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL DEFAULT 'lead',
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "optionsJson" TEXT NOT NULL DEFAULT '[]',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "groupName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_automations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pipelineId" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'stage_enter',
    "stageKey" TEXT,
    "conditionsJson" TEXT NOT NULL DEFAULT '[]',
    "actionsJson" TEXT NOT NULL DEFAULT '[]',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_automations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "text" TEXT,
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_lost_reasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_lost_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3F77DD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'info',
    "text" TEXT NOT NULL,
    "link" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_saved_filters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "paramsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_saved_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "customJson" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contacts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "position" TEXT,
    "companyId" TEXT,
    "customJson" TEXT NOT NULL DEFAULT '{}',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fb_lead_forms" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "formName" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL DEFAULT '',
    "destination" TEXT NOT NULL DEFAULT 'crm',
    "pipelineId" TEXT,
    "stageKey" TEXT,
    "assigneeId" TEXT,
    "position" TEXT,
    "source" TEXT NOT NULL DEFAULT 'Facebook',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "fieldMapJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fb_lead_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fb_processed_leads" (
    "id" TEXT NOT NULL,
    "leadgenId" TEXT NOT NULL,
    "formId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fb_processed_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_forms" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fieldsJson" TEXT NOT NULL DEFAULT '[]',
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "pipelineId" TEXT,
    "stageKey" TEXT,
    "assigneeId" TEXT,
    "source" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "submissions" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_messages" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'telegram',
    "direction" TEXT NOT NULL DEFAULT 'in',
    "text" TEXT NOT NULL,
    "senderName" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_sales_goals" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'revenue',
    "target" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_sales_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "crm_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "price" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Role_key_key" ON "Role"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_roleId_idx" ON "User"("roleId");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_stages_key_key" ON "crm_stages"("key");

-- CreateIndex
CREATE INDEX "crm_stages_order_idx" ON "crm_stages"("order");

-- CreateIndex
CREATE INDEX "crm_stages_pipelineId_idx" ON "crm_stages"("pipelineId");

-- CreateIndex
CREATE INDEX "leads_stage_idx" ON "leads"("stage");

-- CreateIndex
CREATE INDEX "leads_pipelineId_idx" ON "leads"("pipelineId");

-- CreateIndex
CREATE INDEX "leads_assigneeId_idx" ON "leads"("assigneeId");

-- CreateIndex
CREATE INDEX "leads_companyId_idx" ON "leads"("companyId");

-- CreateIndex
CREATE INDEX "call_logs_leadId_idx" ON "call_logs"("leadId");

-- CreateIndex
CREATE INDEX "call_logs_direction_status_idx" ON "call_logs"("direction", "status");

-- CreateIndex
CREATE INDEX "call_logs_startedAt_idx" ON "call_logs"("startedAt");

-- CreateIndex
CREATE INDEX "lead_tasks_leadId_idx" ON "lead_tasks"("leadId");

-- CreateIndex
CREATE INDEX "lead_tasks_done_idx" ON "lead_tasks"("done");

-- CreateIndex
CREATE INDEX "lead_tasks_dueDate_idx" ON "lead_tasks"("dueDate");

-- CreateIndex
CREATE INDEX "crm_fields_entity_idx" ON "crm_fields"("entity");

-- CreateIndex
CREATE UNIQUE INDEX "crm_fields_entity_key_key" ON "crm_fields"("entity", "key");

-- CreateIndex
CREATE INDEX "crm_automations_trigger_idx" ON "crm_automations"("trigger");

-- CreateIndex
CREATE INDEX "crm_activities_leadId_idx" ON "crm_activities"("leadId");

-- CreateIndex
CREATE INDEX "crm_activities_createdAt_idx" ON "crm_activities"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "crm_tags_name_key" ON "crm_tags"("name");

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "crm_saved_filters_userId_idx" ON "crm_saved_filters"("userId");

-- CreateIndex
CREATE INDEX "crm_contacts_companyId_idx" ON "crm_contacts"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "fb_lead_forms_formId_key" ON "fb_lead_forms"("formId");

-- CreateIndex
CREATE UNIQUE INDEX "fb_processed_leads_leadgenId_key" ON "fb_processed_leads"("leadgenId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_forms_slug_key" ON "crm_forms"("slug");

-- CreateIndex
CREATE INDEX "crm_messages_leadId_idx" ON "crm_messages"("leadId");

-- CreateIndex
CREATE INDEX "crm_messages_createdAt_idx" ON "crm_messages"("createdAt");

-- CreateIndex
CREATE INDEX "crm_sales_goals_period_idx" ON "crm_sales_goals"("period");

-- CreateIndex
CREATE UNIQUE INDEX "crm_sales_goals_userId_period_metric_key" ON "crm_sales_goals"("userId", "period", "metric");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tasks" ADD CONSTRAINT "lead_tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Standart voronka bosqichlari (tizim bosqichlari)
INSERT INTO "crm_stages" ("id","key","name","color","kind","order","isSystem") VALUES
 ('cst_new','new','Yangi lid','#3F77DD','open',0,true),
 ('cst_contact','contact','Aloqa o''rnatildi','#D9952E','open',1,true),
 ('cst_offer','offer','Taklif yuborildi','#9b59b6','open',2,true),
 ('cst_payment','payment','To''lov kutilmoqda','#E6A33C','open',3,true),
 ('cst_won','won','Sotuv yopildi','#46B17B','won',4,true),
 ('cst_lost','lost','Yo''qotilgan','#8B8E84','lost',5,true)
ON CONFLICT DO NOTHING;
