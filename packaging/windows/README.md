# Windows packaging

Windows builds are produced on Windows because PyInstaller must bundle the Windows Python runtime and create a Windows `.exe`.

## Build

```powershell
powershell -ExecutionPolicy Bypass -File packaging\windows\build-hagrad-viewer-exe.ps1
```

Outputs:

```text
dist\windows\HAGRad Viewer.exe
dist\HAGRad-Viewer-Windows.zip
```

The ZIP contains one visible launcher, `HAGRad Viewer.exe`. The executable embeds the viewer files and local server code.

## Runtime behavior

- Starts the bundled local HAGRad server internally.
- Opens the main HAGRad Viewer in the default browser.
- Uses `http://localhost:3020` when no HTTPS certificate exists.
- Keeps DICOM files local.
- Writes logs to `%LOCALAPPDATA%\HAGRad Viewer\logs\`.
- Writes exports to `Documents\HAGRad Viewer\exports_outbox\`.

Image Quality / CCTA IQ, EAT, and QCA remain accessible from inside the main HAGRad Viewer interface.
