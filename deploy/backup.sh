#!/usr/bin/env bash
# Har mijoz bazasi: pg_dump → age bilan shifrlash → rclone orqali TASHQI joyga. Maxfiy kalit serverda yo'q (faqat ommaviy).
# Saqlash: kunlik nusxalar 40 kun; har oyning 1-kuni nusxasi `monthly/` da 12 oy.
# crontab:  17 3 * * *  /opt/crm/deploy/backup.sh >> /var/log/crm-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
: "${AGE_PUBLIC_KEY:?AGE_PUBLIC_KEY kerak}" "${RCLONE_REMOTE:?RCLONE_REMOTE kerak}"
notify() { [ -n "${TG_BOT_TOKEN:-}" ] && [ -n "${TG_CHAT_ID:-}" ] && curl -fsS "https://api.telegram.org/bot$TG_BOT_TOKEN/sendMessage" --data-urlencode "chat_id=$TG_CHAT_ID" --data-urlencode "text=$1" >/dev/null || true; }
TS="$(date -u +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
fail=0; done_n=0
for d in customers/*/; do
  name="$(basename "$d")"; db="crm_${name//-/_}"
  f="$TMP/$name-$TS.dump.age"
  if docker exec crm-postgres pg_dump -U postgres -Fc "$db" | age -r "$AGE_PUBLIC_KEY" > "$f" && [ "$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")" -gt 1024 ]; then
    rclone copyto "$f" "$RCLONE_REMOTE/daily/$name/$name-$TS.dump.age"
    [ "$(date -u +%d)" = "01" ] && rclone copyto "$f" "$RCLONE_REMOTE/monthly/$name/$name-$TS.dump.age"
    done_n=$((done_n+1))
  else
    echo "XATO: $name zaxirasi olinmadi"; fail=$((fail+1))
  fi
  rm -f "$f"
done
# Server sozlamalari (JWT/baza parollari, litsenziya siri, Caddy) ham shifrlangan holda — server o'lsa mijoz nusxalarini aynan tiklash uchun
if tar -C . -cf - .env customers caddy/sites 2>/dev/null | age -r "$AGE_PUBLIC_KEY" > "$TMP/config-$TS.tar.age" && [ "$(stat -c %s "$TMP/config-$TS.tar.age" 2>/dev/null || stat -f %z "$TMP/config-$TS.tar.age")" -gt 256 ]; then
  rclone copyto "$TMP/config-$TS.tar.age" "$RCLONE_REMOTE/config/config-$TS.tar.age"
else
  echo "XATO: server sozlamalari zaxirasi olinmadi"; fail=$((fail+1))
fi
rclone delete --min-age 40d "$RCLONE_REMOTE/config" || true
rclone delete --min-age 40d "$RCLONE_REMOTE/daily" || true
rclone delete --min-age 400d "$RCLONE_REMOTE/monthly" || true
if [ "$fail" -gt 0 ]; then notify "❌ CRM zaxira: $fail ta mijozda xato ($done_n tasi muvaffaqiyatli)"; exit 1; fi
notify "✅ CRM zaxira: $done_n ta mijoz bazasi tashqi joyga saqlandi"
