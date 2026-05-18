@echo off
setlocal

set "PACKAGE_ROOT=%~dp0"
set "HAGRAD_ROOT=%PACKAGE_ROOT%"

if exist "%PACKAGE_ROOT%HAGRad_Runtime\" (
  set "HAGRAD_ROOT=%PACKAGE_ROOT%HAGRad_Runtime\"
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
