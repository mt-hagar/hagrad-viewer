# Start HAGRad Viewer

HAGRad is designed to run locally on your computer. You should not need to search through the source folders to start it.

In the platform release packages, there is only one visible opener at the top level. All technical files are kept inside `HAGRad_support_files`. Most users can ignore that folder.

## macOS

Double-click:

```text
open-viewer-mac.command
```

On first launch, HAGRad automatically creates or refreshes a `HAGRad Viewer.app` launcher on your Desktop with the HAGRad icon.
If the original HAGRad folder is moved or the launcher cannot be found later, the Desktop app opens the HAGRad folder so you can double-click `open-viewer-mac.command` manually.

## Windows

Double-click:

```text
open-viewer-windows.bat
```

On first launch, HAGRad automatically creates or refreshes a `HAGRad Viewer` shortcut on your Desktop with the HAGRad icon.
If the original HAGRad folder is moved or the launcher cannot be found later, the Desktop shortcut opens the HAGRad folder so you can double-click `open-viewer-windows.bat` manually.

Windows note: if Python 3 is missing, the launcher opens the Python download page. If no local
HTTPS certificate is available, HAGRad automatically uses `http://localhost:3020` instead, so
OpenSSL is not required for normal use.

## First run

On the first run, HAGRad may create a local HTTPS certificate and then open the viewer in your browser at:

```text
https://localhost:3020/src/viewer.html
```

On Windows without a local certificate, it may instead open:

```text
http://localhost:3020/src/viewer.html
```

## Research use only

HAGRad is research software only. It is not a clinical product or medical device and must not be used for diagnosis, treatment decisions, or patient care.
