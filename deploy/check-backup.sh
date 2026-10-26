#!/usr/bin/env bash
# Har kuni: har mijozning oxirgi zaxirasi bormi, 26 soatdan yangimi, hajmi normalmi — tekshiradi (shifrlamasdan). Muammo bo'lsa Telegramga.
# crontab:  47 7 * * *  /opt/crm/deploy/check-backup.sh >> /var/log/crm-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
notify() { [ -n "${TG_BOT_TOKEN:-}" ] && [ -n "${TG_CHAT_ID:-}" ] && curl -fsS "https://api.telegram.org/bot$TG_BOT_TOKEN/sendMessage" --data-urlencode "chat_id=$TG_CHAT_ID" --data-urlencode "text=$1" >/dev/null || true; }
bad=""
for d in customers/*/; do
  name="$(basename "$d")"
  last="$(rclone lsf --format "tsp" --files-only "$RCLONE_REMOTE/daily/$name" 2>/dev/null | sort | tail -1 || true)"
  [ -z "$last" ] && { bad="$bad\n$name: zaxira yo'q"; continue; }
  ts="${last%%;*}"; size="$(echo "$last" | cut -d';' -f2)"
  age_s=$(( $(date -u +%s) - $(date -u -d "$ts" +%s 2>/dev/null || echo 0) ))
  [ "$age_s" -gt 93600 ] && bad="$bad\n$name: oxirgi zaxira eski ($((age_s/3600)) soat)"
  [ "${size:-0}" -lt 1024 ] && bad="$bad\n$name: zaxira juda kichik ($size bayt)"
done
if [ -n "$bad" ]; then notify "⚠️ CRM zaxira tekshiruvi:$(printf "$bad")"; exit 1; fi
echo "Zaxira tekshiruvi: hammasi joyida"
