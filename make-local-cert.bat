@echo off
setlocal

cd /d "%~dp0"
if not exist ".cert" mkdir ".cert"

where openssl >nul 2>nul
if errorlevel 1 (
  echo OpenSSL was not found on this Windows computer.
  echo.
  echo This certificate step is optional. The normal Windows launcher can run
  echo HAGRad locally over http://localhost:3020 without OpenSSL.
  echo.
  echo If you specifically want local HTTPS, install OpenSSL, then run this file
  echo again. OpenSSL is commonly available through Git for Windows, Win32
  echo OpenSSL, or your institution's package manager.
  echo.
  pause
  exit /b 1
)

openssl req -x509 -nodes -newkey rsa:2048 ^
  -keyout ".cert\localhost-key.pem" ^
  -out ".cert\localhost.pem" ^
  -days 3650 ^
  -subj "/CN=localhost"

echo.
echo Local certificate created.
echo Next, double-click HAGRad Viewer.bat.
pause
