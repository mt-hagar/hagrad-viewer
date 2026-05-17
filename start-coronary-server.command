#!/bin/zsh
set -e

cd "$(dirname "$0")"
python3 scripts/serve_coronary_https.py
