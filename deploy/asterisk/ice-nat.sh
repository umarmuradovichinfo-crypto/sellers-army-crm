#!/usr/bin/env bash
# Brauzer telefoni (WebRTC) NAT ortida: Asterisk Docker konteynerida ICE nomzodi sifatida konteyner IP'sini (172.x) e'lon qiladi —
# internetdagi brauzer unga yeta olmaydi. rtp.conf [ice_host_candidates] konteyner IP'sini serverning tashqi IP'siga almashtiradi
# (include_local_address — ichki manzil ham qoladi). Jonli Asterisk 23 da sinalgan: SDP'da `<tashqi IP> <port> typ host` paydo bo'ladi.
# Konteyner qayta yaratilsa IP o'zgarishi mumkin — `docker compose --profile pbx up -d asterisk` dan keyin qayta ishga tushiring (idempotent).
# Ishlatish: PBX_EXTERNAL_IP=203.0.113.10 ./ice-nat.sh [asterisk-data papkasi] [konteyner nomi]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DATA="${1:-$HERE/../asterisk-data}"
NAME="${2:-asterisk}"
EXT="${PBX_EXTERNAL_IP:?PBX_EXTERNAL_IP (serverning tashqi IPv4 manzili) kerak}"
[[ "$EXT" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo "PBX_EXTERNAL_IP IPv4 bo'lishi kerak: $EXT"; exit 1; }
IP="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' "$NAME" | awk '{print $1}')"
[[ "$IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo "$NAME konteyneri IP'si topilmadi (ishga tushganmi?)"; exit 1; }
CONF="$DATA/etc/rtp.conf"
[ -f "$CONF" ] || { echo "$CONF yo'q (avval init.sh)"; exit 1; }
# eski [ice_host_candidates] bo'limini olib tashlab, yangisini yozamiz
awk 'BEGIN{skip=0; b=0} /^\[ice_host_candidates\]/{skip=1; next} /^\[/{skip=0} skip{next} /^[[:space:]]*$/{b++; next} {while(b>0){print ""; b--} print}' "$CONF" > "$CONF.tmp"
printf '\n[ice_host_candidates]\n%s => %s,include_local_address\n' "$IP" "$EXT" >> "$CONF.tmp"
mv "$CONF.tmp" "$CONF"
docker exec "$NAME" asterisk -rx "module reload res_rtp_asterisk.so" >/dev/null
echo "ICE: $IP → $EXT (rtp.conf yangilandi, res_rtp_asterisk qayta yuklandi)"
