# Start HAGRad Viewer

HAGRad is designed to run locally on your computer. You should not need to search through source folders, install Python, or run Terminal commands to start it.

## macOS

Preferred packaged build:

```text
HAGRad Viewer.app
```

It is distributed inside `HAGRad-Viewer-macOS.dmg`. The app starts the local server internally and opens HAGRad Viewer in your browser.

Legacy source packages may still include `open-viewer-mac.command`. That script path is for developer/source workflows, not the preferred public download.

## Windows

Preferred packaged build:

```text
HAGRad Viewer.exe
```

It is distributed inside `HAGRad-Viewer-Windows.zip`. Right-click the zip and choose **Extract All**, then open the extracted folder and double-click `HAGRad Viewer.exe`. The executable starts the local server internally and opens HAGRad Viewer in your browser. Python and OpenSSL are not required for normal packaged use.

Legacy source packages may still include `open-viewer-windows.bat`. That batch path is for developer/source workflows.

## First run

On the first run, packaged HAGRad opens the viewer in your browser at:

```text
http://localhost:3020/src/viewer.html
```

If you provide local certificate files in the app support certificate folder, HAGRad can instead use:

```text
https://localhost:3020/src/viewer.html
```

If startup fails, check the launcher and server logs:

```text
macOS: ~/Library/Logs/HAGRad Viewer/
Windows: %LOCALAPPDATA%\HAGRad Viewer\logs\
```

## Research use only

HAGRad is research software only. It is not a clinical product or medical device and must not be used for diagnosis, treatment decisions, or patient care.
