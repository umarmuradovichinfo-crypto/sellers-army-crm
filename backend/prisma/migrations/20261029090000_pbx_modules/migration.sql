-- O'z telefon stansiyamiz (PLAN 45): modulli qo'ng'iroq oqimi va qora ro'yxat. Idempotent.
CREATE TABLE IF NOT EXISTS "pbx_modules" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "name" TEXT,
  "configJson" TEXT NOT NULL DEFAULT '{}',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pbx_modules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pbx_modules_number_key" ON "pbx_modules"("number");
CREATE INDEX IF NOT EXISTS "pbx_modules_type_idx" ON "pbx_modules"("type");

CREATE TABLE IF NOT EXISTS "pbx_blacklist" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pbx_blacklist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pbx_blacklist_number_key" ON "pbx_blacklist"("number");
