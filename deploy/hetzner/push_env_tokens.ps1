<#
.SYNOPSIS
  Push GHL multi-tenant tokens to the production /etc/openclaw/.env file.

.DESCRIPTION
  Reads the local .env file, extracts GHL tenant tokens, and appends any
  missing vars to /etc/openclaw/.env on the production VPS via SSH.

.PARAMETER ServerIp
  The IPv4 address (or Tailscale hostname) of the production server.

.PARAMETER SshKeyPath
  Path to the SSH private key for the server.

.EXAMPLE
  .\push_env_tokens.ps1 -ServerIp 100.x.x.x
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$ServerIp,
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\openclaw_hetzner",
  [string]$LocalEnv   = "$env:USERPROFILE\.openclaw\.env"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SshKeyPath)) { throw "SSH key not found: $SshKeyPath" }
if (-not (Test-Path $LocalEnv))   { throw "Local .env not found: $LocalEnv" }

# Vars we need on production for multi-tenant GHL
$requiredVars = @(
  'GHL_PRIVATE_INTEGRATION_TOKEN',
  'GHL_PRIVATE_INTEGRATION_TOKEN_TJB',
  'GHL_LOCATION_ID_TJB',
  'GHL_PRIVATE_INTEGRATION_TOKEN_MSL',
  'GHL_LOCATION_ID_MSL'
)

# Parse local .env
$localVals = @{}
Get-Content $LocalEnv | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)\s*=\s*(.+)$') {
    $localVals[$Matches[1]] = $Matches[2]
  }
}

# Build the lines to append
$lines = @()
foreach ($var in $requiredVars) {
  if ($localVals.ContainsKey($var) -and $localVals[$var]) {
    $lines += "$var=$($localVals[$var])"
  } else {
    Write-Warning "Skipping $var — not set in local .env"
  }
}

if ($lines.Count -eq 0) {
  Write-Error "No GHL vars found in local .env — nothing to push."
  exit 1
}

Write-Output "Will push $($lines.Count) GHL vars to $ServerIp"
Write-Output ($lines | ForEach-Object { "  " + ($_ -replace '=.{8}.*', '=****') })

$target = "root@$ServerIp"
$envFile = "/etc/openclaw/.env"

# Build a remote script that:
#  1. Removes old versions of these vars
#  2. Appends the new values
$sedParts = ($requiredVars | ForEach-Object { "-e '/^$_=/d'" }) -join ' '
$appendBlock = ($lines -join "`n")

$remoteScript = @"
set -e
cp $envFile ${envFile}.bak.\$(date +%Y%m%d-%H%M%S)
sed -i $sedParts $envFile
cat >> $envFile <<'ENVBLOCK'
$appendBlock
ENVBLOCK
echo 'Updated. Restarting services...'
systemctl restart openclaw
systemctl restart openclaw-webhook
sleep 5
echo 'Service status:'
systemctl is-active openclaw || true
systemctl is-active openclaw-webhook || true
"@

Write-Output ""
Write-Output "Connecting to $target..."
$remoteScript | ssh -i $SshKeyPath $target "bash -s"

Write-Output ""
Write-Output "Done. MSL + TJB tokens deployed to production."
