#!/usr/bin/env bash
# Vaqt qoidasi 5100 ni ichki raqamdan terib, qaysi tarmoqqa (work → 101, off → 5120, holiday → 100) ketganini ko'rsatadi.
# Ishlatish: node flow.mjs time <rejim> && time-check.sh
set -euo pipefail
cd "$(dirname "$0")"
T0=$(date +%s)
./dtmf-call.sh 100 5100 "w5" 101 >/dev/null 2>&1 || true
sleep 1
docker logs --since $(( $(date +%s) - T0 + 1 ))s crm-ast-live 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "@m5100:" | cut -c1-170
