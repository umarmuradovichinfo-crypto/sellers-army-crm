-- amoCRM «Беседа № A8176»: har bir suhbatning raqami; suhbat yopilib, mijoz qayta yozsa — yangi raqam
CREATE SEQUENCE IF NOT EXISTS "crm_conv_number_seq" START 1000;
ALTER TABLE "crm_conversations" ADD COLUMN "number" INTEGER NOT NULL DEFAULT nextval('crm_conv_number_seq');
ALTER SEQUENCE "crm_conv_number_seq" OWNED BY "crm_conversations"."number";

-- xabar qaysi suhbatga tegishli
ALTER TABLE "crm_messages" ADD COLUMN "convNo" INTEGER;

-- mavjud yozishmalar: xabari bor, lekin suhbat holati yo'q bitimlarga holat yaratamiz va xabarlarni joriy suhbatga bog'laymiz
INSERT INTO "crm_conversations" ("leadId", "updatedAt")
SELECT DISTINCT m."leadId", now() FROM "crm_messages" m
WHERE NOT EXISTS (SELECT 1 FROM "crm_conversations" c WHERE c."leadId" = m."leadId")
  AND EXISTS (SELECT 1 FROM "leads" l WHERE l.id = m."leadId");
UPDATE "crm_messages" m SET "convNo" = c."number" FROM "crm_conversations" c WHERE c."leadId" = m."leadId" AND m."convNo" IS NULL;
