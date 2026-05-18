@echo off
setlocal

cd /d "%~dp0"

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

where python >nul 2>nul
if not errorlevel 1 (
  python scripts\serve_https.py
  exit /b %errorlevel%
)

where py >nul 2>nul
if not errorlevel 1 (
  py -3 scripts\serve_https.py
  exit /b %errorlevel%
)

echo Python 3 was not found.
echo Install Python 3 from https://www.python.org/downloads/windows/ and try again.
pause
exit /b 1
