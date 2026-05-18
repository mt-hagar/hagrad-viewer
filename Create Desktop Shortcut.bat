@echo off
setlocal

cd /d "%~dp0"

if exist "%~dp0HAGRad_Runtime\scripts\create_desktop_shortcut.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0HAGRad_Runtime\scripts\create_desktop_shortcut.ps1" -LauncherRoot "%~dp0"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\create_desktop_shortcut.ps1" -LauncherRoot "%~dp0"
)
if errorlevel 1 (
  echo.
  echo Could not create the desktop shortcut.
  pause
  exit /b 1
)

echo.
echo Created a HAGRad Viewer shortcut on your Desktop.
pause
