-- Maydon qaysi bosqichlarda majburiy (amoCRM "Обязательно N")
ALTER TABLE "crm_fields" ADD COLUMN IF NOT EXISTS "requiredStagesJson" TEXT NOT NULL DEFAULT '[]';
