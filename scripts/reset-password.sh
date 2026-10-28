#!/usr/bin/env bash
# Foydalanuvchi parolini qayta o'rnatish (parol esdan chiqqanda, Telegram/email ulanmagan bo'lsa).
# Tasodifiy vaqtinchalik parol yaratadi, bcrypt hash'ini bazaga yozadi, parolni FAYLGA saqlaydi (chatga/jurnalga chiqarmaydi).
# Ishlatish:
#   scripts/reset-password.sh <email>            — Railway'dagi `crm` xizmati ichida (railway CLI, login qilingan bo'lishi kerak)
#   scripts/reset-password.sh <email> --local    — mahalliy baza (backend/.env DATABASE_URL), sinash uchun
# Natija: ~/cloncrm-vaqtinchalik-parol.txt (faqat sizga o'qiladi). Kirgach parolni darrov o'zgartiring.
set -euo pipefail
EMAIL="${1:?email kerak}"; MODE="${2:-railway}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
umask 077
PW="$(node -e "console.log(require('crypto').randomBytes(9).toString('base64url')+'!7a')")"
HASH="$(cd "$ROOT/backend" && PW="$PW" node -e "console.log(require('bcryptjs').hashSync(process.env.PW,10))")"
PAYLOAD="$(printf '{"e":"%s","h":"%s"}' "$(printf '%s' "$EMAIL" | tr 'A-Z' 'a-z')" "$HASH" | base64 | tr -d '\n')"
JS='const {Client}=require(process.env.PGMOD||"/app/backend/node_modules/pg");(async()=>{const p=JSON.parse(Buffer.from(process.env.P,"base64").toString());const c=new Client({connectionString:process.env.DATABASE_URL});await c.connect();const r=await c.query("update \"User\" set \"passwordHash\"=$1 where lower(email)=$2 and \"isActive\"=true returning email",[p.h,p.e]);await c.query("update \"RefreshToken\" set \"revokedAt\"=now() where \"userId\" in (select id from \"User\" where lower(email)=$1) and \"revokedAt\" is null",[p.e]).catch(()=>{});console.log(r.rowCount===1?"YANGILANDI":"TOPILMADI (email yoki faol emas)");await c.end()})().catch(e=>{console.error("XATO:",e.message);process.exit(1)})'
if [ "$MODE" = "--local" ]; then
  export DATABASE_URL="${DATABASE_URL:-$(grep ^DATABASE_URL "$ROOT/backend/.env" | cut -d= -f2- | tr -d '"')}"
  OUT="$(PGMOD="$ROOT/backend/node_modules/pg" P="$PAYLOAD" node -e "$JS")"
else
  OUT="$(railway ssh --service crm -- env "P=$PAYLOAD" node -e "$JS")"
fi
echo "$OUT"
if echo "$OUT" | grep -q YANGILANDI; then
  printf 'cloncrm.uz vaqtinchalik parol (kirgach darrov o'"'"'zgartiring)\nemail: %s\nparol: %s\n' "$EMAIL" "$PW" > "$HOME/cloncrm-vaqtinchalik-parol.txt"
  echo "Parol fayliga yozildi: $HOME/cloncrm-vaqtinchalik-parol.txt  (ochish: cat ~/cloncrm-vaqtinchalik-parol.txt)"
fi
