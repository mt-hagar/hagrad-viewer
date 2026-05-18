$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root

python -m pip install --upgrade pyinstaller

python -m PyInstaller `
  --noconfirm `
  --onefile `
  --windowed `
  --name "HAGRad Viewer" `
  --icon "assets\hagrad-palm-icon.ico" `
  --distpath "dist\windows-launcher" `
  --workpath "dist\pyinstaller-work" `
  --specpath "dist\pyinstaller-spec" `
  "packaging\windows\hagrad_viewer_launcher.pyw"

Copy-Item "dist\windows-launcher\HAGRad Viewer.exe" "HAGRad Viewer.exe" -Force

Write-Host "Created HAGRad Viewer.exe in the repository root."
Write-Host "Include that file in the Windows release package for one-click launching."
