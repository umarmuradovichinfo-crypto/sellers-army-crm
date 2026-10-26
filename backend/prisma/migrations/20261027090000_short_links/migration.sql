-- amoCRM «Сокращать ссылки»: mijozga yuborilgan havolalar kuzatiladigan qisqa havolaga almashadi
CREATE TABLE IF NOT EXISTS "crm_short_links" (
  "code" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "leadId" TEXT,
  "clicks" INTEGER NOT NULL DEFAULT 0,
  "lastClickAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_short_links_pkey" PRIMARY KEY ("code")
);
CREATE INDEX IF NOT EXISTS "crm_short_links_leadId_idx" ON "crm_short_links"("leadId");
