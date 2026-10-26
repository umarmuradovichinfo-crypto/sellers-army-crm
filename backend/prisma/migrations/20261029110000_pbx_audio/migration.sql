-- Audio kutubxona (salomlashish, navbat, ovozli pochta, musiqa uchun fayllar). Idempotent.
CREATE TABLE IF NOT EXISTS "pbx_audio" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pbx_audio_pkey" PRIMARY KEY ("id")
);
