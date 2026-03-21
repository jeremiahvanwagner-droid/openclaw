@echo off
rem OpenClaw Node Host (v2026.3.13)
set "TMPDIR=C:\Users\JEREMI~1\AppData\Local\Temp"
set "OPENCLAW_LAUNCHD_LABEL=ai.openclaw.node"
set "OPENCLAW_SYSTEMD_UNIT=openclaw-node"
set "OPENCLAW_WINDOWS_TASK_NAME=OpenClaw Node"
set "OPENCLAW_TASK_SCRIPT_NAME=node.cmd"
set "OPENCLAW_LOG_PREFIX=node"
set "OPENCLAW_SERVICE_MARKER=openclaw"
set "OPENCLAW_SERVICE_KIND=node"
set "OPENCLAW_SERVICE_VERSION=2026.3.13"
"C:\Program Files\nodejs\node.exe" C:\Users\JeremiahVanWagner\AppData\Roaming\npm\node_modules\openclaw\dist\index.js node run --host api.truthjblue.dev --port 443 --tls --display-name "Jeremiah Windows Browser"
