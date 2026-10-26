#!/usr/bin/env bash
# OYLIK MASHQ (egasining kompyuterida, maxfiy kalit bilan): oxirgi zaxirani vaqtinchalik bazaga tiklab, jadval/qator sonini ko'rsatadi.
# Ishlatish:  ./restore-drill.sh <mijoz-nomi> <age-maxfiy-kalit-fayli>
# Talab: age, rclone, psql/pg_restore (lokal Postgres), .env ichida RCLONE_REMOTE. Natija: «TIKLANDI» yoki xato.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
NAME="${1:?mijoz nomi}"; KEY="${2:?age maxfiy kalit fayli}"
LAST="$(rclone lsf "$RCLONE_REMOTE/daily/$NAME" | sort | tail -1)"
[ -n "$LAST" ] || { echo "Zaxira topilmadi"; exit 1; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"; dropdb --if-exists "drill_$$" >/dev/null 2>&1 || true' EXIT
rclone copyto "$RCLONE_REMOTE/daily/$NAME/$LAST" "$TMP/dump.age"
age -d -i "$KEY" -o "$TMP/dump" "$TMP/dump.age"
createdb "drill_$$"
pg_restore --no-owner -d "drill_$$" "$TMP/dump"
echo "Zaxira: $LAST"
psql -d "drill_$$" -Atc "select 'jadvallar: '||count(*) from information_schema.tables where table_schema='public'"
psql -d "drill_$$" -Atc "select 'bitimlar: '||count(*) from leads"
psql -d "drill_$$" -Atc "select 'foydalanuvchilar: '||count(*) from \"User\"" 2>/dev/null || psql -d "drill_$$" -Atc "select 'foydalanuvchilar: '||count(*) from users"
echo "TIKLANDI"
