#!/usr/bin/env bash
# Asterisk ma'lumotlar papkasini tayyorlaydi: konteyner standart konfiguratsiyasi (asterisk.conf, modules.conf, logger.conf, …) +
# bizning fayllar (pjsip, extensions, manager, …) ustiga yoziladi. Papkani butunlay mount qilish uchun standart fayllar KERAK —
# aks holda Asterisk «Unable to open asterisk.conf» bilan ishga tushmaydi.
# Ishlatish:  AMI_SECRET=<parol> ./init.sh [/opt/crm/deploy/asterisk-data]
# PBX_SIP_HOST (ixtiyoriy) — telefonlar ro'yxatdan o'tadigan domen: brauzer telefoni uchun Caddy sayti yaratiladi.
# AMI_PERMIT (ixtiyoriy) — manager.conf dagi ruxsat etilgan tarmoq (standart: faqat docker tarmog'i va localhost).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="${1:-$HERE/../asterisk-data}"
: "${AMI_SECRET:?AMI_SECRET (tasodifiy parol) kerak}"
IMAGE="${ASTERISK_IMAGE:-andrius/asterisk:latest}"
mkdir -p "$DATA/etc" "$DATA/sounds/custom" "$DATA/recordings"
DATA="$(cd "$DATA" && pwd)"
if [ ! -f "$DATA/etc/asterisk.conf" ]; then
  docker run --rm --entrypoint sh -v "$DATA/etc:/out" "$IMAGE" -c 'cp -a /etc/asterisk/. /out/'
fi
cp "$HERE"/etc/*.conf "$DATA/etc/"
sed -i.bak "s/__AMI_SECRET__/${AMI_SECRET}/" "$DATA/etc/manager.conf"
if [ -n "${AMI_PERMIT:-}" ]; then sed -i.bak "s#^permit = 127.*#permit = ${AMI_PERMIT}#" "$DATA/etc/manager.conf"; fi
rm -f "$DATA/etc/manager.conf.bak"
for f in pjsip_crm.conf extensions_crm.conf queues_crm.conf; do [ -f "$DATA/etc/$f" ] || touch "$DATA/etc/$f"; done
chmod -R a+rwX "$DATA"
# Brauzer telefoni: PBX_SIP_HOST berilgan bo'lsa Caddy sayti (wss://<domen>/ws → asterisk:8088); Let's Encrypt sertifikatini Caddy o'zi oladi
if [ -n "${PBX_SIP_HOST:-}" ] && [ -d "$HERE/../caddy" ]; then
  mkdir -p "$HERE/../caddy/sites"
  printf '%s {\n\tencode zstd gzip\n\treverse_proxy /ws asterisk:8088\n\trespond "SIP" 200\n}\n' "$PBX_SIP_HOST" > "$HERE/../caddy/sites/pbx.caddy"
  echo "Caddy sayti yozildi: caddy/sites/pbx.caddy → docker exec crm-caddy caddy reload --config /etc/caddy/Caddyfile"
fi
echo "Asterisk ma'lumotlar papkasi tayyor: $DATA"
