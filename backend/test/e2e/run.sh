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
# test qiymatlari — faqat lokal test bazasi uchun
export SEED_ADMIN_EMAIL="qa-admin@test.local"
export SEED_ADMIN_PASSWORD="qa-test-Passw0rd!"
export SEED_ADMIN_NAME="QA Admin"
export E2E_BASE="http://localhost:${PORT}/api/v1"
export E2E_EMAIL="$SEED_ADMIN_EMAIL" E2E_PASSWORD="$SEED_ADMIN_PASSWORD"
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN TELEGRAM_WEBHOOK_SECRET || true
# Telegram yoqilgan holat (webhook maxfiy kaliti tekshiruvi uchun); API manzili yopiq port — tashqariga hech narsa ketmaydi
export TELEGRAM_BOT_TOKEN="e2e-test-token" TELEGRAM_API_BASE="http://127.0.0.1:9"

DBURL_ADMIN="${BASE_URL_DB%/*}/postgres"
psql "$DBURL_ADMIN" -qc "DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)" >/dev/null
psql "$DBURL_ADMIN" -qc "CREATE DATABASE ${TEST_DB}" >/dev/null
npx prisma migrate deploy >/dev/null
npx tsx prisma/seed.ts >/dev/null

LOG="$(mktemp -t crm-e2e)"
node dist/main.js >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for i in $(seq 1 60); do
  curl -sf "${E2E_BASE}/health" >/dev/null 2>&1 && break
  if ! kill -0 $PID 2>/dev/null; then echo "Backend ishga tushmadi:"; tail -30 "$LOG"; exit 1; fi
  sleep 0.5
done

set +e
node --test --test-concurrency=1 --test-reporter=spec ${E2E_FILES:-test/e2e/*.test.mjs}
CODE=$?
set -e
if [ $CODE -ne 0 ]; then echo "--- backend xatolari (oxirgi 40 qator) ---"; grep -iE "error|exception" "$LOG" | tail -40; fi
exit $CODE
