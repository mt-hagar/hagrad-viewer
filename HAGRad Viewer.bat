@echo off
setlocal EnableExtensions

set "PACKAGE_ROOT=%~dp0"
set "HAGRAD_ROOT=%PACKAGE_ROOT%"
set "LAUNCHER_NAME=%~nx0"

if exist "%PACKAGE_ROOT%HAGRad_support_files\" (
  set "HAGRAD_ROOT=%PACKAGE_ROOT%HAGRad_support_files\"
) else if exist "%PACKAGE_ROOT%HAGRad_Runtime\" (
  set "HAGRAD_ROOT=%PACKAGE_ROOT%HAGRad_Runtime\"
)

if not exist "%HAGRAD_ROOT%logs" mkdir "%HAGRAD_ROOT%logs" >nul 2>nul
set "LOG_FILE=%HAGRAD_ROOT%logs\hagrad-windows-launch.log"
> "%LOG_FILE%" echo HAGRad Windows launch: %DATE% %TIME%
>> "%LOG_FILE%" echo Package root: %PACKAGE_ROOT%
>> "%LOG_FILE%" echo Runtime root: %HAGRAD_ROOT%
>> "%LOG_FILE%" echo Launcher name: %LAUNCHER_NAME%

set "POWERSHELL_EXE=powershell.exe"
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
  set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
)

if exist "%HAGRAD_ROOT%scripts\create_desktop_shortcut.ps1" (
  >> "%LOG_FILE%" echo INFO: Creating or refreshing Desktop shortcut.
  "%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%HAGRAD_ROOT%scripts\create_desktop_shortcut.ps1" -LauncherRoot "%PACKAGE_ROOT%" -LauncherName "%LAUNCHER_NAME%" >> "%LOG_FILE%" 2>&1
  if errorlevel 1 (
    echo HAGRad could not refresh the Desktop shortcut, but it will still try to open.
    echo Details were written to:
    echo %LOG_FILE%
    echo.
    >> "%LOG_FILE%" echo WARNING: Desktop shortcut creation failed.
  ) else (
    >> "%LOG_FILE%" echo INFO: Desktop shortcut is ready.
  )
)

cd /d "%HAGRAD_ROOT%"

call :find_python
if errorlevel 1 (
  echo Python 3 was not found or could not be started.
  echo.
  echo Please install Python 3 for Windows, then run this launcher again.
  echo During installation, enable "Add python.exe to PATH" if offered.
  echo.
  echo I will open the Python download page now.
  start "" "https://www.python.org/downloads/windows/"
  >> "%LOG_FILE%" echo ERROR: Python 3 was not found or could not be started.
  pause
  exit /b 1
)
>> "%LOG_FILE%" echo Python command: %PYTHON_CMD%
if defined PYTHON_VERSION >> "%LOG_FILE%" echo Python version: %PYTHON_VERSION%

set "PROTOCOL=https"
if not exist ".cert\localhost.pem" set "PROTOCOL=http"
if not exist ".cert\localhost-key.pem" set "PROTOCOL=http"

if /I "%PROTOCOL%"=="http" (
  set "HAGRAD_ALLOW_HTTP=1"
  echo No local HTTPS certificate was found. Starting HAGRad with the Windows-safe
  echo localhost HTTP fallback instead. DICOM files still stay on this computer.
  echo.
  >> "%LOG_FILE%" echo INFO: Starting with HTTP fallback because certificate files are missing.
)

set "ALT_PROTOCOL=http"
if /I "%PROTOCOL%"=="http" set "ALT_PROTOCOL=https"
set "SERVER_URL=%PROTOCOL%://localhost:3020"
set "HEALTH_URL=%SERVER_URL%/api/export-studies"
set "VIEWER_URL=%SERVER_URL%/src/viewer.html"
set "ALT_SERVER_URL=%ALT_PROTOCOL%://localhost:3020"
set "ALT_HEALTH_URL=%ALT_SERVER_URL%/api/export-studies"
set "ALT_VIEWER_URL=%ALT_SERVER_URL%/src/viewer.html"
>> "%LOG_FILE%" echo Viewer URL: %VIEWER_URL%
>> "%LOG_FILE%" echo Alternate viewer URL: %ALT_VIEWER_URL%

where curl.exe >nul 2>nul
if not errorlevel 1 set "HAGRAD_HAS_CURL=1"

set "PORT_WAS_OPEN=0"
call :is_port_open
if errorlevel 1 (
  >> "%LOG_FILE%" echo INFO: Starting local HAGRad server.
  start "HAGRad local server" "%HAGRAD_ROOT%start-server.bat"
) else (
  set "PORT_WAS_OPEN=1"
  >> "%LOG_FILE%" echo INFO: Port 3020 is already open.
)

for /l %%I in (1,1,45) do (
  call :check_health "%HEALTH_URL%"
  if not errorlevel 1 (
    >> "%LOG_FILE%" echo INFO: HAGRad became ready.
    start "" "%VIEWER_URL%"
    exit /b 0
  )
  call :check_health "%ALT_HEALTH_URL%"
  if not errorlevel 1 (
    >> "%LOG_FILE%" echo INFO: HAGRad was already ready at alternate URL: %ALT_VIEWER_URL%
    start "" "%ALT_VIEWER_URL%"
    exit /b 0
  )
  timeout /t 1 /nobreak >nul
)

if "%PORT_WAS_OPEN%"=="1" (
  echo Something is already using localhost port 3020, but it did not answer like HAGRad.
  echo.
  echo Close other local server windows using port 3020, then run this launcher again.
  echo If a "HAGRad local server" window is open, close it and try once more.
  echo.
  echo Startup details were written to:
  echo %LOG_FILE%
  >> "%LOG_FILE%" echo ERROR: Port 3020 was open, but neither %HEALTH_URL% nor %ALT_HEALTH_URL% became ready.
  pause
  exit /b 1
)

echo HAGRad Viewer did not become ready at %HEALTH_URL%.
echo.
echo Please keep the "HAGRad local server" window open if it appeared.
echo If this still fails, send this file to the developer:
echo %LOG_FILE%
echo.
echo You can also try opening this address manually in Chrome or Edge:
echo %VIEWER_URL%
>> "%LOG_FILE%" echo ERROR: HAGRad did not become ready at %HEALTH_URL%.
pause
exit /b 1

:is_port_open
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "try { $client = New-Object Net.Sockets.TcpClient('localhost', 3020); $client.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:check_health
set "TARGET_HEALTH_URL=%~1"
if defined HAGRAD_HAS_CURL (
  curl.exe -ks --fail --max-time 2 "%TARGET_HEALTH_URL%" >nul 2>nul
  exit /b %errorlevel%
)
"%POWERSHELL_EXE%" -NoProfile -ExecutionPolicy Bypass -Command "[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }; try { $response = Invoke-WebRequest -UseBasicParsing -Uri $env:TARGET_HEALTH_URL -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) { exit 0 } exit 1 } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

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
