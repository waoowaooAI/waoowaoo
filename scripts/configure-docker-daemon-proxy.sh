#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/configure-docker-daemon-proxy.sh <proxy-url>

Or set env:
  PROXY_ADDR=<proxy-url> scripts/configure-docker-daemon-proxy.sh

Optional env:
  NO_PROXY     Override NO_PROXY list
  SKIP_PULL=1  Skip docker pull smoke check

Notes:
  - This script only supports Linux hosts running systemd + Docker Engine service (docker.service).
  - It intentionally fails on Docker Desktop, rootless Docker, and non-systemd environments.
EOF
}

die() {
  echo "[docker-proxy] $*" >&2
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ "$#" -gt 1 ]]; then
  usage
  die "too many arguments"
fi

PROXY_ADDR="${1:-${PROXY_ADDR:-}}"
NO_PROXY="${NO_PROXY:-localhost,127.0.0.1,localaddress,.localdomain.com}"

if [[ -z "$PROXY_ADDR" ]]; then
  usage
  die "missing proxy address; pass it as arg or PROXY_ADDR env"
fi

if [[ ! "$PROXY_ADDR" =~ ^https?://[^[:space:]]+$ ]]; then
  die "invalid proxy address: $PROXY_ADDR"
fi

if ! command -v systemctl >/dev/null 2>&1; then
  die "systemctl not found; unsupported environment"
fi

if ! command -v docker >/dev/null 2>&1; then
  die "docker CLI not found; install Docker first"
fi

if [[ "$(ps -p 1 -o comm= 2>/dev/null || true)" != "systemd" ]]; then
  die "PID 1 is not systemd; unsupported environment"
fi

if ! systemctl show docker >/dev/null 2>&1; then
  die "docker.service is not available; this script only supports systemd-managed Docker Engine"
fi

echo "[docker-proxy] applying proxy to docker.service"
echo "[docker-proxy] HTTP(S)_PROXY=$PROXY_ADDR"
echo "[docker-proxy] NO_PROXY=$NO_PROXY"

sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/http-proxy.conf >/dev/null <<EOF
[Service]
Environment="HTTP_PROXY=${PROXY_ADDR}"
Environment="HTTPS_PROXY=${PROXY_ADDR}"
Environment="FTP_PROXY=${PROXY_ADDR}"
Environment="NO_PROXY=${NO_PROXY}"
EOF

sudo systemctl daemon-reload
sudo systemctl restart docker
sudo systemctl show --property=Environment docker

if [[ "${SKIP_PULL:-0}" != "1" ]]; then
  echo "[docker-proxy] running smoke check: docker pull mysql:8.0"
  docker pull mysql:8.0
fi

echo "[docker-proxy] done"
