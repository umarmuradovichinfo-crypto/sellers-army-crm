-- AlterTable
ALTER TABLE "crm_companies" ADD COLUMN     "assigneeKey" TEXT;

-- AlterTable
ALTER TABLE "crm_contacts" ADD COLUMN     "assigneeKey" TEXT;

-- CreateIndex
CREATE INDEX "crm_companies_assigneeKey_idx" ON "crm_companies"("assigneeKey");

-- CreateIndex
CREATE INDEX "crm_contacts_assigneeKey_idx" ON "crm_contacts"("assigneeKey");

-- Mas'ul kaliti: customJson._assigneeId, bo'lmasa createdById. Trigger saqlaydi (regex bilan har so'rovda hisoblash sekin edi).
CREATE OR REPLACE FUNCTION crm_entity_assignee(custom TEXT, created_by TEXT) RETURNS TEXT AS $$
DECLARE
  a TEXT;
BEGIN
  BEGIN
    a := custom::jsonb ->> '_assigneeId';
  EXCEPTION WHEN OTHERS THEN
    a := NULL;
  END;
  RETURN coalesce(nullif(a, ''), created_by);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION crm_entity_norm_fn() RETURNS trigger AS $$
BEGIN
  NEW."phoneDigits" := crm_entity_phones(NEW."phone", NEW."customJson");
  NEW."assigneeKey" := crm_entity_assignee(NEW."customJson", NEW."createdById");
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS crm_contacts_norm_trg ON "crm_contacts";
CREATE TRIGGER crm_contacts_norm_trg BEFORE INSERT OR UPDATE OF "phone", "customJson", "createdById" ON "crm_contacts"
  FOR EACH ROW EXECUTE FUNCTION crm_entity_norm_fn();
DROP TRIGGER IF EXISTS crm_companies_norm_trg ON "crm_companies";
CREATE TRIGGER crm_companies_norm_trg BEFORE INSERT OR UPDATE OF "phone", "customJson", "createdById" ON "crm_companies"
  FOR EACH ROW EXECUTE FUNCTION crm_entity_norm_fn();

UPDATE "crm_contacts" SET "assigneeKey" = crm_entity_assignee("customJson", "createdById");
UPDATE "crm_companies" SET "assigneeKey" = crm_entity_assignee("customJson", "createdById");
