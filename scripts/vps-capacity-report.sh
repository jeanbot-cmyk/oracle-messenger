#!/usr/bin/env bash
set -euo pipefail

echo "== Oracle Messenger VPS Capacity Report =="
date -u +"UTC: %Y-%m-%dT%H:%M:%SZ"
echo

echo "== Host =="
hostname || true
uname -a || true
echo

echo "== CPU =="
if command -v nproc >/dev/null 2>&1; then
  echo "CPU cores: $(nproc)"
fi
if [[ -r /proc/loadavg ]]; then
  awk '{print "Load average: "$1" "$2" "$3}' /proc/loadavg
fi
echo

echo "== Memory =="
free -h || true
echo

echo "== Disk =="
df -hT / /var/lib/docker 2>/dev/null || df -hT
echo

echo "== Docker containers =="
if command -v docker >/dev/null 2>&1; then
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' || true
else
  echo "Docker not installed."
fi
echo

echo "== Docker resource usage =="
if command -v docker >/dev/null 2>&1; then
  docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}' || true
fi
echo

echo "== Network ports =="
if command -v ss >/dev/null 2>&1; then
  ss -tulen 2>/dev/null | awk 'NR==1 || /:80 |:443 |:3000 |:3001 |:3478 |:7880 |:7881 /'
else
  netstat -tulen 2>/dev/null || true
fi
echo

echo "== Public health checks =="
for url in \
  "https://messenger.oracle-plus.online" \
  "https://api-messenger.oracle-plus.online/health" \
  "https://livekit.oracle-plus.online"
do
  code="$(curl -k -sS -o /dev/null -w '%{http_code}' "$url" || true)"
  echo "$url -> $code"
done
