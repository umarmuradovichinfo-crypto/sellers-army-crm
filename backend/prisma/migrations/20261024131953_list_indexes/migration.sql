-- AlterTable
ALTER TABLE "crm_companies" ADD COLUMN     "phoneDigits" TEXT;

-- AlterTable
ALTER TABLE "crm_contacts" ADD COLUMN     "phoneDigits" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "emailNorm" TEXT,
ADD COLUMN     "phoneDigits" TEXT,
ADD COLUMN     "phoneTail" TEXT;

-- CreateIndex
CREATE INDEX "crm_companies_name_idx" ON "crm_companies"("name");

-- CreateIndex
CREATE INDEX "crm_companies_createdAt_idx" ON "crm_companies"("createdAt");

-- CreateIndex
CREATE INDEX "crm_contacts_name_idx" ON "crm_contacts"("name");

-- CreateIndex
CREATE INDEX "crm_contacts_createdAt_idx" ON "crm_contacts"("createdAt");

-- CreateIndex
CREATE INDEX "lead_tasks_leadId_done_dueDate_idx" ON "lead_tasks"("leadId", "done", "dueDate");

-- CreateIndex
CREATE INDEX "leads_contactId_idx" ON "leads"("contactId");

-- CreateIndex
CREATE INDEX "leads_phoneTail_idx" ON "leads"("phoneTail");

-- CreateIndex
CREATE INDEX "leads_emailNorm_idx" ON "leads"("emailNorm");

-- CreateIndex
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt");

-- CreateIndex
CREATE INDEX "leads_updatedAt_idx" ON "leads"("updatedAt");

-- CreateIndex
CREATE INDEX "leads_value_idx" ON "leads"("value");

-- CreateIndex
CREATE INDEX "leads_name_idx" ON "leads"("name");

-- CreateIndex
CREATE INDEX "leads_pipelineId_stage_queue_idx" ON "leads"("pipelineId", "stage", "queue");

-- ─────────────────────────────────────────────
-- Normallashtirilgan qidiruv ustunlari: trigger yozuvlarni avtomatik to'ldiradi
-- (barcha yozish yo'llari — Prisma, Facebook, formalar, import — uchun), mavjud yozuvlar backfill qilinadi.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm_digits(p TEXT) RETURNS TEXT AS $$
  SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g')
$$ LANGUAGE sql IMMUTABLE;

-- Kontakt/kompaniya: asosiy telefon + customJson.phones[] raqamlari, probel bilan ajratilgan
CREATE OR REPLACE FUNCTION crm_entity_phones(phone TEXT, custom TEXT) RETURNS TEXT AS $$
DECLARE
  res TEXT := crm_digits(phone);
  extra TEXT;
BEGIN
  BEGIN
    SELECT string_agg(crm_digits(e), ' ') INTO extra
      FROM jsonb_array_elements_text(custom::jsonb -> 'phones') AS e
     WHERE crm_digits(e) <> '';
  EXCEPTION WHEN OTHERS THEN
    extra := NULL;
  END;
  IF extra IS NOT NULL THEN res := trim(res || ' ' || extra); END IF;
  RETURN NULLIF(res, '');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION leads_norm_fn() RETURNS trigger AS $$
BEGIN
  NEW."phoneDigits" := NULLIF(crm_digits(NEW."phone"), '');
  NEW."phoneTail" := CASE WHEN length(crm_digits(NEW."phone")) >= 7 THEN right(crm_digits(NEW."phone"), 9) ELSE NULL END;
  NEW."emailNorm" := NULLIF(lower(btrim(coalesce(NEW."email", ''))), '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION crm_entity_norm_fn() RETURNS trigger AS $$
BEGIN
  NEW."phoneDigits" := crm_entity_phones(NEW."phone", NEW."customJson");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_norm_trg ON "leads";
CREATE TRIGGER leads_norm_trg BEFORE INSERT OR UPDATE OF "phone", "email" ON "leads"
  FOR EACH ROW EXECUTE FUNCTION leads_norm_fn();
DROP TRIGGER IF EXISTS crm_contacts_norm_trg ON "crm_contacts";
CREATE TRIGGER crm_contacts_norm_trg BEFORE INSERT OR UPDATE OF "phone", "customJson" ON "crm_contacts"
  FOR EACH ROW EXECUTE FUNCTION crm_entity_norm_fn();
DROP TRIGGER IF EXISTS crm_companies_norm_trg ON "crm_companies";
CREATE TRIGGER crm_companies_norm_trg BEFORE INSERT OR UPDATE OF "phone", "customJson" ON "crm_companies"
  FOR EACH ROW EXECUTE FUNCTION crm_entity_norm_fn();

-- Backfill (updatedAt tegilmaydi — faqat ustun UPDATE'i, trigger "phone"/"email" ustunlarini o'zgartirmaganda ishlamaydi, shuning uchun to'g'ridan-to'g'ri hisoblanadi)
UPDATE "leads" SET
  "phoneDigits" = NULLIF(crm_digits("phone"), ''),
  "phoneTail" = CASE WHEN length(crm_digits("phone")) >= 7 THEN right(crm_digits("phone"), 9) ELSE NULL END,
  "emailNorm" = NULLIF(lower(btrim(coalesce("email", ''))), '');
UPDATE "crm_contacts" SET "phoneDigits" = crm_entity_phones("phone", "customJson");
UPDATE "crm_companies" SET "phoneDigits" = crm_entity_phones("phone", "customJson");
