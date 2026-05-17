#!/bin/zsh
set -e

cd "$(dirname "$0")"
mkdir -p .cert

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout .cert/localhost-key.pem \
  -out .cert/localhost.pem \
  -days 3650 \
  -subj "/CN=localhost"

security add-trusted-cert -d -r trustRoot -k ~/Library/Keychains/login.keychain-db .cert/localhost.pem || true

echo
echo "Local certificate created."
echo "If macOS asks for permission, allow it."
echo "Next, double-click start-server.command"
read -k "?Press any key to close..."
echo
