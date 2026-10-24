-- Instagram / Facebook Messenger suhbatlari: kanal suhbat id, sahifa va xabar turi
ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "threadId" TEXT;
ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "pageId" TEXT;
ALTER TABLE "crm_messages" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'message';
CREATE INDEX IF NOT EXISTS "crm_messages_channel_threadId_idx" ON "crm_messages"("channel", "threadId");
