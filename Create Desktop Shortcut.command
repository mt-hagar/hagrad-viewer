#!/bin/zsh
set -e

cd "$(dirname "$0")"

APP_PATH="$HOME/Desktop/HAGRad Viewer.app"
PACKAGE_ROOT="$(pwd)"
HAGRAD_ROOT="$PACKAGE_ROOT"

if [[ -d "$PACKAGE_ROOT/HAGRad_Runtime" ]]; then
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

cat > "$APP_PATH/Contents/MacOS/hagrad-viewer" <<SCRIPT
#!/bin/zsh
set -e
cd "$PACKAGE_ROOT"
exec "./HAGRad Viewer.command"
SCRIPT

chmod +x "$APP_PATH/Contents/MacOS/hagrad-viewer"

echo
echo "Created HAGRad Viewer.app on your Desktop."
echo "You can double-click it to open HAGRad Viewer."
read -k "?Press any key to close..."
echo
