-- Avtoinformator: kampaniyalar va qabul qiluvchilar. Idempotent.
CREATE TABLE IF NOT EXISTS "pbx_informers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "audioId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "startAt" TIMESTAMP(3),
  "windowFrom" TEXT NOT NULL DEFAULT '09:00',
  "windowTo" TEXT NOT NULL DEFAULT '20:00',
  "maxParallel" INTEGER NOT NULL DEFAULT 2,
  "retries" INTEGER NOT NULL DEFAULT 1,
  "retryMin" INTEGER NOT NULL DEFAULT 30,
  "dailyLimit" INTEGER NOT NULL DEFAULT 1000,
  "dayKey" TEXT,
  "dayCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pbx_informers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pbx_informers_status_idx" ON "pbx_informers"("status");

CREATE TABLE IF NOT EXISTS "pbx_informer_targets" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAt" TIMESTAMP(3),
  "lastResult" TEXT,
  "uuid" TEXT,
  "callLogId" TEXT,
  CONSTRAINT "pbx_informer_targets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pbx_informer_targets_campaignId_phone_key" ON "pbx_informer_targets"("campaignId", "phone");
CREATE INDEX IF NOT EXISTS "pbx_informer_targets_campaignId_state_idx" ON "pbx_informer_targets"("campaignId", "state");
CREATE INDEX IF NOT EXISTS "pbx_informer_targets_uuid_idx" ON "pbx_informer_targets"("uuid");
DO $$ BEGIN
  ALTER TABLE "pbx_informer_targets" ADD CONSTRAINT "pbx_informer_targets_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "pbx_informers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
