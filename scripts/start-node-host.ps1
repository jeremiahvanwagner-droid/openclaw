param(
  [string]$Host = "api.truthjblue.dev",
  [int]$Port = 443,
  [switch]$Tls = $true,
  [string]$DisplayName = "$env:COMPUTERNAME Windows Browser"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$openclawCmd = Join-Path $env:APPDATA "npm\openclaw.cmd"
if (-not (Test-Path $openclawCmd)) {
  throw "OpenClaw CLI launcher not found at $openclawCmd"
}

$args = @(
  "node",
  "run",
  "--host", $Host,
  "--port", "$Port",
  "--display-name", $DisplayName
)

if ($Tls) {
  $args += "--tls"
}

Write-Host "Starting OpenClaw node host for $Host:$Port ..."
& $openclawCmd @args
