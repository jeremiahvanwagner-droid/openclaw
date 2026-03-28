#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# OpenClaw — Hetzner VPS Provisioning Script
# Run once on a fresh Ubuntu 22.04+ VPS to bootstrap everything
#
# Usage: curl -sSL <raw-github-url>/deploy/hetzner/provision.sh | bash
#    OR: scp provision.sh root@YOUR_VPS_IP:~ && ssh root@YOUR_VPS_IP 'bash provision.sh'
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────
OPENCLAW_USER="openclaw"
OPENCLAW_HOME="/opt/openclaw"
OPENCLAW_CONFIG="/etc/openclaw"
OPENCLAW_LOG="/var/log/openclaw"
NODE_MAJOR=22
REPO_URL="${OPENCLAW_REPO_URL:-https://github.com/truthjblue/openclaw.git}"
BRANCH="${OPENCLAW_BRANCH:-main}"

echo "══════════════════════════════════════════════════════"
echo " OpenClaw VPS Provisioning"
echo "══════════════════════════════════════════════════════"

# ── 1. System Updates ─────────────────────────────────────────
echo "[1/12] Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq curl git ufw jq python3

# ── 2. Install Node.js 22.x LTS ──────────────────────────────
echo "[2/12] Installing Node.js ${NODE_MAJOR}.x..."
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
    apt-get install -y -qq nodejs
fi
echo "  Node $(node -v) | npm $(npm -v)"

# ── 3. Install OpenClaw CLI ──────────────────────────────────
echo "[3/12] Installing OpenClaw CLI..."
npm install -g openclaw@latest
echo "  OpenClaw $(openclaw --version 2>/dev/null || echo 'installed')"

# ── 4. Install Caddy (reverse proxy + auto-TLS) ──────────────
echo "[4/12] Installing Caddy..."
if ! command -v caddy &>/dev/null; then
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y -qq caddy
fi
echo "  Caddy $(caddy version 2>/dev/null || echo 'installed')"

# ── 5. Create system user ────────────────────────────────────
echo "[5/12] Creating openclaw system user..."
if ! id "$OPENCLAW_USER" &>/dev/null; then
    useradd --system --shell /bin/bash --home-dir "$OPENCLAW_HOME" --create-home "$OPENCLAW_USER"
fi

# ── 6. Create directory structure ────────────────────────────
echo "[6/12] Creating directory structure..."
mkdir -p "$OPENCLAW_HOME"/{data,logs,backups,media,memory,cron/runs,delivery-queue,browser}
mkdir -p "$OPENCLAW_HOME"/{workspace,workspace-marketing,workspace-sales,workspace-support}
mkdir -p "$OPENCLAW_HOME"/workspaces/{d1_ceo,d1_cto,d2_director,d3_ceo,d4_cvo,d5_publisher,d6_executive_director,d8_saas_director,d9_store_director,shared_master_orchestrator,shared_runtime_ops,shared_exec_orchestrator,shared_data_control,biz_01_pod_lead,biz_02_pod_lead,biz_03_pod_lead,biz_04_pod_lead,biz_05_pod_lead,biz_06_pod_lead,biz_07_pod_lead,biz_08_pod_lead,biz_09_pod_lead,biz_10_pod_lead}
mkdir -p "$OPENCLAW_HOME"/.openclaw
mkdir -p "$OPENCLAW_CONFIG"
mkdir -p "$OPENCLAW_LOG"
chown -R "$OPENCLAW_USER":"$OPENCLAW_USER" "$OPENCLAW_HOME"
chown -R "$OPENCLAW_USER":"$OPENCLAW_USER" "$OPENCLAW_LOG"

# ── 7. Clone repository ─────────────────────────────────────
echo "[7/12] Cloning repository..."
if [ -d "$OPENCLAW_HOME/.git" ]; then
    cd "$OPENCLAW_HOME"
    sudo -u "$OPENCLAW_USER" git pull origin "$BRANCH"
else
    # Clone into temp, move contents
    TMP_CLONE=$(mktemp -d)
    git clone --branch "$BRANCH" "$REPO_URL" "$TMP_CLONE"
    cp -rT "$TMP_CLONE" "$OPENCLAW_HOME"
    rm -rf "$TMP_CLONE"
    chown -R "$OPENCLAW_USER":"$OPENCLAW_USER" "$OPENCLAW_HOME"
fi

# ── 8. Install dependencies ─────────────────────────────────
echo "[8/12] Installing workspace dependencies..."
PNPM_INSTALL_CMD='cd "'"$OPENCLAW_HOME"'" && (node scripts/pnpm.mjs install --frozen-lockfile --prod || node scripts/pnpm.mjs install --prod)'
if ! sudo -u "$OPENCLAW_USER" bash -lc "$PNPM_INSTALL_CMD"; then
    echo "  pnpm/corepack unavailable; installing pnpm globally and retrying..."
    npm install -g pnpm
    sudo -u "$OPENCLAW_USER" bash -lc "$PNPM_INSTALL_CMD"
fi
chown -R "$OPENCLAW_USER":"$OPENCLAW_USER" "$OPENCLAW_HOME"

# ── 9. Install Playwright Chromium runtime ──────────────────
echo "[9/12] Installing Playwright Chromium runtime..."
sudo -u "$OPENCLAW_USER" bash -lc "cd \"$OPENCLAW_HOME\" && node scripts/pnpm.mjs --dir skills exec playwright install chromium"

# ── 10. Setup environment ───────────────────────────────────
echo "[10/12] Setting up environment..."

# Install production openclaw.json (Linux paths, env-based secrets)
if [ -f "$OPENCLAW_HOME/config/openclaw.prod.json" ]; then
    cp "$OPENCLAW_HOME/config/openclaw.prod.json" "$OPENCLAW_HOME/.openclaw/openclaw.json"
    chown "$OPENCLAW_USER":"$OPENCLAW_USER" "$OPENCLAW_HOME/.openclaw/openclaw.json"
    echo "  ✓ Production config installed"
fi

if [ ! -f "$OPENCLAW_CONFIG/.env" ]; then
    cp "$OPENCLAW_HOME/.env.example" "$OPENCLAW_CONFIG/.env"
    chmod 600 "$OPENCLAW_CONFIG/.env"
    chown "$OPENCLAW_USER":"$OPENCLAW_USER" "$OPENCLAW_CONFIG/.env"
    echo "  ⚠ Created $OPENCLAW_CONFIG/.env from template — EDIT WITH REAL VALUES"
    echo "    sudo nano $OPENCLAW_CONFIG/.env"
else
    echo "  ✓ $OPENCLAW_CONFIG/.env already exists"
fi

# ── 11. Install systemd services ────────────────────────────
echo "[11/12] Installing systemd services..."
cp "$OPENCLAW_HOME/deploy/hetzner/openclaw.service" /etc/systemd/system/
cp "$OPENCLAW_HOME/deploy/hetzner/webhook.service" /etc/systemd/system/openclaw-webhook.service
cp "$OPENCLAW_HOME/deploy/hetzner/openclaw-dashboard.service" /etc/systemd/system/

# Compatibility path for legacy webhook skill imports
mkdir -p "$OPENCLAW_HOME/handlers/workspace"
ln -sfn "$OPENCLAW_HOME/skills" "$OPENCLAW_HOME/handlers/workspace/skills"
chown -h "$OPENCLAW_USER":"$OPENCLAW_USER" "$OPENCLAW_HOME/handlers/workspace/skills" || true

# Install Caddyfile
cp "$OPENCLAW_HOME/deploy/hetzner/Caddyfile" /etc/caddy/Caddyfile

# Build the Next.js dashboard
# --prod was used for the bot above; dashboard needs devDeps (next, typescript)
echo "  Building Next.js dashboard..."
sudo -u "$OPENCLAW_USER" bash -lc "
    export CI=true
    cd \"$OPENCLAW_HOME\" && node scripts/pnpm.mjs install --filter openclaw-dashboard --no-frozen-lockfile
" || echo "  Warning: dashboard dep install failed — build may fail"
sudo -u "$OPENCLAW_USER" bash -lc "
    export CI=true
    set -a
    [ -f /etc/openclaw/.env ] && source /etc/openclaw/.env
    set +a
    cd \"$OPENCLAW_HOME/dashboard\" && ../node_modules/.bin/next build
" || echo "  Warning: dashboard build failed — service will be disabled until fixed"
chown -R "$OPENCLAW_USER":"$OPENCLAW_USER" "$OPENCLAW_HOME/dashboard"
echo "  Dashboard build step complete."

systemctl daemon-reload
systemctl enable openclaw openclaw-webhook openclaw-dashboard caddy

# ── 12. Configure firewall ──────────────────────────────────
echo "[12/12] Configuring firewall..."
ufw --force reset >/dev/null 2>&1
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (Caddy redirect)
ufw allow 443/tcp   # HTTPS (Caddy TLS)
ufw --force enable

echo ""
echo "══════════════════════════════════════════════════════"
echo " ✓ Provisioning Complete!"
echo "══════════════════════════════════════════════════════"
echo ""
echo " Next Steps:"
echo ""
echo " 1. Edit environment variables:"
echo "    sudo nano /etc/openclaw/.env"
echo ""
echo " 2. Verify Caddy hostnames:"
echo "    sudo nano /etc/caddy/Caddyfile"
echo "    (Ensure truthjblue.dev, api.truthjblue.dev, webhook.truthjblue.dev point to this VPS)"
echo ""
echo " 3. Point DNS A records to this server's IP:"
echo "    truthjblue.dev      → $(curl -4s ifconfig.me)"
echo "    api.yourdomain.com  → $(curl -4s ifconfig.me)"
echo "    webhook.yourdomain.com → $(curl -4s ifconfig.me)"
echo ""
echo " 4. Start services:"
echo "    sudo systemctl start caddy"
echo "    sudo systemctl start openclaw"
echo "    sudo systemctl start openclaw-webhook"
echo "    sudo systemctl start openclaw-dashboard"
echo ""
echo " 5. Verify:"
echo "    sudo systemctl status openclaw"
echo "    curl http://localhost:18789/health"
echo "    curl http://localhost:3001"
echo ""
