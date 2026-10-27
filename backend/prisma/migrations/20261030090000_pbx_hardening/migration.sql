-- PBX mustahkamlash: call_logs.externalId noyob (bitta qo'ng'iroq — bitta yozuv, parallel CDR/webhook dublikat yaratmaydi)
-- va callback vidjeti so'rovlari jadvali (sutkalik cheklovlar). Idempotent.

-- Mavjud dublikatlar: eng birinchisi qoladi, qolganlarining externalId'siga «:dup:<id>» qo'shiladi (ma'lumot o'chirilmaydi).
UPDATE "call_logs" c SET "externalId" = c."externalId" || ':dup:' || c."id"
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "externalId" ORDER BY "startedAt" ASC, "id" ASC) AS rn
  FROM "call_logs" WHERE "externalId" IS NOT NULL
) d
WHERE c."id" = d."id" AND d.rn > 1;

-- Postgres'da NULL lar noyoblikka kirmaydi — `WHERE "externalId" IS NOT NULL` qisman indeks bilan bir xil ma'noda;
-- to'liq indeks Prisma sxemasidagi `@unique` bilan mos (migrate diff farq ko'rsatmaydi).
CREATE UNIQUE INDEX IF NOT EXISTS "call_logs_externalId_key" ON "call_logs"("externalId");

CREATE TABLE IF NOT EXISTS "callback_requests" (
  "id" TEXT NOT NULL,
  "phoneKey" TEXT NOT NULL,
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "callback_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "callback_requests_phoneKey_createdAt_idx" ON "callback_requests"("phoneKey", "createdAt");
CREATE INDEX IF NOT EXISTS "callback_requests_createdAt_idx" ON "callback_requests"("createdAt");
