# HAGRad Windows Research Preview

HAGRad for Windows runs as a local browser-based research application.

## First Run

1. Unzip `HAGRad-Viewer-Windows.zip`.
2. Install Python 3 if it is not already installed.
3. Double-click `open-viewer-windows.bat`.
4. HAGRad automatically creates a `HAGRad Viewer` shortcut on your Desktop with the HAGRad icon.

If a future release includes `HAGRad Viewer.exe`, double-click that instead of the batch file.

The local viewer opens at one of these local addresses:

```text
https://localhost:3020/src/viewer.html
http://localhost:3020/src/viewer.html
```

If no local HTTPS certificate is available, the Windows launcher automatically falls back to
`http://localhost:3020`. This is expected on many Windows computers and avoids requiring OpenSSL.
DICOM files still remain on the local computer.

## Notes

- HAGRad is research software only. It is not for clinical diagnosis or patient care.
- DICOM files are processed locally on your computer.
- `start-server.bat` keeps the local HAGRad server running in a Command Prompt window.
- If startup fails, check `HAGRad_support_files\logs\hagrad-windows-launch.log` and
  `HAGRad_support_files\logs\hagrad-server-windows.log`.
- `make-local-cert.bat` is optional. It is only needed if you specifically want local HTTPS
  on Windows and have OpenSSL installed.
