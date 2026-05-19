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

if exist "%HAGRAD_ROOT%scripts\create_desktop_shortcut.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%HAGRAD_ROOT%scripts\create_desktop_shortcut.ps1" -LauncherRoot "%PACKAGE_ROOT%" -LauncherName "%LAUNCHER_NAME%" >nul 2>nul
)

cd /d "%HAGRAD_ROOT%"

if not exist "logs" mkdir "logs" >nul 2>nul
set "LOG_FILE=%HAGRAD_ROOT%logs\hagrad-windows-launch.log"
> "%LOG_FILE%" echo HAGRad Windows launch: %DATE% %TIME%
>> "%LOG_FILE%" echo Package root: %PACKAGE_ROOT%
>> "%LOG_FILE%" echo Runtime root: %HAGRAD_ROOT%

call :check_python
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

set "SERVER_URL=%PROTOCOL%://localhost:3020"
set "HEALTH_URL=%SERVER_URL%/api/export-studies"
set "VIEWER_URL=%SERVER_URL%/src/viewer.html"
>> "%LOG_FILE%" echo Viewer URL: %VIEWER_URL%

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $client = New-Object Net.Sockets.TcpClient('localhost', 3020); $client.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  >> "%LOG_FILE%" echo INFO: Starting local HAGRad server.
  start "HAGRad local server" "%HAGRAD_ROOT%start-server.bat"
) else (
  >> "%LOG_FILE%" echo INFO: Port 3020 is already open.
)

for /l %%I in (1,1,45) do (
  where curl.exe >nul 2>nul
  if not errorlevel 1 (
    curl.exe -ks --max-time 2 "%HEALTH_URL%" >nul 2>nul
  ) else (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }; try { $response = Invoke-WebRequest -UseBasicParsing -Uri $env:HEALTH_URL -TimeoutSec 2; if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
  )
  if not errorlevel 1 (
    >> "%LOG_FILE%" echo INFO: HAGRad became ready.
    start "" "%VIEWER_URL%"
    exit /b 0
  )
  timeout /t 1 /nobreak >nul
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

:check_python
where py >nul 2>nul
if not errorlevel 1 (
  py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
  if not errorlevel 1 exit /b 0
)

where python >nul 2>nul
if not errorlevel 1 (
  python -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 1)" >nul 2>nul
  if not errorlevel 1 exit /b 0
)

exit /b 1
