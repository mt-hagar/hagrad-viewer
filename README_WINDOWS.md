# HAGRad Windows Package

## First Run

1. Unzip `HAGRad-Viewer-Windows.zip`.
2. Double-click `HAGRad Viewer.exe`.

The packaged executable includes the HAGRad launcher runtime. Normal users should not need to install Python, run a batch file, install OpenSSL, or keep a Command Prompt window open.

The local viewer opens at one of these local addresses:

```text
https://localhost:3020/src/viewer.html
http://localhost:3020/src/viewer.html
```

If no local HTTPS certificate is available, the Windows launcher automatically falls back to `http://localhost:3020`. This is expected on many Windows computers and avoids requiring OpenSSL. DICOM files still remain on the local computer.

## Notes

- HAGRad is research software only. It is not for clinical diagnosis or patient care.
- DICOM files are processed locally on your computer.
- Image Quality / CCTA IQ, EAT, and QCA are opened from inside the main HAGRad Viewer.
- If startup fails, HAGRad shows a message and writes logs under `%LOCALAPPDATA%\HAGRad Viewer\logs\`.
- Legacy `open-viewer-windows.bat` and `start-server.bat` files are retained only for source/developer workflows.

## Building the Windows executable

Windows packages must be built on Windows:

```powershell
powershell -ExecutionPolicy Bypass -File packaging\windows\build-hagrad-viewer-exe.ps1
```

Output:

```text
dist\windows\HAGRad Viewer.exe
dist\HAGRad-Viewer-Windows.zip
```
