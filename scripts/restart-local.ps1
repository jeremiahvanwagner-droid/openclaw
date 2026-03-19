param(
  [ValidateSet('TJB', 'MSL')]
  [string]$PrimaryTenant = 'TJB',
  [switch]$EnableLocalGateway
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot "logs"
$gatewayLog = Join-Path $logsDir "gateway-start.log"
$gatewayErr = Join-Path $logsDir "gateway-start.err.log"
$webhookLog = Join-Path $logsDir "webhook-start.log"
$webhookErr = Join-Path $logsDir "webhook-start.err.log"
$gatewayPort = 18789
$webhookPort = 8788
$openclawCmd = Join-Path $env:APPDATA "npm\openclaw.cmd"
$nodeExe = (Get-Command node.exe).Source
$syncScript = Join-Path $PSScriptRoot "sync-local-ghl-env.ps1"
$localEnvPath = Join-Path $repoRoot ".env"

function Stop-PortProcesses {
  param([int[]]$Ports)

  foreach ($port in $Ports) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in ($connections | Where-Object { $_ -gt 0 })) {
      try {
        Stop-Process -Id $procId -Force -ErrorAction Stop
        Write-Host "Stopped PID $procId on port $port"
      } catch {
        Write-Warning "Failed to stop PID $procId on port ${port}: $($_.Exception.Message)"
      }
    }
  }
}

function Ensure-Dependencies {
  $nodeModules = Join-Path $repoRoot "node_modules"
  if (-not (Test-Path $nodeModules)) {
    Write-Host "Installing dependencies with corepack pnpm install..."
    & corepack pnpm install
    if ($LASTEXITCODE -ne 0) {
      throw "Dependency install failed."
    }
  }
}

function Start-DetachedProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList,
    [Parameter(Mandatory = $true)][string]$StdOutPath,
    [Parameter(Mandatory = $true)][string]$StdErrPath
  )

  Remove-Item $StdOutPath, $StdErrPath -ErrorAction SilentlyContinue

  Start-Process `
    -FilePath $FilePath `
    -ArgumentList $ArgumentList `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $StdOutPath `
    -RedirectStandardError $StdErrPath `
    -PassThru
}

function Get-HealthJson {
  param([Parameter(Mandatory = $true)][string]$Url)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
    return $response.Content
  } catch {
    return $null
  }
}

if (-not (Test-Path $openclawCmd)) {
  throw "OpenClaw CLI not found at $openclawCmd"
}

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

Ensure-Dependencies

Write-Host "Syncing GHL env from $localEnvPath (PrimaryTenant=$PrimaryTenant)..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $syncScript -EnvPath $localEnvPath -PrimaryTenant $PrimaryTenant
if ($LASTEXITCODE -ne 0) {
  throw "Failed to sync local GHL environment."
}

Write-Host "Running GHL auth preflight..."
& $nodeExe "scripts/check-ghl-auth.mjs"
if ($LASTEXITCODE -ne 0) {
  throw "GHL auth preflight failed. Fix credentials before restarting local services."
}

Stop-PortProcesses -Ports @($gatewayPort, $webhookPort)

if ($EnableLocalGateway) {
  $gateway = Start-DetachedProcess `
    -FilePath $openclawCmd `
    -ArgumentList @("gateway", "--allow-unconfigured", "--force", "--port", "$gatewayPort") `
    -StdOutPath $gatewayLog `
    -StdErrPath $gatewayErr
} else {
  Write-Host "Remote-first mode: local gateway startup is disabled. Use the Hetzner gateway at https://api.truthjblue.dev."
  $gateway = $null
}

$webhook = Start-DetachedProcess `
  -FilePath $nodeExe `
  -ArgumentList @("--env-file=.env", "handlers/ghl-webhook-handler.mjs") `
  -StdOutPath $webhookLog `
  -StdErrPath $webhookErr

Start-Sleep -Seconds 5

$gatewayHealth = if ($EnableLocalGateway) {
  Get-HealthJson -Url "http://localhost:$gatewayPort/health"
} else {
  Get-HealthJson -Url "https://api.truthjblue.dev/health"
}
$webhookHealth = Get-HealthJson -Url "http://localhost:$webhookPort/health"

if ($gateway) {
  Write-Host "Gateway PID: $($gateway.Id)"
} else {
  Write-Host "Gateway PID: n/a (remote-first mode)"
}
Write-Host "Webhook PID: $($webhook.Id)"

if ($gatewayHealth) {
  Write-Host "Gateway health: $gatewayHealth"
} else {
  Write-Warning "Gateway health check failed. See $gatewayLog and $gatewayErr"
}

if ($webhookHealth) {
  Write-Host "Webhook health: $webhookHealth"
} else {
  Write-Warning "Webhook health check failed. See $webhookLog and $webhookErr"
}
