#!/usr/bin/env bash
# Yangi versiyani chiqarish: git pull → image yig'ish → har mijoz nusxasini ketma-ket yangilash (migratsiya ishga tushishda bajariladi).
# Biror mijoz sog'lom bo'lmasa — to'xtaydi va Telegramga xabar yuboradi (qolgan mijozlar eski versiyada qoladi).
# Ishlatish:  ./update.sh         (repo ildizidan: git pull qilingan holda ham, qilinmagan holda ham ishlaydi)
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
notify() { [ -n "${TG_BOT_TOKEN:-}" ] && [ -n "${TG_CHAT_ID:-}" ] && curl -fsS "https://api.telegram.org/bot$TG_BOT_TOKEN/sendMessage" --data-urlencode "chat_id=$TG_CHAT_ID" --data-urlencode "text=$1" >/dev/null || true; }
cd ..
git pull --ff-only
docker build -t crm:latest .
cd deploy
for d in customers/*/; do
  name="$(basename "$d")"
  echo "→ $name yangilanmoqda"
  docker compose -f "$d/compose.yml" up -d --force-recreate
  ok=0
  for i in $(seq 1 40); do
    if docker exec "crm-$name" node -e "fetch('http://localhost:8000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then ok=1; break; fi
    sleep 3
  done
  if [ "$ok" != 1 ]; then notify "❌ CRM yangilanishi: $name ishga tushmadi (qolganlari to'xtatildi)"; echo "XATO: $name sog'lom emas"; exit 1; fi
done
notify "✅ CRM yangilandi ($(git rev-parse --short HEAD))"
echo "Hammasi yangilandi"
