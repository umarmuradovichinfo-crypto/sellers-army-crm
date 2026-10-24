-- AlterTable
ALTER TABLE "crm_automations" ADD COLUMN     "delay" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastRunAt" TIMESTAMP(3),
ADD COLUMN     "scheduleJson" TEXT NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "crm_stages" ADD COLUMN     "hintsJson" TEXT NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "crm_automation_jobs" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "depth" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "crm_automation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_automation_jobs_status_runAt_idx" ON "crm_automation_jobs"("status", "runAt");

-- CreateIndex
CREATE INDEX "crm_automation_jobs_leadId_idx" ON "crm_automation_jobs"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "crm_automation_jobs_automationId_dedupeKey_key" ON "crm_automation_jobs"("automationId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "crm_automation_jobs" ADD CONSTRAINT "crm_automation_jobs_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "crm_automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
