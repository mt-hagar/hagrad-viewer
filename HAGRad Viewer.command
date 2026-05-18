#!/bin/zsh
set -e

PACKAGE_ROOT="$(cd "$(dirname "$0")" && pwd)"
HAGRAD_ROOT="$PACKAGE_ROOT"

if [[ -d "$PACKAGE_ROOT/HAGRad_Runtime" ]]; then
  HAGRAD_ROOT="$PACKAGE_ROOT/HAGRad_Runtime"
fi

create_desktop_app() {
  local app_path="$HOME/Desktop/HAGRad Viewer.app"
  local icon_path="$HAGRAD_ROOT/assets/hagrad-palm-icon.icns"

  if [[ ! -f "$icon_path" ]]; then
    return 0
  fi

  if [[ -x "$app_path/Contents/MacOS/hagrad-viewer" ]]; then
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

  cat > "$app_path/Contents/MacOS/hagrad-viewer" <<SCRIPT
#!/bin/zsh
set -e
cd "$PACKAGE_ROOT"
exec "./HAGRad Viewer.command"
SCRIPT

  chmod +x "$app_path/Contents/MacOS/hagrad-viewer"
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

./open-viewer.command
