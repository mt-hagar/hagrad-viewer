#!/bin/zsh
set -e

cd "$(dirname "$0")"

APP_PATH="$HOME/Desktop/HAGRad Viewer.app"
PACKAGE_ROOT="$(pwd)"
HAGRAD_ROOT="$PACKAGE_ROOT"

if [[ -d "$PACKAGE_ROOT/HAGRad_support_files" ]]; then
  HAGRAD_ROOT="$PACKAGE_ROOT/HAGRad_support_files"
elif [[ -d "$PACKAGE_ROOT/HAGRad_Runtime" ]]; then
  HAGRAD_ROOT="$PACKAGE_ROOT/HAGRad_Runtime"
fi

mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"
cp "$HAGRAD_ROOT/assets/hagrad-palm-icon.icns" "$APP_PATH/Contents/Resources/AppIcon.icns"

cat > "$APP_PATH/Contents/Info.plist" <<'PLIST'
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

cat > "$APP_PATH/Contents/MacOS/hagrad-viewer" <<'SCRIPT'
#!/bin/zsh
set +e

RESOURCE_DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"
PACKAGE_ROOT="$(cat "$RESOURCE_DIR/HAGRadPackageRoot.txt" 2>/dev/null)"
HAGRAD_ROOT="$(cat "$RESOURCE_DIR/HAGRadSupportRoot.txt" 2>/dev/null)"

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

open_launcher "$PACKAGE_ROOT/open-viewer-mac.command"
open_launcher "$PACKAGE_ROOT/HAGRad Viewer.command"
open_launcher "$HAGRAD_ROOT/HAGRad Viewer.command"
open_launcher "$HAGRAD_ROOT/open-viewer-mac.command"

open_hagrad_folder
exit 1
SCRIPT

chmod +x "$APP_PATH/Contents/MacOS/hagrad-viewer"
printf "%s" "$PACKAGE_ROOT" > "$APP_PATH/Contents/Resources/HAGRadPackageRoot.txt"
printf "%s" "$HAGRAD_ROOT" > "$APP_PATH/Contents/Resources/HAGRadSupportRoot.txt"
printf "%s" "3" > "$APP_PATH/Contents/Resources/HAGRadLauncherTemplateVersion.txt"

echo
echo "Created HAGRad Viewer.app on your Desktop."
echo "You can double-click it to open HAGRad Viewer."
read -k "?Press any key to close..."
echo
