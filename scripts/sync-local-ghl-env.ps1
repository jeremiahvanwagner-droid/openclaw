param(
  [string]$EnvPath = (Join-Path (Join-Path $PSScriptRoot '..') '.env'),
  [ValidateSet('TJB', 'MSL')]
  [string]$PrimaryTenant = 'TJB'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $EnvPath)) {
  throw "Local .env not found: $EnvPath"
}

function Unquote-EnvValue {
  param([string]$Value)

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $Value
  }

  if (
    ($Value.StartsWith('"') -and $Value.EndsWith('"')) -or
    ($Value.StartsWith("'") -and $Value.EndsWith("'"))
  ) {
    return $Value.Substring(1, $Value.Length - 2)
  }

  return $Value
}

$values = @{}

foreach ($rawLine in Get-Content $EnvPath) {
  $line = $rawLine.Trim()
  if (-not $line -or $line.StartsWith('#')) {
    continue
  }

  if ($line -notmatch '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$') {
    continue
  }

  $values[$Matches[1]] = Unquote-EnvValue $Matches[2].Trim()
}

foreach ($key in @($values.Keys)) {
  $values[$key] = [regex]::Replace($values[$key], '\$\{([A-Z0-9_]+)\}', {
    param($match)
    $name = $match.Groups[1].Value
    if ($values.ContainsKey($name)) {
      return $values[$name]
    }
    $envItem = Get-Item "Env:$name" -ErrorAction SilentlyContinue
    if ($envItem) {
      return $envItem.Value
    }
    return ''
  })
}

$requiredKeys = @(
  'GHL_PRIVATE_INTEGRATION_TOKEN_TJB',
  'GHL_LOCATION_ID_TJB',
  'GHL_PRIVATE_INTEGRATION_TOKEN_MSL',
  'GHL_LOCATION_ID_MSL'
)

foreach ($key in $requiredKeys) {
  if (-not $values.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($values[$key])) {
    throw "Missing required value in .env: $key"
  }
}

$primaryTokenKey = "GHL_PRIVATE_INTEGRATION_TOKEN_$PrimaryTenant"
$primaryLocationKey = "GHL_LOCATION_ID_$PrimaryTenant"

$assignments = [ordered]@{
  'GHL_PRIVATE_INTEGRATION_TOKEN_TJB' = $values['GHL_PRIVATE_INTEGRATION_TOKEN_TJB']
  'GHL_LOCATION_ID_TJB' = $values['GHL_LOCATION_ID_TJB']
  'GHL_PRIVATE_INTEGRATION_TOKEN_MSL' = $values['GHL_PRIVATE_INTEGRATION_TOKEN_MSL']
  'GHL_LOCATION_ID_MSL' = $values['GHL_LOCATION_ID_MSL']
  'GHL_PRIVATE_INTEGRATION_TOKEN' = $values[$primaryTokenKey]
  'GHL_LOCATION_ID' = $values[$primaryLocationKey]
  'GHL_TOKEN' = $values[$primaryTokenKey]
}

foreach ($pair in $assignments.GetEnumerator()) {
  [Environment]::SetEnvironmentVariable($pair.Key, $pair.Value, 'User')
  [Environment]::SetEnvironmentVariable($pair.Key, $pair.Value, 'Process')
}

Write-Output "Synced GHL environment from $EnvPath"
Write-Output "Primary tenant: $PrimaryTenant"

foreach ($pair in $assignments.GetEnumerator()) {
  $value = $pair.Value
  $tail = if ([string]::IsNullOrWhiteSpace($value)) { '<missing>' } else { $value.Substring([Math]::Max(0, $value.Length - 6)) }
  Write-Output ("  {0} -> len={1} tail={2}" -f $pair.Key, $value.Length, $tail)
}
