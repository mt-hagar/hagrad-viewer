#!/bin/zsh
set -e

cd "$(dirname "$0")"

SERVER_URL="https://localhost:3020"
HEALTH_URL="$SERVER_URL/api/export-studies"
SERVER_LOG="${TMPDIR:-/tmp}/hagrad-qca-server.log"
SERVER_LOG="${TMPDIR:-/tmp}/hagrad-qca-server.log"

server_ready() {
  curl -ks --max-time 2 "$HEALTH_URL" >/dev/null 2>&1
}

start_server_background() {
  nohup zsh ./start-server.command >"$SERVER_LOG" 2>&1 &
}

restart_server_background() {
  nohup zsh ./restart-server.command >"$SERVER_LOG" 2>&1 &
}

wait_for_server() {
  local attempts="${1:-20}"
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
  start_server_background
  wait_for_server 30 0.5 || true
elif ! server_ready; then
  restart_server_background
  wait_for_server 30 0.5 || true
fi

if server_ready; then
  open "$SERVER_URL/src/qca/index.html"
else
  echo "QCA server did not become ready at $HEALTH_URL."
  echo "Server log: $SERVER_LOG"
  echo "Try running ./start-server.command manually and check the log above for errors."
  read -k "?Press any key to close..."
  echo
  exit 1
fi
