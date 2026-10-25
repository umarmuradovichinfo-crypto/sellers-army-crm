-- amoCRM «Пользователи → Группа»: guruh (otdel) huquq profilidan (rol) alohida
CREATE TABLE IF NOT EXISTS "crm_user_groups" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_user_groups_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "groupId" TEXT;
CREATE INDEX IF NOT EXISTS "User_groupId_idx" ON "User"("groupId");
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "crm_user_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Mavjud foydalanuvchilar: oldin guruh = rol edi — har ishlatilgan rol uchun shu nomli guruh yaratib, foydalanuvchilarni unga biriktiramiz
INSERT INTO "crm_user_groups" ("id", "name", "sort")
SELECT 'g_' || r."id", r."name", ROW_NUMBER() OVER (ORDER BY r."name")
FROM "Role" r WHERE EXISTS (SELECT 1 FROM "User" u WHERE u."roleId" = r."id")
ON CONFLICT ("id") DO NOTHING;
UPDATE "User" u SET "groupId" = 'g_' || u."roleId" WHERE u."groupId" IS NULL AND EXISTS (SELECT 1 FROM "crm_user_groups" g WHERE g."id" = 'g_' || u."roleId");
