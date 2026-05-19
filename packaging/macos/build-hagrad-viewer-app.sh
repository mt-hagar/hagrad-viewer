#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PYTHON_BIN="${PYTHON:-python3}"
VENV_DIR="$ROOT/dist/packaging-venv/macos"
DIST_DIR="$ROOT/dist/macos"
WORK_DIR="$ROOT/dist/pyinstaller-work/macos"
SPEC_DIR="$ROOT/dist/pyinstaller-spec/macos"
COLLECT_PATH="$DIST_DIR/HAGRad Viewer"
APP_PATH="$DIST_DIR/HAGRad Viewer.app"
DMG_PATH="$ROOT/dist/HAGRad-Viewer-macOS.dmg"
SIGN_IDENTITY=""
SKIP_DMG=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sign-identity)
      SIGN_IDENTITY="${2:-}"
      shift 2
      ;;
    --skip-dmg)
      SKIP_DMG=1
      shift
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

if [[ ! -d "$VENV_DIR" ]]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/python" -m pip install --upgrade pip pyinstaller

rm -rf "$APP_PATH" "$COLLECT_PATH"
mkdir -p "$DIST_DIR" "$WORK_DIR" "$SPEC_DIR"

DATA_ARGS=(
  --add-data "$ROOT/src:src"
  --add-data "$ROOT/vendor:vendor"
  --add-data "$ROOT/assets:assets"
  --add-data "$ROOT/scripts/serve_https.py:scripts"
  --add-data "$ROOT/scripts/run_eat_backend_pipeline.py:scripts"
  --add-data "$ROOT/README.md:."
  --add-data "$ROOT/DISCLAIMER.md:."
  --add-data "$ROOT/LICENSE:."
  --add-data "$ROOT/LICENSE.md:."
  --add-data "$ROOT/CITATION.cff:."
  --add-data "$ROOT/RELEASE_NOTES.md:."
  --add-data "$ROOT/help.html:."
)

"$VENV_DIR/bin/python" -m PyInstaller \
  --noconfirm \
  --clean \
  --windowed \
  --name "HAGRad Viewer" \
  --icon "$ROOT/assets/hagrad-palm-icon.icns" \
  --distpath "$DIST_DIR" \
  --workpath "$WORK_DIR" \
  --specpath "$SPEC_DIR" \
  "${DATA_ARGS[@]}" \
  "$ROOT/packaging/launcher/hagrad_viewer_app.py"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Expected app was not created: $APP_PATH" >&2
  exit 1
fi

rm -rf "$COLLECT_PATH"

if [[ -n "$SIGN_IDENTITY" ]]; then
  codesign --force --deep --options runtime --timestamp --sign "$SIGN_IDENTITY" "$APP_PATH"
fi

if [[ "$SKIP_DMG" -eq 0 ]]; then
  rm -f "$DMG_PATH"
  hdiutil create -volname "HAGRad Viewer" -srcfolder "$APP_PATH" -ov -format UDZO "$DMG_PATH"
  if [[ -n "$SIGN_IDENTITY" ]]; then
    codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG_PATH"
  fi
fi

echo "Created $APP_PATH"
if [[ "$SKIP_DMG" -eq 0 ]]; then
  echo "Created $DMG_PATH"
fi
