-- Bitimning qo'shimcha kontaktlari (asosiy kontakt leads."contactId" da qoladi)
CREATE TABLE IF NOT EXISTS "crm_lead_contacts" (
  "leadId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_lead_contacts_pkey" PRIMARY KEY ("leadId", "contactId")
);
CREATE INDEX IF NOT EXISTS "crm_lead_contacts_contactId_idx" ON "crm_lead_contacts"("contactId");
ALTER TABLE "crm_lead_contacts" ADD CONSTRAINT "crm_lead_contacts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_lead_contacts" ADD CONSTRAINT "crm_lead_contacts_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
