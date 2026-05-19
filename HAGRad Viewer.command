#!/bin/zsh
set -e

PACKAGE_ROOT="$(cd "$(dirname "$0")" && pwd)"
HAGRAD_ROOT="$PACKAGE_ROOT"
LAUNCHER_NAME="$(basename "$0")"

if [[ -d "$PACKAGE_ROOT/HAGRad_support_files" ]]; then
  HAGRAD_ROOT="$PACKAGE_ROOT/HAGRad_support_files"
elif [[ -d "$PACKAGE_ROOT/HAGRad_Runtime" ]]; then
  HAGRAD_ROOT="$PACKAGE_ROOT/HAGRad_Runtime"
fi

create_desktop_app() {
  local app_path="$HOME/Desktop/HAGRad Viewer.app"
  local icon_path="$HAGRAD_ROOT/assets/hagrad-palm-icon.icns"
  local marker_path="$app_path/Contents/Resources/HAGRadPackageRoot.txt"
  local support_marker_path="$app_path/Contents/Resources/HAGRadSupportRoot.txt"
  local launcher_marker_path="$app_path/Contents/Resources/HAGRadLauncherName.txt"
  local template_marker_path="$app_path/Contents/Resources/HAGRadLauncherTemplateVersion.txt"
  local template_version="3"

  if [[ ! -f "$icon_path" ]]; then
    return 0
  fi

  if [[ -x "$app_path/Contents/MacOS/hagrad-viewer" ]] &&
    [[ -f "$marker_path" ]] &&
    [[ "$(cat "$marker_path" 2>/dev/null)" == "$PACKAGE_ROOT" ]] &&
    [[ "$(cat "$template_marker_path" 2>/dev/null)" == "$template_version" ]]; then
    return 0
  fi

  mkdir -p "$app_path/Contents/MacOS" "$app_path/Contents/Resources"
  cp "$icon_path" "$app_path/Contents/Resources/AppIcon.icns"

  cat > "$app_path/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>HAGRad Viewer</string>
  <key>CFBundleExecutable</key>
  <string>hagrad-viewer</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>org.hagrad.viewer.launcher</string>
  <key>CFBundleName</key>
  <string>HAGRad Viewer</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.9.0</string>
</dict>
</plist>
PLIST

  cat > "$app_path/Contents/MacOS/hagrad-viewer" <<'SCRIPT'
#!/bin/zsh
set +e

RESOURCE_DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
PACKAGE_ROOT="$(cat "$RESOURCE_DIR/HAGRadPackageRoot.txt" 2>/dev/null)"
HAGRAD_ROOT="$(cat "$RESOURCE_DIR/HAGRadSupportRoot.txt" 2>/dev/null)"
LAUNCHER_NAME="$(cat "$RESOURCE_DIR/HAGRadLauncherName.txt" 2>/dev/null)"

open_hagrad_folder() {
  if [[ -n "$PACKAGE_ROOT" && -d "$PACKAGE_ROOT" ]]; then
    open "$PACKAGE_ROOT"
  elif [[ -n "$HAGRAD_ROOT" && -d "$HAGRAD_ROOT" ]]; then
    open "$HAGRAD_ROOT"
  else
    open "$HOME/Desktop"
  fi

  osascript -e 'display dialog "HAGRad could not find the saved launcher file. I opened the HAGRad folder instead. Please double-click open-viewer-mac.command there." buttons {"OK"} default button "OK" with title "HAGRad Viewer"' >/dev/null 2>&1
}

open_launcher() {
  local launcher_path="$1"
  if [[ -n "$launcher_path" && -f "$launcher_path" ]]; then
    chmod +x "$launcher_path" >/dev/null 2>&1
    open "$launcher_path"
    exit 0
  fi
}

open_launcher "$PACKAGE_ROOT/$LAUNCHER_NAME"
open_launcher "$PACKAGE_ROOT/open-viewer-mac.command"
open_launcher "$PACKAGE_ROOT/HAGRad Viewer.command"
open_launcher "$HAGRAD_ROOT/HAGRad Viewer.command"
open_launcher "$HAGRAD_ROOT/open-viewer-mac.command"

open_hagrad_folder
exit 1
SCRIPT

  chmod +x "$app_path/Contents/MacOS/hagrad-viewer"
  printf "%s" "$PACKAGE_ROOT" > "$marker_path"
  printf "%s" "$HAGRAD_ROOT" > "$support_marker_path"
  printf "%s" "$LAUNCHER_NAME" > "$launcher_marker_path"
  printf "%s" "$template_version" > "$template_marker_path"
  echo "Created HAGRad Viewer.app on your Desktop."
}

create_desktop_app || true

cd "$HAGRAD_ROOT"

if [[ ! -f ".cert/localhost.pem" || ! -f ".cert/localhost-key.pem" ]]; then
  echo "HAGRad Viewer first-run setup"
  echo "Creating a local HTTPS certificate before opening the viewer..."
  echo
  ./make-local-cert.command
fi

SERVER_URL="https://localhost:3020"
HEALTH_URL="$SERVER_URL/api/export-studies"
VIEWER_URL="$SERVER_URL/src/viewer.html"

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

if ! lsof -iTCP:3020 -sTCP:LISTEN >/dev/null 2>&1; then
  open ./start-server.command
  wait_for_server || true
elif ! server_ready; then
  open ./restart-server.command
  wait_for_server || true
fi

if server_ready; then
  open "$VIEWER_URL"
else
  echo "HAGRad Viewer did not become ready at $HEALTH_URL."
  echo "Try running ./restart-server.command manually and keep that Terminal window open."
  read -k "?Press any key to close..."
  echo
  exit 1
fi
