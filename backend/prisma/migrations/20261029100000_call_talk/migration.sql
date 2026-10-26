-- Qo'ng'iroqlar jurnali: suhbat davomiyligi, uzilish sababi, mijoz bahosi (OnlinePBX «Звонки» sahifasi uchun). Idempotent.
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "talkSec" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "hangup" TEXT;
ALTER TABLE "call_logs" ADD COLUMN IF NOT EXISTS "rating" INTEGER;
CREATE INDEX IF NOT EXISTS "call_logs_phone_idx" ON "call_logs"("phone");
