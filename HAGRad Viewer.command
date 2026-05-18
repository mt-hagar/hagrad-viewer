#!/bin/zsh
set -e

PACKAGE_ROOT="$(cd "$(dirname "$0")" && pwd)"
HAGRAD_ROOT="$PACKAGE_ROOT"

if [[ -d "$PACKAGE_ROOT/HAGRad_Runtime" ]]; then
  HAGRAD_ROOT="$PACKAGE_ROOT/HAGRad_Runtime"
fi

cd "$HAGRAD_ROOT"

if [[ ! -f ".cert/localhost.pem" || ! -f ".cert/localhost-key.pem" ]]; then
  echo "HAGRad Viewer first-run setup"
  echo "Creating a local HTTPS certificate before opening the viewer..."
  echo
  ./make-local-cert.command
fi

./open-viewer.command
