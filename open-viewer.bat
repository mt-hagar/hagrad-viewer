@echo off
setlocal

cd /d "%~dp0"

set "SERVER_URL=https://localhost:3020"
set "HEALTH_URL=%SERVER_URL%/api/export-studies"
set "VIEWER_URL=%SERVER_URL%/src/viewer.html"

if not exist ".cert\localhost.pem" (
  echo Certificate files are missing.
  echo Please run make-local-cert.bat once first.
  echo.
  pause
  exit /b 1
)

if not exist ".cert\localhost-key.pem" (
  echo Certificate files are missing.
  echo Please run make-local-cert.bat once first.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $client = New-Object Net.Sockets.TcpClient('localhost', 3020); $client.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (
  start "HAGRad local server" "%~dp0start-server.bat"
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
