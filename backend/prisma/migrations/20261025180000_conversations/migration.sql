CREATE TABLE "crm_conversations" (
    "leadId" TEXT NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "favJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "crm_conversations_pkey" PRIMARY KEY ("leadId")
);
