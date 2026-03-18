param(
  [Parameter(Mandatory = $true)]
  [string]$ServerIp,
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\openclaw_hetzner",
  [string]$LocalEnv   = "$env:USERPROFILE\.openclaw\.env"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SshKeyPath)) { throw "SSH key not found: $SshKeyPath" }
if (-not (Test-Path $LocalEnv))   { throw "Local .env not found: $LocalEnv" }

$requiredVars = @(
  'GHL_PRIVATE_INTEGRATION_TOKEN',
  'GHL_PRIVATE_INTEGRATION_TOKEN_TJB',
  'GHL_LOCATION_ID_TJB',
  'GHL_PRIVATE_INTEGRATION_TOKEN_MSL',
  'GHL_LOCATION_ID_MSL'
)

# Parse local .env
$localVals = @{}
foreach ($line in (Get-Content $LocalEnv)) {
  if ($line -match '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+)$') {
    $localVals[$Matches[1]] = $Matches[2]
  }
}

# Build env lines
$envLines = @()
foreach ($var in $requiredVars) {
  if ($localVals.ContainsKey($var) -and $localVals[$var]) {
    $envLines += "$var=$($localVals[$var])"
  }
  else {
    Write-Warning "Skipping $var - not set in local .env"
  }
}

if ($envLines.Count -eq 0) {
  Write-Error "No GHL vars found in local .env - nothing to push."
  exit 1
}

Write-Output "Will push $($envLines.Count) GHL vars to $ServerIp"
foreach ($el in $envLines) {
  $masked = $el -replace '=.{8}.*', '=********'
  Write-Output "  $masked"
}

$target = "root@$ServerIp"
$envBlock = $envLines -join "`n"

# Build bash script avoiding PS expansion conflicts
$bashScript = @'
set -e
ENV_FILE="/etc/openclaw/.env"
cp "$ENV_FILE" "$ENV_FILE.bak.$(date +%Y%m%d-%H%M%S)"
'@

# Add sed lines to remove old values
foreach ($var in $requiredVars) {
  $bashScript += "`nsed -i '/^$var=/d' `"`$ENV_FILE`""
}

# Append new values
$bashScript += "`ncat >> `"`$ENV_FILE`" <<'ENVBLOCK'"
$bashScript += "`n$envBlock"
$bashScript += "`nENVBLOCK"
$bashScript += @'

echo 'Updated. Restarting services...'
systemctl restart openclaw
systemctl restart openclaw-webhook
sleep 5
echo 'Service status:'
systemctl is-active openclaw || true
systemctl is-active openclaw-webhook || true
'@

Write-Output ""
Write-Output "Connecting to $target..."
$bashScript | ssh -i $SshKeyPath $target "bash -s"

Write-Output ""
Write-Output "Done. MSL + TJB tokens deployed to production."
