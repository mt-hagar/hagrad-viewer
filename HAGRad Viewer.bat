@echo off
setlocal

set "PACKAGE_ROOT=%~dp0"
set "HAGRAD_ROOT=%PACKAGE_ROOT%"

if exist "%PACKAGE_ROOT%HAGRad_Runtime\" (
  set "HAGRAD_ROOT=%PACKAGE_ROOT%HAGRad_Runtime\"
)

if exist "%HAGRAD_ROOT%scripts\create_desktop_shortcut.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%HAGRAD_ROOT%scripts\create_desktop_shortcut.ps1" -LauncherRoot "%PACKAGE_ROOT%" >nul 2>nul
)

cd /d "%HAGRAD_ROOT%"

if not exist ".cert\localhost.pem" (
  echo HAGRad Viewer first-run setup
  echo Creating a local HTTPS certificate before opening the viewer...
  echo.
  call "%HAGRAD_ROOT%make-local-cert.bat"
)

if not exist ".cert\localhost-key.pem" (
  echo HAGRad Viewer first-run setup
  echo Creating a local HTTPS certificate before opening the viewer...
  echo.
  call "%HAGRAD_ROOT%make-local-cert.bat"
)

call "%HAGRAD_ROOT%open-viewer.bat"
