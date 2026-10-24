-- O'chirilgan vazifalar arxivi ("Удаленные")
CREATE TABLE IF NOT EXISTS "crm_deleted_tasks" (
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
  "createdAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedById" TEXT,
  CONSTRAINT "crm_deleted_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "crm_deleted_tasks_deletedAt_idx" ON "crm_deleted_tasks"("deletedAt");
