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
if (Test-Path (Join-Path $LauncherRoot "HAGRad_Runtime")) {
    $RuntimeRoot = Join-Path $LauncherRoot "HAGRad_Runtime"
}

$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "HAGRad Viewer.lnk"
$LauncherPath = Join-Path $LauncherRoot $LauncherName
$IconPath = Join-Path $RuntimeRoot "assets\hagrad-palm-icon.ico"

if (-not (Test-Path $LauncherPath)) {
    $FallbackLauncherPath = Join-Path $LauncherRoot "HAGRad Viewer.bat"
    if (Test-Path $FallbackLauncherPath) {
        $LauncherPath = $FallbackLauncherPath
    } else {
        throw "Could not find launcher: $LauncherPath"
    }
}

if (-not (Test-Path $IconPath)) {
    throw "Could not find icon: $IconPath"
}

$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $LauncherPath
$Shortcut.WorkingDirectory = $LauncherRoot
$Shortcut.IconLocation = $IconPath
$Shortcut.Description = "Open HAGRad Viewer"
$Shortcut.Save()

Write-Host "Created desktop shortcut: $ShortcutPath"
