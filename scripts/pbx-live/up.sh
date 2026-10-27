#!/usr/bin/env bash
# Haqiqiy Asterisk (Docker) + CRM backend (alohida baza) — kompyuterda stansiyani jonli sinash uchun.
# Ishlatish: scripts/pbx-live/up.sh   (to'xtatish: scripts/pbx-live/down.sh)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
W="$HOME/.crm-live"
SECRET=livesecret123
rm -rf "$W"; mkdir -p "$W"
AMI_SECRET=$SECRET AMI_PERMIT="0.0.0.0/0.0.0.0" "$ROOT/deploy/asterisk/init.sh" "$W" >/dev/null
mv "$W/recordings" "$W/rec"
python3 - <<'PY'
import wave,math,struct,os
p=os.path.expanduser('~/.crm-live/rec/tone.wav')
w=wave.open(p,'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
w.writeframes(b''.join(struct.pack('<h',int(8000*math.sin(2*math.pi*440*i/8000))) for i in range(8000*30))); w.close()
PY
chmod a+r "$W/rec/tone.wav"
docker image inspect crm-ast-test >/dev/null 2>&1 || docker build -q -t crm-ast-test "$ROOT/scripts/pbx-live" >/dev/null
docker rm -f crm-ast-live >/dev/null 2>&1 || true
docker run -d --name crm-ast-live -p 127.0.0.1:5038:5038 -p 5060:5060/udp -p 127.0.0.1:8088:8088 -p 10000-10100:10000-10100/udp \
  -v "$W/etc:/etc/asterisk" -v "$W/sounds/custom:/var/lib/asterisk/sounds/custom" -v "$W/rec:/var/spool/asterisk/monitor" crm-ast-test >/dev/null
for i in $(seq 1 30); do docker exec crm-ast-live asterisk -rx "core show version" >/dev/null 2>&1 && break; sleep 1; done
docker exec crm-ast-live asterisk -rx "core show version"

# CRM backend (alohida baza, 8031-port)
cd "$ROOT/backend"
BASE_URL_DB="$(grep ^DATABASE_URL .env | cut -d= -f2- | tr -d '"')"
export DATABASE_URL="${BASE_URL_DB%/*}/sellers_crm_live" PORT=8031
psql "${BASE_URL_DB%/*}/postgres" -qc "DROP DATABASE IF EXISTS sellers_crm_live WITH (FORCE)" >/dev/null
psql "${BASE_URL_DB%/*}/postgres" -qc "CREATE DATABASE sellers_crm_live" >/dev/null
npx prisma migrate deploy >/dev/null
npx tsx prisma/seed.ts >/dev/null
unset SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD SETUP_TOKEN
export ASTERISK_AMI_HOST=127.0.0.1 ASTERISK_AMI_PORT=5038 ASTERISK_AMI_USER=crm ASTERISK_AMI_SECRET=$SECRET
export ASTERISK_CONF_DIR="$W/etc" ASTERISK_SOUNDS_DIR="$W/sounds" ASTERISK_RECORDINGS_DIR="$W/rec" PBX_SIP_HOST=127.0.0.1
export PUBLIC_URL="http://localhost:8031" LICENSE_ALLOW_UNBOUND=1
nohup node dist/main.js > "$W/backend.log" 2>&1 &
echo $! > "$W/backend.pid"
for i in $(seq 1 60); do curl -sf http://localhost:8031/api/v1/health >/dev/null 2>&1 && break; sleep 0.5; done
echo "backend: http://localhost:8031/api/v1 (log $W/backend.log)"
