#!/usr/bin/env bash
# Yangi mijoz nusxasi: alohida baza + konteyner + HTTPS subdomen.
# Ishlatish:  ./new-customer.sh <nom> [--pbx]   (nom: kichik lotin harf/raqam/tire, 2–30 belgi; masalan "decopol")
#   --pbx: shu mijozga o'z telefon stansiyamizni (Asterisk, deploy/asterisk) ulaydi. Bitta Asterisk — bitta mijozga. Oldin: AMI_SECRET=… asterisk/init.sh asterisk-data;
#          deploy/.env da PBX_SIP_HOST (telefonlar ro'yxatdan o'tadigan domen) va AMI_SECRET bo'lishi kerak; keyin `docker compose --profile pbx up -d asterisk`.
# Natija: https://<nom>.<DOMAIN>  (birinchi ochilganda mijoz «Birinchi sozlash»da SETUP_TOKEN bilan admin yaratadi)
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "deploy/.env yo'q (.env.example dan nusxa oling)"; exit 1; }
set -a; . ./.env; set +a
NAME="${1:-}"; PBX=0; [ "${2:-}" = "--pbx" ] && PBX=1
[[ "$NAME" =~ ^[a-z0-9][a-z0-9-]{1,29}$ ]] || { echo "Nom noto'g'ri: kichik lotin harf/raqam/tire, 2–30 belgi"; exit 1; }
DIR="customers/$NAME"
[ -e "$DIR" ] && { echo "Bu mijoz allaqachon bor: $DIR"; exit 1; }
DB="crm_${NAME//-/_}"
DBPASS="$(openssl rand -hex 16)"
SETUP_TOKEN="$(openssl rand -hex 8)"

docker exec crm-postgres psql -U postgres -v ON_ERROR_STOP=1 -c "CREATE ROLE \"$DB\" LOGIN PASSWORD '$DBPASS'" -c "CREATE DATABASE \"$DB\" OWNER \"$DB\""

mkdir -p "$DIR" caddy/sites
umask 077
cat > "$DIR/.env" <<ENV
DATABASE_URL=postgresql://$DB:$DBPASS@crm-postgres:5432/$DB
JWT_ACCESS_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
PORT=8000
PUBLIC_URL=https://$NAME.$DOMAIN
SETUP_TOKEN=$SETUP_TOKEN
LICENSE_SECRET=$LICENSE_SECRET
$( [ "$PBX" = 1 ] && printf "ASTERISK_AMI_HOST=asterisk\nASTERISK_AMI_PORT=5038\nASTERISK_AMI_USER=crm\nASTERISK_AMI_SECRET=%s\nASTERISK_CONF_DIR=/asterisk/etc\nASTERISK_SOUNDS_DIR=/asterisk/sounds\nASTERISK_RECORDINGS_DIR=/asterisk/recordings\nPBX_SIP_HOST=%s\n" "${AMI_SECRET:?AMI_SECRET kerak (deploy/.env)}" "${PBX_SIP_HOST:?PBX_SIP_HOST kerak (deploy/.env)}" )
$( [ "$PBX" = 1 ] && [ -n "${PBX_EXTERNAL_IP:-}" ] && printf "PBX_EXTERNAL_IP=%s\n" "$PBX_EXTERNAL_IP" )
$( [ "$PBX" = 1 ] && [ -n "${PBX_LOCAL_NET:-}" ] && printf "PBX_LOCAL_NET=%s\n" "$PBX_LOCAL_NET" )
BILLING_CARD_NUMBER=$BILLING_CARD_NUMBER
BILLING_CARD_HOLDER=$BILLING_CARD_HOLDER
BILLING_TELEGRAM=$BILLING_TELEGRAM
BILLING_ENFORCE=1
ENV
umask 022
# yozuvlar papkasi yozish ruxsati bilan ulanadi: saqlash muddati o'tgan yozuvlarni CRM o'chiradi (Telefoniya → Suhbatlarni yozib olish)
cat > "$DIR/compose.yml" <<YML
name: crm-$NAME
services:
  app:
    image: crm:latest
    container_name: crm-$NAME
    restart: unless-stopped
    env_file: .env
    mem_limit: 512m
    networks: [crm-net]
$( [ "$PBX" = 1 ] && printf '    volumes:\n      - ../../asterisk-data/etc:/asterisk/etc\n      - ../../asterisk-data/sounds:/asterisk/sounds\n      - ../../asterisk-data/recordings:/asterisk/recordings\n' )
networks:
  crm-net:
    external: true
    name: crm-net
YML
cat > "caddy/sites/$NAME.caddy" <<CADDY
$NAME.$DOMAIN {
	encode zstd gzip
	reverse_proxy crm-$NAME:8000
}
CADDY

docker compose -f "$DIR/compose.yml" up -d
docker exec crm-caddy caddy reload --config /etc/caddy/Caddyfile
echo
echo "Tayyor: https://$NAME.$DOMAIN"
echo "Birinchi sozlash kodi (SETUP_TOKEN) mijozga alohida kanal orqali bering: $SETUP_TOKEN"
echo "Mijoz nusxasi env fayli: $DIR/.env (maxfiy, git'ga tushmaydi)"
