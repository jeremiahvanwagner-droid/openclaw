#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

APP_USER="${APP_USER:-openclaw}"

if ! id "${APP_USER}" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "${APP_USER}"
  usermod -aG sudo "${APP_USER}"
fi

mkdir -p "/home/${APP_USER}/.ssh"
if [[ -f /root/.ssh/authorized_keys ]]; then
  cat /root/.ssh/authorized_keys >> "/home/${APP_USER}/.ssh/authorized_keys"
fi
sort -u "/home/${APP_USER}/.ssh/authorized_keys" -o "/home/${APP_USER}/.ssh/authorized_keys" || true
chown -R "${APP_USER}:${APP_USER}" "/home/${APP_USER}/.ssh"
chmod 700 "/home/${APP_USER}/.ssh"
chmod 600 "/home/${APP_USER}/.ssh/authorized_keys" || true

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get install -y ca-certificates curl gnupg lsb-release jq git ufw unattended-upgrades apt-transport-https software-properties-common python3 python3-venv

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
usermod -aG docker "${APP_USER}"

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

if ! command -v tailscale >/dev/null 2>&1; then
  curl -fsSL https://tailscale.com/install.sh | sh
fi
systemctl enable --now tailscaled

if grep -qE "^\s*PasswordAuthentication" /etc/ssh/sshd_config; then
  sed -i 's/^\s*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
else
  echo "PasswordAuthentication no" >> /etc/ssh/sshd_config
fi

if grep -qE "^\s*PermitRootLogin" /etc/ssh/sshd_config; then
  sed -i 's/^\s*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
else
  echo "PermitRootLogin prohibit-password" >> /etc/ssh/sshd_config
fi

systemctl reload ssh || systemctl restart ssh || systemctl restart sshd || true

ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw --force enable

systemctl enable unattended-upgrades || true
systemctl restart unattended-upgrades || true

mkdir -p "/home/${APP_USER}/openclaw-prod"
chown -R "${APP_USER}:${APP_USER}" "/home/${APP_USER}/openclaw-prod"

cat <<'EOF'
Bootstrap complete.
Next required command (run on VPS):

  sudo tailscale up --ssh

Then login as the openclaw user and run configure_openclaw_prod.sh.
EOF
