[CmdletBinding()]
param(
  [string]$ConfigPath = "",
  [switch]$FailOnLocalGatewayListener = $true
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $scriptDir = if ([string]::IsNullOrWhiteSpace($PSScriptRoot)) {
    Split-Path -Parent $MyInvocation.MyCommand.Path
  } else {
    $PSScriptRoot
  }
  if ([string]::IsNullOrWhiteSpace($scriptDir)) {
    $scriptDir = (Get-Location).Path
  }
  $ConfigPath = Join-Path (Split-Path -Parent $scriptDir) "openclaw.json"
}

if (-not (Test-Path $ConfigPath)) {
  Fail "Config file not found: $ConfigPath"
}

$cfg = Get-Content -Raw $ConfigPath | ConvertFrom-Json
$mode = "$($cfg.gateway.mode)".ToLowerInvariant()
if ($mode -ne "remote") {
  Fail "Topology guard failed: gateway.mode='$mode'. Expected 'remote'."
}

if (-not $cfg.gateway.remote.url) {
  Fail "Topology guard failed: gateway.remote.url is missing."
}

$listener = Get-NetTCPConnection -LocalPort 18789 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($FailOnLocalGatewayListener -and $listener) {
  $pid = $listener.OwningProcess
  Fail "Topology guard failed: local listener detected on 127.0.0.1:18789 (PID $pid). Local gateway must remain disabled in remote-first mode."
}

$task = Get-ScheduledTask -TaskName "OpenClaw Gateway" -ErrorAction SilentlyContinue
if ($task -and $task.State -ne "Disabled") {
  Write-Warning "OpenClaw Gateway scheduled task exists and is not disabled. Disable it to prevent local/remote drift."
}

Write-Output "Topology guard passed: remote-first gateway mode is active."
Write-Output "Remote URL: $($cfg.gateway.remote.url)"
if ($listener) {
  Write-Output "Local listener on 18789 detected but FailOnLocalGatewayListener is disabled."
} else {
  Write-Output "No local gateway listener on 18789."
}
