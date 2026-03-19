[CmdletBinding()]
param(
  [string]$ServerIp = "87.99.138.98",
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\openclaw_hetzner",
  [switch]$ListOnly
)

if (-not (Test-Path $SshKeyPath)) {
  throw "SSH key not found: $SshKeyPath"
}

$ssh = Get-Command ssh -ErrorAction Stop
$target = "root@$ServerIp"

$listCommand = 'set -a; . /etc/openclaw/.env; set +a; token="${OPENCLAW_GATEWAY_AUTH_TOKEN:-$OPENCLAW_GATEWAY_TOKEN}"; openclaw devices list --url ws://127.0.0.1:18789 --token "$token" --json'
$approveCommand = 'set -a; . /etc/openclaw/.env; set +a; token="${OPENCLAW_GATEWAY_AUTH_TOKEN:-$OPENCLAW_GATEWAY_TOKEN}"; openclaw devices approve --latest --url ws://127.0.0.1:18789 --token "$token" --json'

Write-Output "Listing pending and paired devices on $target ..."
& $ssh.Source -i $SshKeyPath $target $listCommand

if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

if ($ListOnly) {
  return
}

Write-Output ""
Write-Output "Approving the most recent pending device ..."
& $ssh.Source -i $SshKeyPath $target $approveCommand

exit $LASTEXITCODE
