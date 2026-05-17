#!/bin/zsh
set -e

cd "$(dirname "$0")"

LISTENING_PIDS=$(lsof -tiTCP:3020 -sTCP:LISTEN || true)
if [[ -n "$LISTENING_PIDS" ]]; then
  for pid in ${(f)LISTENING_PIDS}; do
    kill "$pid" >/dev/null 2>&1 || true
  done
  sleep 1
fi

python3 scripts/serve_https.py
