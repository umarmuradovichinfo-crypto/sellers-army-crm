-- amoCRM «Настройки профиля»: telefon, izoh; «Сеансы»: har bir refresh token = sessiya (brauzer, IP, oxirgi faollik)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "note" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "ip" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "ua" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP(3);
