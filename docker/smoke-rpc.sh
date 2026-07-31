#!/usr/bin/env bash
set -euo pipefail

BASE="${EPITON_BASE:-http://127.0.0.1:8000}"
DB="${EPITON_DB:-epiton_lab}"

echo "Probing $BASE/$DB/ (expect 401 without session — means RPC route is alive)"
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$BASE/$DB/" \
  -H 'Content-Type: application/json' \
  -d '{"id":1,"method":"common.server.version","params":[]}' || true)

if [[ "$code" == "401" || "$code" == "200" ]]; then
  echo "Lab RPC reachable (HTTP $code)."
  exit 0
fi

echo "Unexpected HTTP $code from lab RPC"
exit 1
