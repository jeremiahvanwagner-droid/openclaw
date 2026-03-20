[CmdletBinding()]
param(
  [switch]$NoOpen
)

function Get-EnvValue {
  param([Parameter(Mandatory = $true)][string]$Name)

  foreach ($scope in "Process", "User", "Machine") {
    $value = [Environment]::GetEnvironmentVariable($Name, $scope)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
  }

  return $null
}

$token = Get-EnvValue -Name "OPENCLAW_GATEWAY_AUTH_TOKEN"

if ([string]::IsNullOrWhiteSpace($token)) {
  throw "OPENCLAW_GATEWAY_AUTH_TOKEN is not set."
}

$url = "https://api.truthjblue.dev/#token=$token"

if (Get-Command Set-Clipboard -ErrorAction SilentlyContinue) {
  $url | Set-Clipboard
}

Write-Output "Remote Control URL: $url"
Write-Output "If this is a new browser/device, run .\\scripts\\approve-remote-device.ps1 after the page starts connecting."

if (-not $NoOpen) {
  Start-Process $url
}
