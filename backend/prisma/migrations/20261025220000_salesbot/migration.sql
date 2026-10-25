CREATE TABLE "crm_salesbots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stepsJson" TEXT NOT NULL DEFAULT '[]',
    "startId" TEXT,
    "triggersJson" TEXT NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_salesbots_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "crm_salesbot_runs" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "stepId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'running',
    "varsJson" TEXT NOT NULL DEFAULT '{}',
    "resumeAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_salesbot_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "crm_salesbot_runs_leadId_state_idx" ON "crm_salesbot_runs"("leadId", "state");
CREATE INDEX "crm_salesbot_runs_botId_idx" ON "crm_salesbot_runs"("botId");
CREATE INDEX "crm_salesbot_runs_state_resumeAt_idx" ON "crm_salesbot_runs"("state", "resumeAt");
