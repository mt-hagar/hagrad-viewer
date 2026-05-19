$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root

$Venv = Join-Path $Root "dist\packaging-venv\windows"
$Python = Join-Path $Venv "Scripts\python.exe"
$DistPath = Join-Path $Root "dist\windows"
$WorkPath = Join-Path $Root "dist\pyinstaller-work\windows"
$SpecPath = Join-Path $Root "dist\pyinstaller-spec\windows"
$ExePath = Join-Path $DistPath "HAGRad Viewer.exe"
$ZipPath = Join-Path $Root "dist\HAGRad-Viewer-Windows.zip"

if (-not (Test-Path $Python)) {
  python -m venv $Venv
}

& $Python -m pip install --upgrade pip pyinstaller

New-Item -ItemType Directory -Force -Path $DistPath, $WorkPath, $SpecPath | Out-Null
if (Test-Path $ExePath) {
  Remove-Item $ExePath -Force
}

$DataArgs = @(
  "--add-data", "$Root\src;src",
  "--add-data", "$Root\vendor;vendor",
  "--add-data", "$Root\assets;assets",
  "--add-data", "$Root\scripts\serve_https.py;scripts",
  "--add-data", "$Root\scripts\run_eat_backend_pipeline.py;scripts",
  "--add-data", "$Root\README.md;.",
  "--add-data", "$Root\DISCLAIMER.md;.",
  "--add-data", "$Root\LICENSE;.",
  "--add-data", "$Root\LICENSE.md;.",
  "--add-data", "$Root\CITATION.cff;.",
  "--add-data", "$Root\RELEASE_NOTES.md;.",
  "--add-data", "$Root\help.html;."
)

& $Python -m PyInstaller `
  --noconfirm `
  --clean `
  --onefile `
  --windowed `
  --name "HAGRad Viewer" `
  --icon "assets\hagrad-palm-icon.ico" `
  --distpath $DistPath `
  --workpath $WorkPath `
  --specpath $SpecPath `
  @DataArgs `
  "packaging\launcher\hagrad_viewer_app.py"

if (-not (Test-Path $ExePath)) {
  throw "Expected executable was not created: $ExePath"
}

if (Test-Path $ZipPath) {
  Remove-Item $ZipPath -Force
}
Compress-Archive -Path $ExePath -DestinationPath $ZipPath -Force

Write-Host "Created $ExePath"
Write-Host "Created $ZipPath"
Write-Host "The Windows zip contains one visible launcher: HAGRad Viewer.exe"
