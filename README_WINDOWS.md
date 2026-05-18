# HAGRad Windows Research Preview

HAGRad for Windows runs as a local browser-based research application.

## First Run

1. Unzip `HAGRad-Viewer-Windows.zip`.
2. Install Python 3 if it is not already installed.
3. Double-click `HAGRad Viewer.bat`.
4. HAGRad automatically creates a `HAGRad Viewer` shortcut on your Desktop with the HAGRad palm icon.

If a future release includes `HAGRad Viewer.exe`, double-click that instead of the batch file.

The local viewer opens at:

```text
https://localhost:3020/src/viewer.html
```

## Notes

- HAGRad is research software only. It is not for clinical diagnosis or patient care.
- DICOM files are processed locally on your computer.
- `start-server.bat` keeps the local HTTPS server running in a Command Prompt window.
- If certificate generation fails, install OpenSSL and rerun `make-local-cert.bat`.
