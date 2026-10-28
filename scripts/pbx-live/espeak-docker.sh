#!/usr/bin/env bash
# Jonli sinov: kompyuterda espeak-ng yo'q — CRM backend'i (ESPEAK_BIN=scripts/pbx-live/espeak-docker.sh) uni sinov konteyneridan chaqiradi.
# Argumentlar o'zgarmay uzatiladi (matn stdin'dan, wav stdout'ga).
exec docker exec -i crm-ast-live espeak-ng "$@"
