# Stop execution on any error
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

$build = Join-Path $root "build"
$dist = Join-Path $root "dist"

$manifest = Get-Content -Raw -Path ".\manifest.json" | ConvertFrom-Json
$version = $manifest.version
if (-not $version) { throw "Failed to read version from manifest.json" }

if (Test-Path $build) { Remove-Item $build -Recurse -Force }
New-Item $build -ItemType Directory | Out-Null
if (-not (Test-Path $dist)) { New-Item $dist -ItemType Directory | Out-Null }

$includePaths = @(
  "manifest.json",
  "src",
  "_locales",
  "icons",
  "LICENSE"
)

foreach ($path in $includePaths) {
  if (Test-Path $path) {
    Copy-Item $path -Destination $build -Recurse -Force
  }
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$zipName = "smartre-for-gmail-$version-$timestamp.zip"
$zipPath = Join-Path $dist $zipName

Push-Location $build
Compress-Archive -Path * -DestinationPath $zipPath -Force
Pop-Location

Write-Host "Build completed successfully: $zipPath"
