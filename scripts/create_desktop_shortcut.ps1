param(
    [string]$LauncherRoot = "",
    [string]$LauncherName = "HAGRad Viewer.bat"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($LauncherRoot)) {
    $LauncherRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    $LauncherRoot = (Resolve-Path $LauncherRoot).Path
}

$RuntimeRoot = $LauncherRoot
if (Test-Path (Join-Path $LauncherRoot "HAGRad_support_files")) {
    $RuntimeRoot = Join-Path $LauncherRoot "HAGRad_support_files"
} elseif (Test-Path (Join-Path $LauncherRoot "HAGRad_Runtime")) {
    $RuntimeRoot = Join-Path $LauncherRoot "HAGRad_Runtime"
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$HelperRoot = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "HAGRad"
$HelperPath = Join-Path $HelperRoot "Open HAGRad Viewer.cmd"
$ShortcutPath = Join-Path $Desktop "HAGRad Viewer.lnk"
$LauncherPath = Join-Path $LauncherRoot $LauncherName
$IconPath = Join-Path $RuntimeRoot "assets\hagrad-palm-icon.ico"
$ShortcutIconPath = Join-Path $HelperRoot "hagrad-palm-icon.ico"

if (-not (Test-Path $LauncherPath)) {
    $FallbackLauncherPath = Join-Path $LauncherRoot "HAGRad Viewer.bat"
    if (Test-Path $FallbackLauncherPath) {
        $LauncherPath = $FallbackLauncherPath
        $LauncherName = Split-Path -Leaf $LauncherPath
    } else {
        throw "Could not find launcher: $LauncherPath"
    }
}

if (-not (Test-Path $IconPath)) {
    throw "Could not find icon: $IconPath"
}

New-Item -ItemType Directory -Force -Path $HelperRoot | Out-Null
Copy-Item -Path $IconPath -Destination $ShortcutIconPath -Force

function ConvertTo-BatchLiteral {
    param([string]$Value)
    return ($Value -replace "\^", "^^") -replace "%", "%%"
}

$BatchLauncherRoot = ConvertTo-BatchLiteral $LauncherRoot
$BatchLauncherName = ConvertTo-BatchLiteral $LauncherName

$HelperContent = @"
@echo off
setlocal
set "LAUNCHER_ROOT=$BatchLauncherRoot"
set "LAUNCHER_NAME=$BatchLauncherName"
set "LAUNCHER_PATH=%LAUNCHER_ROOT%\%LAUNCHER_NAME%"

if exist "%LAUNCHER_PATH%" (
  start "" "%LAUNCHER_PATH%"
  exit /b 0
)

if exist "%LAUNCHER_ROOT%\open-viewer-windows.bat" (
  start "" "%LAUNCHER_ROOT%\open-viewer-windows.bat"
  exit /b 0
)

if exist "%LAUNCHER_ROOT%\HAGRad Viewer.bat" (
  start "" "%LAUNCHER_ROOT%\HAGRad Viewer.bat"
  exit /b 0
)

if exist "%LAUNCHER_ROOT%" (
  start "" explorer "%LAUNCHER_ROOT%"
  echo HAGRad could not find the saved launcher file.
  echo I opened the HAGRad folder. Please double-click %LAUNCHER_NAME% there.
  pause
  exit /b 1
)

start "" explorer "%USERPROFILE%\Desktop"
echo HAGRad could not find the saved launcher folder.
echo Please unzip the HAGRad download again and double-click open-viewer-windows.bat.
pause
exit /b 1
"@

Set-Content -Path $HelperPath -Value $HelperContent -Encoding ASCII

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $HelperPath
$Shortcut.WorkingDirectory = $LauncherRoot
$Shortcut.IconLocation = $ShortcutIconPath
$Shortcut.Description = "Open HAGRad Viewer"
$Shortcut.Save()

Write-Host "Created desktop shortcut: $ShortcutPath"
