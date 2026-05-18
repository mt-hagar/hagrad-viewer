@echo off
setlocal

cd /d "%~dp0"
if not exist ".cert" mkdir ".cert"

where openssl >nul 2>nul
if errorlevel 1 (
  echo OpenSSL was not found on this Windows computer.
  echo.
  echo Install OpenSSL, then run this file again. OpenSSL is commonly available
  echo through Git for Windows, Win32 OpenSSL, or your institution's package manager.
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
