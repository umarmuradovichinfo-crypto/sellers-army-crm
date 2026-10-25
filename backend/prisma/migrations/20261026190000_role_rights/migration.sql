-- amoCRM «Права доступа» matritsasi (huquq profili bo'yicha JSON; bo'sh — hammasi ruxsat)
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "rightsJson" TEXT;
