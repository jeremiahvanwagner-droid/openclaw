[CmdletBinding()]
param(
  [string]$Profile = "chrome-relay",
  [string]$KeepTargetId = "",
  [switch]$Apply
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
  Fail "Unable to query tabs for profile '$Profile'. Ensure relay is reachable and authenticated."
}

try {
  $payload = $tabsJson | ConvertFrom-Json
} catch {
  Fail "Tabs payload is not valid JSON."
}

$tabs = @($payload.tabs)
if ($tabs.Count -eq 0) {
  Fail "No attached tabs found for profile '$Profile'. Attach one tab first (extension badge ON)."
}

$keep = $null
if (-not [string]::IsNullOrWhiteSpace($KeepTargetId)) {
  $keep = $tabs | Where-Object { $_.targetId -eq $KeepTargetId } | Select-Object -First 1
  if (-not $keep) {
    $ids = ($tabs | ForEach-Object { $_.targetId }) -join ", "
    Fail "KeepTargetId '$KeepTargetId' not found. Current targetIds: $ids"
  }
} else {
  $keep = $tabs | Select-Object -First 1
}

$toClose = @($tabs | Where-Object { $_.targetId -ne $keep.targetId })

Write-Output "Profile: $Profile"
Write-Output "Keeping targetId: $($keep.targetId)"
Write-Output "Keeping URL: $($keep.url)"
Write-Output "Attached tabs: $($tabs.Count)"

if ($toClose.Count -eq 0) {
  Write-Output "Single-tab lock already satisfied."
  exit 0
}

if (-not $Apply) {
  $closeIds = ($toClose | ForEach-Object { $_.targetId }) -join ", "
  Write-Output "Dry run only. Would close $($toClose.Count) tab(s): $closeIds"
  Write-Output "Re-run with -Apply to enforce."
  exit 0
}

$failed = @()
foreach ($tab in $toClose) {
  try {
    & openclaw browser close --browser-profile $Profile $tab.targetId | Out-Null
    Write-Output "Closed targetId: $($tab.targetId)"
  } catch {
    $failed += $tab.targetId
  }
}

if ($failed.Count -gt 0) {
  $failedIds = $failed -join ", "
  Fail "Single-tab lock partially applied. Failed to close targetIds: $failedIds"
}

Write-Output "Single-tab lock enforced successfully."
