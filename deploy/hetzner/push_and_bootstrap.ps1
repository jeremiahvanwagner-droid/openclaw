param(
  [Parameter(Mandatory = $true)]
  [string]$ServerIp,
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\openclaw_hetzner"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $SshKeyPath)) {
  throw "SSH key not found: $SshKeyPath"
}

$root = Split-Path -Parent $PSScriptRoot
$target = "root@$ServerIp"

Write-Output "Copying deployment kit to VPS..."
scp -i $SshKeyPath -r $root "$target`:~/openclaw-prod"

Write-Output "Running bootstrap on VPS as root..."
ssh -i $SshKeyPath $target "bash ~/openclaw-prod/scripts/bootstrap_vps.sh"

Write-Output "Bootstrap complete. Next: run tailscale up and OpenClaw config as openclaw user."
