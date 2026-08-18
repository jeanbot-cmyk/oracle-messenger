#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env}"
EXAMPLE_FILE="$ROOT_DIR/.env.example"

if [[ ! -f "$EXAMPLE_FILE" ]]; then
  echo "BLOCKED: missing $EXAMPLE_FILE"
  exit 1
fi

secret_hex() {
  openssl rand -hex "${1:-32}"
}

secret_b64url() {
  openssl rand -base64 "${1:-32}" | tr '+/' '-_' | tr -d '=\n'
}

upsert_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    local escaped
    escaped="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"
    sed -i "s/^${key}=.*/${key}=${escaped}/" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$ENV_FILE"
  fi
}

current_value() {
  grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true
}

is_placeholder() {
  local value="$1"
  [[ -z "$value" || "$value" == replace_with_* || "$value" == your_* || "$value" == changeme* || "$value" == oracle_livekit_key || "$value" == oracle_turn_user || "$value" == sk-your_* || "$value" == AIza-your_* ]]
}

ensure_secret() {
  local key="$1"
  local generator="$2"
  local value
  value="$(current_value "$key")"
  if is_placeholder "$value"; then
    upsert_env "$key" "$($generator)"
    echo "- generated $key"
  else
    echo "- kept $key"
  fi
}

if [[ ! -f "$ENV_FILE" ]]; then
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  echo "Created $ENV_FILE from .env.example"
else
  echo "Using existing $ENV_FILE"
fi

mkdir -p "$ROOT_DIR/.secrets/firebase-admin.json.d" "$ROOT_DIR/.secrets/turn"

ensure_secret POSTGRES_PASSWORD "secret_b64url"
ensure_secret JWT_SECRET "secret_b64url"
ensure_secret NEXTAUTH_SECRET "secret_b64url"
ensure_secret TURN_USERNAME "secret_b64url"
ensure_secret TURN_CREDENTIAL "secret_b64url"
ensure_secret LIVEKIT_API_KEY "secret_b64url"
ensure_secret LIVEKIT_API_SECRET "secret_b64url"

upsert_env ORACLE_STRICT_REALTIME true
upsert_env REQUIRE_PUBLIC_NETWORK_READY true
upsert_env REDIS_URL redis://redis:6379
upsert_env TURN_REALM oracle-messenger
turn_public_ip="${TURN_PUBLIC_IP:-180.149.196.5}"
upsert_env TURN_PUBLIC_IP "$turn_public_ip"
if getent hosts turn.oracle-plus.online >/dev/null 2>&1; then
  upsert_env TURN_URLS "${TURN_URLS:-turn:turn.oracle-plus.online:3478,turns:turn.oracle-plus.online:5349}"
else
  upsert_env TURN_URLS "${TURN_URLS:-turn:${turn_public_ip}:3478}"
fi
upsert_env LIVEKIT_URL "${LIVEKIT_URL:-wss://livekit.oracle-plus.online}"
upsert_env LIVEKIT_PUBLIC_IP "${LIVEKIT_PUBLIC_IP:-180.149.196.5}"
upsert_env LIVEKIT_UDP_START "${LIVEKIT_UDP_START:-50000}"
upsert_env LIVEKIT_UDP_END "${LIVEKIT_UDP_END:-50100}"
upsert_env ALLOW_PUBLIC_TURN_FALLBACK false

if [[ -f /etc/letsencrypt/live/turn.oracle-plus.online/fullchain.pem ]]; then
  upsert_env TURN_TLS_DIR_HOST_PATH /etc/letsencrypt/live/turn.oracle-plus.online
  upsert_env TURN_TLS_CERT_HOST_PATH /etc/letsencrypt/live/turn.oracle-plus.online/fullchain.pem
else
  upsert_env TURN_TLS_DIR_HOST_PATH "$ROOT_DIR/.secrets/turn"
  upsert_env TURN_TLS_CERT_HOST_PATH "$ROOT_DIR/.secrets/turn/fullchain.pem"
fi

if [[ -f /etc/letsencrypt/live/turn.oracle-plus.online/privkey.pem ]]; then
  upsert_env TURN_TLS_KEY_HOST_PATH /etc/letsencrypt/live/turn.oracle-plus.online/privkey.pem
else
  upsert_env TURN_TLS_KEY_HOST_PATH "$ROOT_DIR/.secrets/turn/privkey.pem"
fi

if [[ -f "$ROOT_DIR/.secrets/firebase-admin.json" ]]; then
  upsert_env FIREBASE_ADMIN_HOST_PATH "$ROOT_DIR/.secrets/firebase-admin.json"
else
  upsert_env FIREBASE_ADMIN_HOST_PATH "$ROOT_DIR/.secrets/firebase-admin.json"
fi
upsert_env GOOGLE_APPLICATION_CREDENTIALS /run/secrets/firebase-admin.json

echo "Bootstrap complete: $ENV_FILE"
echo "Run: scripts/realtime-production-preflight.sh $ENV_FILE"
