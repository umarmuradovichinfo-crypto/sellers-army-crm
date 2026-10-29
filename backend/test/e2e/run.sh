#!/usr/bin/env bash
# To'liq E2E (API) testlar: alohida test bazasi (sellers_crm_test) yaratiladi, migratsiya + seed,
# backend 8010-portda ishga tushadi va test/e2e/*.test.mjs yurgiziladi. Ishchi bazaga tegmaydi.
# Ishlatish: npm run test:e2e   (oldin: npm run build)
set -euo pipefail
cd "$(dirname "$0")/../.."

BASE_URL_DB="$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')"
TEST_DB="${E2E_DB:-sellers_crm_test}"
export DATABASE_URL="${BASE_URL_DB%/*}/${TEST_DB}"
export PORT="${E2E_PORT:-8010}"
# test qiymatlari — faqat lokal test bazasi uchun. Admin seed bilan emas, «birinchi sozlash» (POST /auth/setup)
# orqali yaratiladi — 0-setup.test.mjs shu oqimni tekshiradi
export E2E_BASE="http://localhost:${PORT}/api/v1"
export E2E_EMAIL="qa-admin@test.local" E2E_PASSWORD="qa-test-Passw0rd!"
unset SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD SETUP_TOKEN ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN TELEGRAM_WEBHOOK_SECRET || true
# Telegram yoqilgan holat (webhook maxfiy kaliti tekshiruvi uchun); API manzili yopiq port — tashqariga hech narsa ketmaydi
export TELEGRAM_BOT_TOKEN="e2e-test-token" TELEGRAM_API_BASE="http://127.0.0.1:9"
# FAQAT TEST: botga ketayotgan xabarlar shu faylga ham yoziladi (parol tiklash kodini testda o'qish uchun; production'da o'chiq)
export TELEGRAM_TEST_SINK="/tmp/crm-e2e-tg-sink.jsonl"; rm -f "$TELEGRAM_TEST_SINK"
# «Сокращать ссылки» qisqa havolalari uchun ommaviy manzil
export PUBLIC_URL="http://localhost:${PORT}"
# Asterisk sozlamasini qo'llash sinovi uchun vaqtinchalik papkalar (AMI yo'q — qayta yuklash o'tkazib yuboriladi)
rm -rf /tmp/crm-e2e-asterisk
export ASTERISK_CONF_DIR="/tmp/crm-e2e-asterisk/conf" ASTERISK_SOUNDS_DIR="/tmp/crm-e2e-asterisk/sounds"
# yozuvlar papkasi (saqlash muddati / «yozuv mavjud emas» sinovi)
export ASTERISK_RECORDINGS_DIR="/tmp/crm-e2e-asterisk/rec"; mkdir -p "$ASTERISK_RECORDINGS_DIR"
# Ovoz sintezi: sinov provayderi (kalitsiz, tarmoqsiz) va kichik sutkalik limit (limit sinovi uchun)
export PBX_TTS_MOCK=1 PBX_TTS_DAILY=12
unset AZURE_TTS_KEY AZURE_TTS_REGION GOOGLE_TTS_API_KEY ESPEAK_BIN || true
# «ИИ-менеджер»: sinov STT va sinov tahlil (tarmoqsiz, kalitsiz); fon sikli o'chiq — testlar POST /pbx/ai/tick bilan boshqaradi
export PBX_STT_MOCK=1 PBX_AI_MOCK=1 PBX_AI_TICK_MS=0
unset OPENAI_API_KEY DEEPGRAM_API_KEY AZURE_STT_KEY AZURE_STT_REGION AZURE_STT_ENDPOINT || true
# Obuna litsenziyasi sinovi uchun test sirri (faqat lokal test bazasi)
export LICENSE_ALLOW_UNBOUND=1 LICENSE_SECRET="e2e-license-secret" BILLING_CARD_NUMBER="8600 0000 0000 0000" BILLING_CARD_HOLDER="TEST HOLDER" BILLING_TELEGRAM="@test_admin"

DBURL_ADMIN="${BASE_URL_DB%/*}/postgres"
psql "$DBURL_ADMIN" -qc "DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)" >/dev/null
psql "$DBURL_ADMIN" -qc "CREATE DATABASE ${TEST_DB}" >/dev/null
npx prisma migrate deploy >/dev/null
npx tsx prisma/seed.ts >/dev/null

LOG="$(mktemp -t crm-e2e)"
node dist/main.js >"$LOG" 2>&1 &
PID=$!
disown $PID 2>/dev/null || true  # oxirida «Terminated: 15» xabari chiqmasin
trap 'kill $PID 2>/dev/null || true' EXIT
for i in $(seq 1 60); do
  curl -sf "${E2E_BASE}/health" >/dev/null 2>&1 && break
  if ! kill -0 $PID 2>/dev/null; then echo "Backend ishga tushmadi:"; tail -30 "$LOG"; exit 1; fi
  sleep 0.5
done

set +e
node --test --test-concurrency=1 --test-reporter=spec ${E2E_FILES:-test/e2e/*.test.mjs}
CODE=$?
# E2E_UI=1 — UI tutun testi (kompyuterdagi Chrome): frontend dev server test backendiga ulanadi
if [ "${E2E_UI:-0}" = "1" ]; then
  echo; echo "── UI testlari ──"
  UI_PORT="${E2E_UI_PORT:-5199}"
  ( cd ../frontend && VITE_API_URL="http://localhost:${PORT}" npx vite --port "$UI_PORT" --strictPort >"$LOG.ui" 2>&1 ) &
  UIPID=$!
  disown $UIPID 2>/dev/null || true
  trap 'kill $PID $UIPID 2>/dev/null || true; pkill -f "vite --port ${UI_PORT}" 2>/dev/null || true' EXIT
  for i in $(seq 1 60); do curl -sf "http://localhost:${UI_PORT}/" >/dev/null 2>&1 && break; sleep 0.5; done
  ( cd ../frontend && UI_BASE="http://localhost:${UI_PORT}" node test/ui/smoke.mjs ) || CODE=1
fi
# barcha testlardan keyin test bazasining yaxlitligi (bug izlari: yetim yozuvlar, noto'g'ri bosqich, yopilish sanalari...)
echo; echo "── Ma'lumotlar yaxlitligi (test bazasi) ──"
npx tsx scripts/check-integrity.ts || CODE=1
set -e
if [ $CODE -ne 0 ]; then echo "--- backend xatolari (oxirgi 40 qator) ---"; grep -iE "error|exception" "$LOG" | tail -40; fi
exit $CODE
