#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-turn.oracle-plus.online}"
EMAIL="${LETSENCRYPT_EMAIL:-admin@oracle-plus.online}"
WEBROOT="${LETSENCRYPT_WEBROOT:-/var/www/certbot}"
EXPECTED_IP="${TURN_PUBLIC_IP:-180.149.196.5}"

resolved="$(getent hosts "$DOMAIN" | awk '{print $1; exit}' || true)"
if [[ -z "$resolved" ]]; then
  echo "BLOCKED: DNS missing for $DOMAIN"
  echo "Create an A record: $DOMAIN -> $EXPECTED_IP"
  exit 1
fi

if [[ "$resolved" != "$EXPECTED_IP" ]]; then
  echo "BLOCKED: DNS mismatch for $DOMAIN"
  echo "Resolved: $resolved"
  echo "Expected: $EXPECTED_IP"
  exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
  echo "BLOCKED: certbot is not installed on this server."
  echo "Install certbot, then rerun this script."
  exit 1
fi

mkdir -p "$WEBROOT"
certbot certonly \
  --webroot \
  --webroot-path "$WEBROOT" \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$DOMAIN"

echo "TURN certificate ready:"
echo "- /etc/letsencrypt/live/$DOMAIN/fullchain.pem"
echo "- /etc/letsencrypt/live/$DOMAIN/privkey.pem"
