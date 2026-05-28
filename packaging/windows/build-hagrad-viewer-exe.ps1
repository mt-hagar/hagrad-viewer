$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $Root

$Venv = Join-Path $Root "dist\packaging-venv\windows"
$Python = Join-Path $Venv "Scripts\python.exe"
$DistPath = Join-Path $Root "dist\windows"
$WorkPath = Join-Path $Root "dist\pyinstaller-work\windows"
$SpecPath = Join-Path $Root "dist\pyinstaller-spec\windows"
$StagePath = Join-Path $Root "dist\packaging-stage\windows"
$ExePath = Join-Path $DistPath "HAGRad Viewer.exe"
$ZipPath = Join-Path $Root "dist\HAGRad-Viewer-Windows.zip"
$IconPath = Join-Path $Root "assets\hagrad-palm-icon.ico"

if (-not (Test-Path $Python)) {
  python -m venv $Venv
}

& $Python -m pip install --upgrade pip pyinstaller

New-Item -ItemType Directory -Force -Path $DistPath, $WorkPath, $SpecPath | Out-Null
if (Test-Path $ExePath) {
  Remove-Item $ExePath -Force
}

if (Test-Path $StagePath) {
  Remove-Item $StagePath -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $StagePath | Out-Null

function Copy-CleanTree {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination
  )

  Copy-Item -Path $Source -Destination $Destination -Recurse -Force
  Get-ChildItem -Path $Destination -Recurse -Force -File -Include ".DS_Store", ".Rhistory", "*.pyc", "*.pyo" |
    Remove-Item -Force
  Get-ChildItem -Path $Destination -Recurse -Force -Directory -Filter "__pycache__" |
    Remove-Item -Recurse -Force
}

Copy-CleanTree -Source (Join-Path $Root "src") -Destination (Join-Path $StagePath "src")
Copy-CleanTree -Source (Join-Path $Root "vendor") -Destination (Join-Path $StagePath "vendor")
Copy-CleanTree -Source (Join-Path $Root "assets") -Destination (Join-Path $StagePath "assets")
New-Item -ItemType Directory -Force -Path (Join-Path $StagePath "scripts") | Out-Null
Copy-Item -Path (Join-Path $Root "scripts\serve_https.py") -Destination (Join-Path $StagePath "scripts\serve_https.py") -Force
Copy-Item -Path (Join-Path $Root "scripts\run_eat_backend_pipeline.py") -Destination (Join-Path $StagePath "scripts\run_eat_backend_pipeline.py") -Force

$DataArgs = @(
  "--add-data", "$StagePath\src;src",
  "--add-data", "$StagePath\vendor;vendor",
  "--add-data", "$StagePath\assets;assets",
  "--add-data", "$StagePath\scripts\serve_https.py;scripts",
  "--add-data", "$StagePath\scripts\run_eat_backend_pipeline.py;scripts",
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
  --icon $IconPath `
  --distpath $DistPath `
  --workpath $WorkPath `
  --specpath $SpecPath `
  @DataArgs `
  "packaging\launcher\hagrad_viewer_app.py"

if ($LASTEXITCODE -ne 0) {
  throw "PyInstaller failed with exit code $LASTEXITCODE"
}

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
