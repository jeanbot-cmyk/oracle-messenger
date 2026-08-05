#!/usr/bin/env bash
set -euo pipefail

API_URL="${1:-${NEXT_PUBLIC_BACKEND_URL:-https://api-messenger.oracle-plus.online}}"
TOKEN="${BACKEND_TOKEN:-}"

if [[ -z "$TOKEN" ]]; then
  echo "Set BACKEND_TOKEN to a valid user backend JWT before running this check."
  exit 1
fi

curl -fsS -X POST "$API_URL/calls/sfu-token" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"room":"sfu-preflight"}' | jq .
