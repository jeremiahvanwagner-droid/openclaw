[CmdletBinding()]
param(
  [string]$Profile = "chrome-relay",
  [string]$TargetId = "",
  [switch]$AllowMultipleTabs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Fail([string]$Message) {
  Write-Error $Message
  exit 1
}

try {
  $tabsJson = & openclaw browser tabs --browser-profile $Profile --json
} catch {
  Fail "Relay preflight failed: unable to query browser tabs for profile '$Profile'. Ensure OpenClaw Browser Relay is attached and authenticated."
}

try {
  $payload = $tabsJson | ConvertFrom-Json
} catch {
  Fail "Relay preflight failed: tabs response is not valid JSON."
}

$tabs = @($payload.tabs)
if ($tabs.Count -eq 0) {
  Fail "Relay preflight failed: no attached relay tabs. Attach one tab with the OpenClaw Browser Relay extension icon (badge ON)."
}

if (-not $AllowMultipleTabs -and $tabs.Count -ne 1) {
  $ids = ($tabs | ForEach-Object { $_.targetId }) -join ", "
  Fail "Relay preflight failed: expected exactly one attached tab, found $($tabs.Count). Attached targetIds: $ids"
}

if (-not [string]::IsNullOrWhiteSpace($TargetId)) {
  $match = $tabs | Where-Object { $_.targetId -eq $TargetId }
  if (-not $match) {
    $ids = ($tabs | ForEach-Object { $_.targetId }) -join ", "
    Fail "Relay preflight failed: targetId '$TargetId' is stale or not attached. Refresh and select one of: $ids"
  }
}

$selected = if (-not [string]::IsNullOrWhiteSpace($TargetId)) {
  $tabs | Where-Object { $_.targetId -eq $TargetId } | Select-Object -First 1
} else {
  $tabs | Select-Object -First 1
}

Write-Output "Relay preflight passed."
Write-Output "Profile: $Profile"
Write-Output "Attached tabs: $($tabs.Count)"
Write-Output "Selected targetId: $($selected.targetId)"
Write-Output "Selected URL: $($selected.url)"
