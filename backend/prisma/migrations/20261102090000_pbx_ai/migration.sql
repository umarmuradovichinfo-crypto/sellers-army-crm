-- «ИИ-менеджер»: qo'ng'iroq yozuvi → matn (STT) → Claude tahlili. Bitta qo'ng'iroqqa bitta qator. Idempotent.
CREATE TABLE IF NOT EXISTS "call_ai" (
  "id" TEXT NOT NULL,
  "callLogId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "reason" TEXT,
  "transcript" TEXT,
  "analysisJson" TEXT,
  "lang" TEXT,
  "sttProvider" TEXT,
  "audioSec" INTEGER,
  "costTokensIn" INTEGER NOT NULL DEFAULT 0,
  "costTokensOut" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAt" TIMESTAMP(3),
  "error" TEXT,
  "noteAt" TIMESTAMP(3),
  "taskId" TEXT,
  "purgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "call_ai_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "call_ai_callLogId_key" ON "call_ai"("callLogId");
CREATE INDEX IF NOT EXISTS "call_ai_status_idx" ON "call_ai"("status");
CREATE INDEX IF NOT EXISTS "call_ai_createdAt_idx" ON "call_ai"("createdAt");
DO $$ BEGIN
  ALTER TABLE "call_ai" ADD CONSTRAINT "call_ai_callLogId_fkey" FOREIGN KEY ("callLogId") REFERENCES "call_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
