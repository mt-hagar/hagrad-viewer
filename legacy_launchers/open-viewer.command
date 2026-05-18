#!/bin/zsh
set -e

cd "$(dirname "$0")"

SERVER_URL="https://localhost:3020"
HEALTH_URL="$SERVER_URL/api/export-studies"

server_ready() {
  curl -ks --max-time 2 "$HEALTH_URL" >/dev/null 2>&1
}

wait_for_server() {
  local attempts="${1:-40}"
  local delay="${2:-0.5}"
  local i

  for ((i = 0; i < attempts; i += 1)); do
    if server_ready; then
      return 0
    fi
    sleep "$delay"
  done

  return 1
}

if [[ ! -f ".cert/localhost.pem" || ! -f ".cert/localhost-key.pem" ]]; then
  echo "Certificate files are missing."
  echo "Please run make-local-cert.command once first."
  read -k "?Press any key to close..."
  echo
  exit 1
fi

if ! lsof -iTCP:3020 -sTCP:LISTEN >/dev/null 2>&1; then
  open ./start-server.command
  wait_for_server || true
elif ! server_ready; then
  open ./restart-server.command
  wait_for_server || true
fi

if server_ready; then
  open "$SERVER_URL/src/viewer.html"
else
  echo "HAGRad Viewer did not become ready at $HEALTH_URL."
  echo "Try running ./restart-server.command manually and keep that Terminal window open."
  read -k "?Press any key to close..."
  echo
  exit 1
fi
