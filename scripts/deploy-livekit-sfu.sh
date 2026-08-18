#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV_FILE="${LIVEKIT_ENV_FILE:-$ROOT_DIR/.secrets/livekit.env}"
if [[ -f "$LOCAL_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$LOCAL_ENV_FILE"
  set +a
fi

DOMAIN="${LIVEKIT_DOMAIN:-${1:-livekit.oracle-plus.online}}"
PUBLIC_IP="${LIVEKIT_PUBLIC_IP:-${2:-180.149.196.5}}"
API_KEY="${LIVEKIT_API_KEY:-}"
API_SECRET="${LIVEKIT_API_SECRET:-}"
UDP_START="${LIVEKIT_UDP_START:-50000}"
UDP_END="${LIVEKIT_UDP_END:-50100}"
TCP_RTC_PORT="${LIVEKIT_TCP_RTC_PORT:-7881}"
HTTP_PORT="${LIVEKIT_HTTP_PORT:-7880}"
CONTAINER_NAME="${LIVEKIT_CONTAINER_NAME:-oracle-messenger-livekit}"
NETWORK="${LIVEKIT_DOCKER_NETWORK:-bridge}"
USE_PROXY_LABELS="${LIVEKIT_USE_PROXY_LABELS:-0}"

if [[ -z "$API_KEY" || -z "$API_SECRET" ]]; then
  echo "Set LiveKit API key and API secret in the environment before running this script."
  echo "Example:"
  echo "  export LIVEKIT_API_KEY=oracle_$(date +%s)"
  echo "  export LIVEKIT_API_SECRET from a secure shell history-disabled source, then run: $0 $DOMAIN $PUBLIC_IP"
  exit 1
fi

if ! getent hosts "$DOMAIN" >/dev/null 2>&1; then
  echo "DNS missing: $DOMAIN does not resolve from this machine."
  echo "Create an A record: $DOMAIN -> $PUBLIC_IP, then rerun."
  exit 1
fi

resolved="$(getent hosts "$DOMAIN" | awk '{print $1; exit}')"
if [[ "$resolved" != "$PUBLIC_IP" ]]; then
  echo "DNS mismatch: $DOMAIN resolves to $resolved, expected $PUBLIC_IP."
  exit 1
fi

mkdir -p /opt/oracle-messenger-livekit
cat >/opt/oracle-messenger-livekit/livekit.yaml <<YAML
port: ${HTTP_PORT}
bind_addresses:
  - "0.0.0.0"

rtc:
  tcp_port: ${TCP_RTC_PORT}
  port_range_start: ${UDP_START}
  port_range_end: ${UDP_END}
  use_external_ip: false

keys:
  ${API_KEY}: ${API_SECRET}

logging:
  level: info
YAML

docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker_args=(
  -d
  --name "$CONTAINER_NAME"
  --restart unless-stopped
)

if [[ "$NETWORK" != "host" ]]; then
  docker_args+=(
    --network "$NETWORK"
    -p "${HTTP_PORT}:${HTTP_PORT}/tcp"
    -p "${TCP_RTC_PORT}:${TCP_RTC_PORT}/tcp"
    -p "${UDP_START}-${UDP_END}:${UDP_START}-${UDP_END}/udp"
  )
else
  docker_args+=(--network host)
fi

if [[ "$USE_PROXY_LABELS" == "1" ]]; then
  docker_args+=(
    --label "caddy_0=https://${DOMAIN}"
    --label "caddy_0.encode=zstd gzip"
    --label "caddy_0.reverse_proxy={{upstreams ${HTTP_PORT}}}"
    --label "caddy_ingress_network=${NETWORK}"
    --label "traefik.enable=true"
    --label "traefik.http.middlewares.gzip.compress=true"
    --label "traefik.http.middlewares.redirect-to-https.redirectscheme.scheme=https"
    --label "traefik.http.routers.http-livekit.entryPoints=http"
    --label "traefik.http.routers.http-livekit.middlewares=redirect-to-https"
    --label "traefik.http.routers.http-livekit.rule=Host(\`${DOMAIN}\`)"
    --label "traefik.http.routers.http-livekit.service=http-livekit"
    --label "traefik.http.routers.https-livekit.entryPoints=https"
    --label "traefik.http.routers.https-livekit.middlewares=gzip"
    --label "traefik.http.routers.https-livekit.rule=Host(\`${DOMAIN}\`)"
    --label "traefik.http.routers.https-livekit.service=https-livekit"
    --label "traefik.http.routers.https-livekit.tls=true"
    --label "traefik.http.routers.https-livekit.tls.certresolver=letsencrypt"
    --label "traefik.http.services.http-livekit.loadbalancer.server.port=${HTTP_PORT}"
    --label "traefik.http.services.https-livekit.loadbalancer.server.port=${HTTP_PORT}"
  )
fi

docker_args+=(
  -v /opt/oracle-messenger-livekit/livekit.yaml:/livekit.yaml:ro
  livekit/livekit-server:latest
  --config /livekit.yaml
  --node-ip "${PUBLIC_IP}"
)

docker run "${docker_args[@]}"

if [[ "$USE_PROXY_LABELS" == "1" ]]; then
  echo "LiveKit started behind proxy for wss://${DOMAIN}"
  echo "Configure backend:"
  echo "  LIVEKIT_URL=wss://${DOMAIN}"
else
  echo "LiveKit started in direct Docker mode on ${DOMAIN}:${HTTP_PORT}"
  echo "Configure backend with a TLS proxy as LIVEKIT_URL=wss://${DOMAIN}, or without TLS as:"
  echo "  LIVEKIT_URL=ws://${DOMAIN}:${HTTP_PORT}"
fi
echo "  LIVEKIT_API_KEY=${API_KEY}"
echo "  LiveKit API secret: keep the same value in the backend secret store."
