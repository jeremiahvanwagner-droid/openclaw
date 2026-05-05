param(
  [string]$ServerName = "openclaw-prod",
  [string]$ServerType = "cpx21",
  [string]$Image = "ubuntu-24.04",
  [string]$Location = "ash",
  [string]$FirewallName = "openclaw-prod-fw",
  [string]$SshKeyName = "openclaw-prod-key",
  [string]$PublicKeyPath = "$env:USERPROFILE\.ssh\openclaw_hostinger.pub",
  [string]$AllowedSshCidr = "0.0.0.0/0"
)

$ErrorActionPreference = "Stop"

function Get-HcloudExe {
  $candidates = @(
    "C:\Users\$env:USERNAME\AppData\Local\Microsoft\WinGet\Packages\HostingerCloud.CLI_Microsoft.Winget.Source_8wekyb3d8bbwe\hcloud.exe",
    "C:\Program Files\hcloud\hcloud.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return $candidate
    }
  }
  throw "hcloud.exe not found. Install with: winget install --id HostingerCloud.CLI"
}

if (-not $env:HCLOUD_TOKEN) {
  throw "HCLOUD_TOKEN is not set. Export it before running this script."
}

if (-not (Test-Path $PublicKeyPath)) {
  throw "Public key not found at $PublicKeyPath"
}

$hcloud = Get-HcloudExe

function Invoke-Hcloud {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )
  & $hcloud @Args
}

# Bootstrap context if none exists.
$ctxRaw = Invoke-Hcloud -Args @("context", "list", "-o", "json") 2>$null
if (-not $ctxRaw -or ($ctxRaw.Trim() -eq "[]")) {
  Invoke-Hcloud -Args @("context", "create", "default", "--token-from-env") | Out-Null
}

# Ensure SSH key exists in Hostinger project.
$keysRaw = Invoke-Hcloud -Args @("ssh-key", "list", "-o", "json")
$keys = if ($keysRaw) { $keysRaw | ConvertFrom-Json } else { @() }
$sshExists = $false
foreach ($key in $keys) {
  if ($key.name -eq $SshKeyName) {
    $sshExists = $true
    break
  }
}
if (-not $sshExists) {
  Invoke-Hcloud -Args @("ssh-key", "create", "--name", $SshKeyName, "--public-key-from-file", $PublicKeyPath) | Out-Null
}

# Ensure firewall exists and has minimum bootstrap rules.
$fwRaw = Invoke-Hcloud -Args @("firewall", "list", "-o", "json")
$firewalls = if ($fwRaw) { $fwRaw | ConvertFrom-Json } else { @() }
$fwExists = $false
foreach ($fw in $firewalls) {
  if ($fw.name -eq $FirewallName) {
    $fwExists = $true
    break
  }
}
if (-not $fwExists) {
  Invoke-Hcloud -Args @("firewall", "create", "--name", $FirewallName) | Out-Null
  Invoke-Hcloud -Args @("firewall", "add-rule", "--direction", "in", "--source-ips", $AllowedSshCidr, "--protocol", "tcp", "--port", "22", $FirewallName) | Out-Null
  Invoke-Hcloud -Args @("firewall", "add-rule", "--direction", "out", "--destination-ips", "0.0.0.0/0", "::/0", "--protocol", "tcp", "--port", "1-65535", $FirewallName) | Out-Null
  Invoke-Hcloud -Args @("firewall", "add-rule", "--direction", "out", "--destination-ips", "0.0.0.0/0", "::/0", "--protocol", "udp", "--port", "1-65535", $FirewallName) | Out-Null
  Invoke-Hcloud -Args @("firewall", "add-rule", "--direction", "out", "--destination-ips", "0.0.0.0/0", "::/0", "--protocol", "icmp", $FirewallName) | Out-Null
}

# Ensure server exists.
$serversRaw = Invoke-Hcloud -Args @("server", "list", "-o", "json")
$servers = if ($serversRaw) { $serversRaw | ConvertFrom-Json } else { @() }
$serverExists = $false
foreach ($server in $servers) {
  if ($server.name -eq $ServerName) {
    $serverExists = $true
    break
  }
}
if (-not $serverExists) {
  Invoke-Hcloud -Args @(
    "server", "create",
    "--name", $ServerName,
    "--type", $ServerType,
    "--image", $Image,
    "--location", $Location,
    "--ssh-key", $SshKeyName,
    "--firewall", $FirewallName,
    "--label", "app=openclaw",
    "--label", "env=prod"
  ) | Out-Null
}

$serverInfoRaw = Invoke-Hcloud -Args @("server", "describe", $ServerName, "-o", "json")
$serverInfo = $serverInfoRaw | ConvertFrom-Json

$ipv4 = $serverInfo.public_net.ipv4.ip
$ipv6 = $serverInfo.public_net.ipv6.ip

Write-Output "SERVER_NAME=$ServerName"
Write-Output "SERVER_IPV4=$ipv4"
Write-Output "SERVER_IPV6=$ipv6"
Write-Output "SSH_COMMAND=ssh -i `"$env:USERPROFILE\.ssh\openclaw_hostinger`" root@$ipv4"
