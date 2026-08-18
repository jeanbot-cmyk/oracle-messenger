#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env}"
API_URL="${API_URL:-${BACKEND_URL:-}}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
else
  echo "BLOCKED: env file not found: $ENV_FILE"
  echo "Create it from .env.example and replace all placeholder secrets."
  exit 1
fi

failures=()

require_value() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    failures+=("$name is empty")
    return
  fi
  if [[ "$value" == replace_with_* || "$value" == your_* || "$value" == changeme* || "$value" == oracle_livekit_key || "$value" == oracle_turn_user ]]; then
    failures+=("$name still contains a placeholder value")
  fi
}

require_value ORACLE_STRICT_REALTIME
require_value REDIS_URL
require_value TURN_PUBLIC_IP
require_value TURN_URLS
require_value TURN_USERNAME
require_value TURN_CREDENTIAL
require_value LIVEKIT_URL
require_value LIVEKIT_PUBLIC_IP
require_value LIVEKIT_API_KEY
require_value LIVEKIT_API_SECRET

extract_hosts() {
  node -e "
    const input = process.argv[1] || '';
    const hosts = new Set();
    for (const raw of input.split(',')) {
      const value = raw.trim();
      if (!value) continue;
      const turnMatch = value.match(/^turns?:([^:?/]+)(?::\\d+)?(?:[?/]|$)/i);
      if (turnMatch?.[1]) {
        hosts.add(turnMatch[1]);
        continue;
      }
      try {
        const normalized = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : 'https://' + value;
        const url = new URL(normalized);
        if (url.hostname) hosts.add(url.hostname);
      } catch {}
    }
    for (const host of hosts) console.log(host);
  " "$1"
}

require_dns() {
  local host="$1"
  local expected_ip="${2:-}"
  [[ -z "$host" ]] && return
  if ! resolved="$(getent hosts "$host" | awk '{print $1; exit}')"; then
    failures+=("DNS missing: $host does not resolve")
    return
  fi
  if [[ -z "$resolved" ]]; then
    failures+=("DNS missing: $host does not resolve")
    return
  fi
  if [[ -n "$expected_ip" && "$resolved" != "$expected_ip" ]]; then
    failures+=("DNS mismatch: $host resolves to $resolved, expected $expected_ip")
  fi
}

if [[ "${ORACLE_STRICT_REALTIME:-}" != "true" ]]; then
  failures+=("ORACLE_STRICT_REALTIME must be true for WhatsApp-like strict mode")
fi

if [[ "${ALLOW_PUBLIC_TURN_FALLBACK:-false}" == "true" ]]; then
  failures+=("ALLOW_PUBLIC_TURN_FALLBACK must be false in production")
fi

while IFS= read -r turn_host; do
  require_dns "$turn_host" "${TURN_PUBLIC_IP:-}"
done < <(extract_hosts "${TURN_URLS:-}")

while IFS= read -r livekit_host; do
  require_dns "$livekit_host" "${LIVEKIT_PUBLIC_IP:-}"
done < <(extract_hosts "${LIVEKIT_URL:-}")

if [[ "${TURN_URLS:-}" == *"turns:"* && "${TURN_TLS_TERMINATED_BY_PROXY:-false}" != "true" ]]; then
  for cert_var in TURN_TLS_CERT_HOST_PATH TURN_TLS_KEY_HOST_PATH; do
    cert_path="${!cert_var:-}"
    if [[ -z "$cert_path" ]]; then
      failures+=("$cert_var is required because TURN_URLS contains turns:")
      continue
    fi
    [[ "$cert_path" != /* ]] && cert_path="$ROOT_DIR/$cert_path"
    if [[ ! -s "$cert_path" ]]; then
      failures+=("$cert_var file is missing or empty: $cert_path")
    fi
  done
  tls_cert="${TURN_TLS_CERT_HOST_PATH:-}"
  [[ "$tls_cert" != /* ]] && tls_cert="$ROOT_DIR/$tls_cert"
  if [[ -s "$tls_cert" ]]; then
    if ! openssl x509 -in "$tls_cert" -noout >/tmp/oracle-turn-cert-check.err 2>&1; then
      failures+=("TURN TLS certificate is not a valid x509 certificate: $(tr '\n' ' ' </tmp/oracle-turn-cert-check.err)")
    elif ! openssl x509 -in "$tls_cert" -checkend 604800 -noout >/tmp/oracle-turn-cert-expiry.err 2>&1; then
      failures+=("TURN TLS certificate expires in less than 7 days or is expired")
    fi
  fi
fi

if [[ -z "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  firebase_path="${FIREBASE_ADMIN_HOST_PATH:-$ROOT_DIR/.secrets/firebase-admin.json}"
  [[ "$firebase_path" != /* ]] && firebase_path="$ROOT_DIR/$firebase_path"
  if [[ ! -s "$firebase_path" ]]; then
    failures+=("Firebase service account missing: set FIREBASE_SERVICE_ACCOUNT_JSON or provide FIREBASE_ADMIN_HOST_PATH")
  elif ! jq -e '.project_id and .client_email and .private_key' "$firebase_path" >/dev/null 2>&1; then
    failures+=("Firebase service account JSON is invalid or incomplete: $firebase_path")
  fi
elif ! jq -e '.project_id and .client_email and .private_key' <<<"$FIREBASE_SERVICE_ACCOUNT_JSON" >/dev/null 2>&1; then
  failures+=("FIREBASE_SERVICE_ACCOUNT_JSON is invalid or incomplete")
fi

if [[ -n "${LIVEKIT_UDP_START:-}" && -n "${LIVEKIT_UDP_END:-}" ]]; then
  if (( LIVEKIT_UDP_END < LIVEKIT_UDP_START )); then
    failures+=("LIVEKIT_UDP_END must be greater than or equal to LIVEKIT_UDP_START")
  fi
fi

if ! docker compose -f "$ROOT_DIR/docker-compose.yml" config >/tmp/oracle-realtime-compose-check.yml 2>/tmp/oracle-realtime-compose-check.err; then
  failures+=("docker compose config failed: $(tr '\n' ' ' </tmp/oracle-realtime-compose-check.err)")
fi

if [[ -n "$API_URL" ]]; then
  realtime_response="$(curl -fsS "$API_URL/health/realtime" 2>/tmp/oracle-realtime-health.err || true)"
  if [[ -z "$realtime_response" ]]; then
    failures+=("cannot reach $API_URL/health/realtime: $(tr '\n' ' ' </tmp/oracle-realtime-health.err)")
  elif ! grep -q '"industrialReady":true' <<<"$realtime_response"; then
    failures+=("$API_URL/health/realtime does not report industrialReady=true")
    echo "$realtime_response"
  fi
fi

if [[ "${REQUIRE_PUBLIC_NETWORK_READY:-true}" == "true" ]]; then
  if ! "$ROOT_DIR/scripts/realtime-network-audit.sh" "$ENV_FILE" >/tmp/oracle-realtime-network-audit.out 2>&1; then
    failures+=("public realtime network audit failed")
    while IFS= read -r line; do
      failures+=("network: $line")
    done </tmp/oracle-realtime-network-audit.out
  fi
fi

if (( ${#failures[@]} )); then
  echo "REALTIME PRODUCTION PREFLIGHT: BLOCKED"
  for failure in "${failures[@]}"; do
    echo "- $failure"
  done
  exit 1
fi

echo "REALTIME PRODUCTION PREFLIGHT: OK"
echo "- Redis configured"
echo "- Strict realtime mode enabled"
echo "- Private TURN configured"
echo "- LiveKit/SFU configured"
echo "- Firebase push configured"
