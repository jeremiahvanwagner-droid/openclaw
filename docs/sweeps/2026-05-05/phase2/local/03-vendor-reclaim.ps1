# LOCAL vendor reclaim — sweep 2026-05-05 (Option 1: bulk dir delete)
# Removes regenerable vendor trees wholesale instead of per-file shredding.
# After running this, reinstall:
#   pnpm install   (or npm ci)  for node_modules trees
#   uv sync / pip install -r requirements.txt  for .venv trees
#   __pycache__ regenerates automatically on next interpreter run.
$ErrorActionPreference = 'Stop'
$Root     = 'C:\Users\JeremiahVanWagner\.openclaw'
$ArchRoot = Join-Path $Root 'archive/2026-05-05-sweep'.Replace('/','\')
$Log      = Join-Path $ArchRoot 'VENDOR-RECLAIM-LOG.txt'
if (-not (Test-Path $ArchRoot)) { New-Item -ItemType Directory -Path $ArchRoot | Out-Null }

$DirCount = 9
Write-Host ""
Write-Host "CONFIRM VENDOR RECLAIM: $DirCount directory trees will be permanently deleted (LOCAL)."
Write-Host "These contain ~109002 regenerable files (node_modules / .venv / caches)."
$reply = Read-Host "Reply BURN to proceed (anything else aborts)"
if ($reply -ne 'BURN') { Write-Host 'ABORTED.'; exit 1 }

$count = 0

if (Test-Path 'C:\Users\JeremiahVanWagner\.openclaw\.venv') { Remove-Item -LiteralPath 'C:\Users\JeremiahVanWagner\.openclaw\.venv' -Recurse -Force; "$([DateTime]::UtcNow.ToString('o'))`tRECLAIMED`tC:\Users\JeremiahVanWagner\.openclaw\.venv" | Out-File $Log -Append -Encoding utf8; $count++ }
if (Test-Path 'C:\Users\JeremiahVanWagner\.openclaw\dashboard\.next') { Remove-Item -LiteralPath 'C:\Users\JeremiahVanWagner\.openclaw\dashboard\.next' -Recurse -Force; "$([DateTime]::UtcNow.ToString('o'))`tRECLAIMED`tC:\Users\JeremiahVanWagner\.openclaw\dashboard\.next" | Out-File $Log -Append -Encoding utf8; $count++ }
if (Test-Path 'C:\Users\JeremiahVanWagner\.openclaw\dashboard\node_modules') { Remove-Item -LiteralPath 'C:\Users\JeremiahVanWagner\.openclaw\dashboard\node_modules' -Recurse -Force; "$([DateTime]::UtcNow.ToString('o'))`tRECLAIMED`tC:\Users\JeremiahVanWagner\.openclaw\dashboard\node_modules" | Out-File $Log -Append -Encoding utf8; $count++ }
if (Test-Path 'C:\Users\JeremiahVanWagner\.openclaw\deploy\hostinger\__pycache__') { Remove-Item -LiteralPath 'C:\Users\JeremiahVanWagner\.openclaw\deploy\hostinger\__pycache__' -Recurse -Force; "$([DateTime]::UtcNow.ToString('o'))`tRECLAIMED`tC:\Users\JeremiahVanWagner\.openclaw\deploy\hostinger\__pycache__" | Out-File $Log -Append -Encoding utf8; $count++ }
if (Test-Path 'C:\Users\JeremiahVanWagner\.openclaw\node_modules') { Remove-Item -LiteralPath 'C:\Users\JeremiahVanWagner\.openclaw\node_modules' -Recurse -Force; "$([DateTime]::UtcNow.ToString('o'))`tRECLAIMED`tC:\Users\JeremiahVanWagner\.openclaw\node_modules" | Out-File $Log -Append -Encoding utf8; $count++ }
if (Test-Path 'C:\Users\JeremiahVanWagner\.openclaw\openclaw-prod\scripts\__pycache__') { Remove-Item -LiteralPath 'C:\Users\JeremiahVanWagner\.openclaw\openclaw-prod\scripts\__pycache__' -Recurse -Force; "$([DateTime]::UtcNow.ToString('o'))`tRECLAIMED`tC:\Users\JeremiahVanWagner\.openclaw\openclaw-prod\scripts\__pycache__" | Out-File $Log -Append -Encoding utf8; $count++ }
if (Test-Path 'C:\Users\JeremiahVanWagner\.openclaw\skills\node_modules') { Remove-Item -LiteralPath 'C:\Users\JeremiahVanWagner\.openclaw\skills\node_modules' -Recurse -Force; "$([DateTime]::UtcNow.ToString('o'))`tRECLAIMED`tC:\Users\JeremiahVanWagner\.openclaw\skills\node_modules" | Out-File $Log -Append -Encoding utf8; $count++ }
if (Test-Path 'C:\Users\JeremiahVanWagner\.openclaw\training\node_modules') { Remove-Item -LiteralPath 'C:\Users\JeremiahVanWagner\.openclaw\training\node_modules' -Recurse -Force; "$([DateTime]::UtcNow.ToString('o'))`tRECLAIMED`tC:\Users\JeremiahVanWagner\.openclaw\training\node_modules" | Out-File $Log -Append -Encoding utf8; $count++ }
if (Test-Path 'C:\Users\JeremiahVanWagner\.openclaw\workspace\skills\node_modules') { Remove-Item -LiteralPath 'C:\Users\JeremiahVanWagner\.openclaw\workspace\skills\node_modules' -Recurse -Force; "$([DateTime]::UtcNow.ToString('o'))`tRECLAIMED`tC:\Users\JeremiahVanWagner\.openclaw\workspace\skills\node_modules" | Out-File $Log -Append -Encoding utf8; $count++ }
Write-Host "RECLAIMED: $count directory trees. Log: $Log"
