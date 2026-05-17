#!/bin/zsh
set -e

cd "$(dirname "$0")"

echo "HAGRad GitHub Release Publisher"
echo
echo "This publishes the clean research-preview source and attaches the release zip."
echo "It requires GitHub CLI: gh"
echo
read "REPO?GitHub repository (OWNER/REPOSITORY, e.g. yourname/hagrad-viewer): "
if [[ -z "$REPO" ]]; then
  echo "No repository provided."
  read -k "?Press any key to close..."
  echo
  exit 1
fi

python3 scripts/publish_github_release.py --repo "$REPO" --visibility public

echo
read -k "?Done. Press any key to close..."
echo
