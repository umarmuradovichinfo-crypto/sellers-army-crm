#!/usr/bin/env bash
# CRM backend'ni (8031) qayta ishga tushirish — baza va Asterisk konteyneri saqlanadi (kod o'zgargach: npm --prefix backend run build && backend.sh).
# Qo'shimcha env (masalan PBX_EXTERNAL_IP=… PBX_LOCAL_NET=…) shu buyruq oldidan berilsa backend'ga o'tadi.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
W="$HOME/.crm-live"
lsof -ti tcp:8031 | xargs kill 2>/dev/null || true
sleep 1
cd "$ROOT/backend"
BASE_URL_DB="$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')"
export DATABASE_URL="${BASE_URL_DB%/*}/sellers_crm_live" PORT=8031
unset SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD SETUP_TOKEN
export ASTERISK_AMI_HOST=127.0.0.1 ASTERISK_AMI_PORT=5038 ASTERISK_AMI_USER=crm ASTERISK_AMI_SECRET=livesecret123
export ASTERISK_CONF_DIR="$W/etc" ASTERISK_SOUNDS_DIR="$W/sounds" ASTERISK_RECORDINGS_DIR="$W/rec" PBX_SIP_HOST=127.0.0.1
export PUBLIC_URL="http://localhost:8031" LICENSE_ALLOW_UNBOUND=1
nohup node dist/main.js > "$W/backend.log" 2>&1 &
echo $! > "$W/backend.pid"
for i in $(seq 1 60); do curl -sf http://localhost:8031/api/v1/health >/dev/null 2>&1 && break; sleep 0.5; done
echo "backend qayta ishga tushdi (8031)"
