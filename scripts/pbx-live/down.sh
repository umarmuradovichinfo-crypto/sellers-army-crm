#!/usr/bin/env bash
docker rm -f crm-ast-live >/dev/null 2>&1 || true
lsof -ti tcp:8031 | xargs kill 2>/dev/null || true
echo "to'xtatildi"
