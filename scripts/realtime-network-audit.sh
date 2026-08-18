#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "BLOCKED: env file not found: $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

failures=()
warnings=()

extract_host_port() {
  node -e "
    const input = process.argv[1] || '';
    for (const raw of input.split(',')) {
      const value = raw.trim();
      if (!value) continue;
      const turn = value.match(/^(turns?):([^:?/]+)(?::(\\d+))?/i);
      if (turn?.[2]) {
        console.log([turn[2], turn[3] || (turn[1].toLowerCase() === 'turns' ? '5349' : '3478'), turn[1].toLowerCase()].join(' '));
        continue;
      }
      try {
        const url = new URL(value);
        console.log([url.hostname, url.port || (url.protocol === 'https:' || url.protocol === 'wss:' ? '443' : '80'), url.protocol.replace(':', '')].join(' '));
      } catch {}
    }
  " "$1"
}

tcp_check() {
  local host="$1"
  local port="$2"
  local label="$3"
  if tcp_check_result "$host" "$port"; then
    echo "OK tcp $label $host:$port"
  else
    failures+=("TCP unreachable: $label $host:$port")
  fi
}

tcp_check_result() {
  local host="$1"
  local port="$2"
  timeout 6 bash -c "</dev/tcp/$host/$port" >/dev/null 2>&1
}

dns_check() {
  local host="$1"
  local expected="${2:-}"
  local resolved
  resolved="$(getent hosts "$host" | awk '{print $1; exit}' || true)"
  if [[ -z "$resolved" ]]; then
    failures+=("DNS missing: $host")
    return
  fi
  echo "OK dns $host -> $resolved"
  if [[ -n "$expected" && "$resolved" != "$expected" ]]; then
    warnings+=("DNS $host resolves to $resolved but env expects $expected")
  fi
}

http_check() {
  local url="$1"
  local label="$2"
  local code
  code="$(curl -k -sS -o /tmp/oracle-network-audit-body -w '%{http_code}' --max-time 10 "$url" 2>/tmp/oracle-network-audit-curl.err || true)"
  if [[ "$code" =~ ^2|3 ]]; then
    echo "OK http $label $url status=$code"
  else
    failures+=("HTTP unreachable or bad status: $label $url status=${code:-none} $(tr '\n' ' ' </tmp/oracle-network-audit-curl.err)")
  fi
}

if [[ -n "${BACKEND_URL:-}" ]]; then
  http_check "${BACKEND_URL%/}/health" "backend-health"
  realtime_code="$(curl -k -sS -o /tmp/oracle-realtime-health-body -w '%{http_code}' --max-time 10 "${BACKEND_URL%/}/health/realtime" 2>/tmp/oracle-realtime-health-curl.err || true)"
  if [[ "$realtime_code" == "200" ]] && grep -q '"industrialReady":true' /tmp/oracle-realtime-health-body; then
    echo "OK http backend-realtime ${BACKEND_URL%/}/health/realtime industrialReady=true"
  else
    failures+=("Backend deployed realtime health not ready: ${BACKEND_URL%/}/health/realtime status=${realtime_code:-none}")
  fi
fi

if [[ -n "${LIVEKIT_URL:-}" ]]; then
  while read -r host port proto; do
    [[ -z "$host" ]] && continue
    dns_check "$host" "${LIVEKIT_PUBLIC_IP:-}"
    tcp_check "$host" "$port" "livekit-$proto"
    livekit_tcp_mux_port="${LIVEKIT_TCP_MUX_PORT:-7881}"
    if [[ "$port" != "$livekit_tcp_mux_port" ]]; then
      if tcp_check_result "$host" "$livekit_tcp_mux_port"; then
        echo "OK tcp livekit-tcp-mux $host:$livekit_tcp_mux_port"
      elif [[ "${TURN_URLS:-}" == *"turns:"* ]]; then
        warnings+=("TCP unreachable: livekit-tcp-mux $host:$livekit_tcp_mux_port; relying on TURN/TLS fallback")
      else
        failures+=("TCP unreachable: livekit-tcp-mux $host:$livekit_tcp_mux_port")
      fi
    fi
    if [[ "$proto" == "https" || "$proto" == "wss" ]]; then
      http_check "https://$host" "livekit-https"
    fi
  done < <(extract_host_port "$LIVEKIT_URL")
fi

if [[ -n "${TURN_URLS:-}" ]]; then
  turn_total=0
  turn_reachable=0
  while read -r host port proto; do
    [[ -z "$host" ]] && continue
    turn_total=$((turn_total + 1))
    if [[ "$host" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then
      echo "OK turn-host-ip $host"
    else
      dns_check "$host" "${TURN_PUBLIC_IP:-}"
    fi
    if tcp_check_result "$host" "$port"; then
      turn_reachable=$((turn_reachable + 1))
      echo "OK tcp turn-$proto $host:$port"
    else
      warnings+=("TCP unreachable: turn-$proto $host:$port")
    fi
  done < <(extract_host_port "$TURN_URLS")
  if (( turn_total > 0 && turn_reachable == 0 )); then
    failures+=("No TURN endpoint reachable from the public network")
  fi
fi

if (( ${#warnings[@]} )); then
  echo "REALTIME NETWORK AUDIT: WARNINGS"
  for warning in "${warnings[@]}"; do
    echo "- $warning"
  done
fi

if (( ${#failures[@]} )); then
  echo "REALTIME NETWORK AUDIT: BLOCKED"
  for failure in "${failures[@]}"; do
    echo "- $failure"
  done
  exit 1
fi

echo "REALTIME NETWORK AUDIT: OK"
