@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if not exist "logs" mkdir "logs" >nul 2>nul
set "LOG_FILE=%~dp0logs\hagrad-server-windows.log"
> "%LOG_FILE%" echo HAGRad server start: %DATE% %TIME%

if not exist ".cert\localhost.pem" set "HAGRAD_ALLOW_HTTP=1"
if not exist ".cert\localhost-key.pem" set "HAGRAD_ALLOW_HTTP=1"

if /I "%HAGRAD_ALLOW_HTTP%"=="1" (
  echo Starting HAGRad on http://localhost:3020 because no local HTTPS certificate is available.
  echo This is expected on many Windows computers and keeps all DICOM files local.
  echo.
  >> "%LOG_FILE%" echo INFO: HTTP fallback enabled.
)

where py >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
  if not errorlevel 1 (
    py -3 scripts\serve_https.py
    set "SERVER_EXIT=%errorlevel%"
    >> "%LOG_FILE%" echo py -3 exited with code %SERVER_EXIT%.
    exit /b %SERVER_EXIT%
  )
)

where python >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
  if not errorlevel 1 (
    python scripts\serve_https.py
    set "SERVER_EXIT=%errorlevel%"
    >> "%LOG_FILE%" echo python exited with code %SERVER_EXIT%.
    exit /b %SERVER_EXIT%
  )
)

echo Python 3 was not found.
echo Install Python 3 from https://www.python.org/downloads/windows/ and try again.
echo During installation, enable "Add python.exe to PATH" if offered.
>> "%LOG_FILE%" echo ERROR: Python 3 was not found.
pause
exit /b 1
