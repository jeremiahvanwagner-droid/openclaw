[CmdletBinding()]
param(
  [string]$ServerIp = "87.99.138.98",
  [string]$SshKeyPath = "$env:USERPROFILE\.ssh\openclaw_hostinger",
  [switch]$ListOnly
)

if (-not (Test-Path $SshKeyPath)) {
  throw "SSH key not found: $SshKeyPath"
}

$ssh = Get-Command ssh -ErrorAction Stop
$target = "root@$ServerIp"

$remotePrefix = 'ENV_FILE=/opt/openclaw/.env; if [ ! -f "$ENV_FILE" ]; then ENV_FILE=/etc/openclaw/.env; fi; set -a; . "$ENV_FILE"; set +a; if [ -z "${OPENCLAW_GATEWAY_AUTH_TOKEN:-}" ] && [ -n "${OPEN_CLAW_GATEWAY_AUTH_TOKEN:-}" ]; then export OPENCLAW_GATEWAY_AUTH_TOKEN="$OPEN_CLAW_GATEWAY_AUTH_TOKEN"; fi; export OPENCLAW_GATEWAY_TOKEN="${OPENCLAW_GATEWAY_TOKEN:-$OPENCLAW_GATEWAY_AUTH_TOKEN}"; cd /opt/openclaw'

$listCommand = "$remotePrefix && docker compose exec -T -e OPENCLAW_GATEWAY_TOKEN=`"`$OPENCLAW_GATEWAY_TOKEN`" bot openclaw devices list --json"
$approveCommand = "$remotePrefix && docker compose exec -T -e OPENCLAW_GATEWAY_TOKEN=`"`$OPENCLAW_GATEWAY_TOKEN`" bot openclaw devices approve --latest --json"

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
