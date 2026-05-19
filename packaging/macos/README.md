# macOS packaging

This packaging path creates a self-contained `HAGRad Viewer.app` with an embedded Python runtime, the local HAGRad server, viewer assets, and the HAGRad icon. The normal user path is one obvious app icon, not `python3`, Terminal, OpenSSL, or workflow-specific launchers.

## Build an unsigned developer DMG

```bash
packaging/macos/build-hagrad-viewer-app.sh
```

Outputs:

```text
dist/macos/HAGRad Viewer.app
dist/HAGRad-Viewer-macOS.dmg
```

The unsigned developer build is useful for internal testing, but macOS Gatekeeper can still warn because it is not signed with Developer ID and notarized.

## Runtime behavior

- The app launches the bundled Python server internally.
- If no local certificate exists, it uses `http://localhost:3020` so users do not need OpenSSL.
- It opens `/src/viewer.html` in the default browser.
- Mutable state is written outside the app bundle:
  - Logs: `~/Library/Logs/HAGRad Viewer/`
  - Project/session state: `~/Library/Application Support/HAGRad Viewer/`
  - Export mirror: `~/Documents/HAGRad Viewer/exports_outbox/`

## Manual Developer ID signing and notarization

Apple's current direct-distribution flow is Developer ID signing plus notarization. Apple documents that Gatekeeper checks Developer ID software distributed outside the Mac App Store, and that notarization uses Apple notary service checks before distribution:

- [Signing Mac Software with Developer ID](https://developer.apple.com/developer-id/)
- [Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Migrating to the latest notarization tool](https://developer.apple.com/documentation/technotes/tn3147-migrating-to-the-latest-notarization-tool)

Prerequisites:

- Apple Developer Program membership.
- A `Developer ID Application` certificate installed in the build Mac keychain.
- Xcode or Xcode Command Line Tools with `codesign`, `xcrun notarytool`, and `xcrun stapler`.
- An app-specific password or App Store Connect API key for notarization.

One-time notary credential setup:

```bash
xcrun notarytool store-credentials "HAGRad Notary" \
  --apple-id "APPLE_ID_EMAIL" \
  --team-id "TEAMID"
```

Signed build:

```bash
export HAGRAD_SIGN_IDENTITY="Developer ID Application: YOUR NAME (TEAMID)"
packaging/macos/build-hagrad-viewer-app.sh --sign-identity "$HAGRAD_SIGN_IDENTITY"
```

Verify the app and DMG signatures:

```bash
codesign --verify --deep --strict --verbose=2 "dist/macos/HAGRad Viewer.app"
codesign --verify --verbose=2 "dist/HAGRad-Viewer-macOS.dmg"
spctl -a -vvv -t exec "dist/macos/HAGRad Viewer.app"
```

Submit and staple the DMG:

```bash
xcrun notarytool submit "dist/HAGRad-Viewer-macOS.dmg" \
  --keychain-profile "HAGRad Notary" \
  --wait

xcrun stapler staple "dist/HAGRad-Viewer-macOS.dmg"
spctl -a -vvv -t open --context context:primary-signature "dist/HAGRad-Viewer-macOS.dmg"
```

If notarization fails, inspect Apple's status log:

```bash
xcrun notarytool log SUBMISSION_ID --keychain-profile "HAGRad Notary"
```

Apple no longer accepts notarization uploads from `altool` or Xcode 13-era tooling, so use `notarytool` with a current Xcode toolchain.
