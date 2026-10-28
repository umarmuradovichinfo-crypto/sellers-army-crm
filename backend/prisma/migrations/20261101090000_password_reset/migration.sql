-- «Parolni unutdim»: bir martalik tiklash kodlari (faqat tuzli sha256 xeshi saqlanadi). Idempotent.
CREATE TABLE IF NOT EXISTS "password_reset_codes" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "userId" TEXT,
  "codeHash" TEXT NOT NULL,
  "salt" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "ip" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "password_reset_codes_email_createdAt_idx" ON "password_reset_codes"("email", "createdAt");
CREATE INDEX IF NOT EXISTS "password_reset_codes_createdAt_idx" ON "password_reset_codes"("createdAt");
