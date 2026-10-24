#!/usr/bin/env bash
# Smoke test: migratsiya -> seed -> backend'ni ko'tarish -> scripts/smoke.mjs.
# Talab: bo'sh (throwaway) PostgreSQL bazasi. Masalan:
#   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/crm_smoke ./scripts/smoke.sh
# Docker bor bo'lsa:  docker compose up -d db   (DATABASE_URL: postgresql://crm:crm@localhost:5432/crm)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DATABASE_URL:?DATABASE_URL kerak (throwaway baza!)}"
PORT="${SMOKE_PORT:-8123}"
export DATABASE_URL PORT
export JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-smoke-access-$(openssl rand -hex 16)}"
export JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-smoke-refresh-$(openssl rand -hex 16)}"
export SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-smoke-admin@example.com}"
export SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-$(openssl rand -hex 12)}"

cd "$ROOT/backend"
[ -d node_modules ] || npm install
npx prisma migrate deploy
npm run db:seed
npm run build
[ -f dist/public/index.html ] || { [ -d ../frontend/dist ] && cp -r ../frontend/dist dist/public || true; }

node dist/main > "$ROOT/.smoke-server.log" 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; rm -f "$ROOT/.smoke-server.log"' EXIT
for i in $(seq 1 40); do
  curl -fs "http://localhost:$PORT/api/v1/auth/me" -o /dev/null 2>&1 && break
  # 401 ham "server tirik" degani
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/api/v1/auth/me" || true)
  [ "$code" = "401" ] && break
  sleep 0.5
done

SMOKE_BASE="http://localhost:$PORT" SMOKE_EMAIL="$SEED_ADMIN_EMAIL" SMOKE_PASSWORD="$SEED_ADMIN_PASSWORD" node "$ROOT/scripts/smoke.mjs"
