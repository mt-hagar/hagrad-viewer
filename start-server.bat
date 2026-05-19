@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if not exist "logs" mkdir "logs" >nul 2>nul
set "LOG_FILE=%~dp0logs\hagrad-server-windows.log"
> "%LOG_FILE%" echo HAGRad server start: %DATE% %TIME%
>> "%LOG_FILE%" echo Runtime root: %~dp0

if not exist ".cert\localhost.pem" set "HAGRAD_ALLOW_HTTP=1"
if not exist ".cert\localhost-key.pem" set "HAGRAD_ALLOW_HTTP=1"

if /I "%HAGRAD_ALLOW_HTTP%"=="1" (
  echo Starting HAGRad on http://localhost:3020 because no local HTTPS certificate is available.
  echo This is expected on many Windows computers and keeps all DICOM files local.
  echo.
  >> "%LOG_FILE%" echo INFO: HTTP fallback enabled.
)

echo Starting HAGRad local server on localhost port 3020.
echo Leave this window open while using HAGRad Viewer.
echo.
echo Server details are being written to:
echo %LOG_FILE%
echo.

call :find_python
if errorlevel 1 (
  echo Python 3 was not found.
  echo.
  echo Install Python 3 from https://www.python.org/downloads/windows/ and try again.
  echo During installation, enable "Add python.exe to PATH" if offered.
  echo.
  echo I will open the Python download page now.
  start "" "https://www.python.org/downloads/windows/"
  >> "%LOG_FILE%" echo ERROR: Python 3 was not found.
  pause
  exit /b 1
)

>> "%LOG_FILE%" echo Python command: %PYTHON_CMD%
if defined PYTHON_VERSION >> "%LOG_FILE%" echo Python version: %PYTHON_VERSION%
>> "%LOG_FILE%" echo INFO: Starting scripts\serve_https.py

%PYTHON_CMD% scripts\serve_https.py >> "%LOG_FILE%" 2>&1
set "SERVER_EXIT=%errorlevel%"
>> "%LOG_FILE%" echo Server process exited with code %SERVER_EXIT%.

if not "%SERVER_EXIT%"=="0" (
  echo.
  echo HAGRad local server stopped before it was ready.
  echo.
  echo Please send this log file to the developer:
  echo %LOG_FILE%
  echo.
  pause
)

exit /b %SERVER_EXIT%

:find_python
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=py -3"
    for /f "delims=" %%V in ('py -3 -c "import sys; print(sys.version.split()[0])" 2^>nul') do set "PYTHON_VERSION=%%V"
    exit /b 0
  )
)

where python >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_CMD=python"
    for /f "delims=" %%V in ('python -c "import sys; print(sys.version.split()[0])" 2^>nul') do set "PYTHON_VERSION=%%V"
    exit /b 0
  )
)

exit /b 1
