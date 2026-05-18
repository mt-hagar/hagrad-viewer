@echo off
setlocal

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

set "SERVER_URL=https://localhost:3020"
set "HEALTH_URL=%SERVER_URL%/api/export-studies"
set "VIEWER_URL=%SERVER_URL%/src/viewer.html"

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $client = New-Object Net.Sockets.TcpClient('localhost', 3020); $client.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  start "HAGRad local server" "%HAGRAD_ROOT%start-server.bat"
)

for /l %%I in (1,1,40) do (
  curl -ks --max-time 2 "%HEALTH_URL%" >nul 2>nul
  if not errorlevel 1 (
    start "" "%VIEWER_URL%"
    exit /b 0
  )
  timeout /t 1 /nobreak >nul
)

echo HAGRad Viewer did not become ready at %HEALTH_URL%.
echo Try running start-server.bat manually and keep that Command Prompt window open.
pause
exit /b 1
