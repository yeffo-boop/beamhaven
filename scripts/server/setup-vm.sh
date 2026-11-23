#!/usr/bin/env bash
# One-time setup of the BeamHaven VM (Ubuntu Server LTS). See DEPLOYMENT.md.
#
# Run on the VM, from /opt/beamhaven, AFTER you can log in with your SSH key:
#   sudo ./scripts/server/setup-vm.sh <NPM_IP> <LAN_RANGE>
# For example:
#   sudo ./scripts/server/setup-vm.sh 10.0.0.134 10.0.0.0/24
#
# It is safe to run again; each step checks what's already done. It:
#   1. installs all updates and turns on automatic security updates
#   2. installs Docker Engine and Docker Compose from Docker's own repository
#   3. sets up the firewall: SSH only from your LAN, the app port only from
#      Nginx Proxy Manager, everything else blocked (including through Docker)
#   4. turns off SSH password logins (keys only) and direct root login
set -euo pipefail

NPM_IP="${1:-}"
LAN_RANGE="${2:-}"
APP_PORT="${APP_PORT:-3000}"
ADMIN_USER="${SUDO_USER:-}"

fail() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "=== $* ==="; }

[[ $EUID -eq 0 ]] || fail "Run this with sudo."
[[ -n "$ADMIN_USER" && "$ADMIN_USER" != root ]] || fail "Run it with sudo from your admin user, not as root."
[[ "$NPM_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "First argument must be Nginx Proxy Manager's IP, like 10.0.0.134"
[[ "$LAN_RANGE" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$ ]] || fail "Second argument must be your LAN range, like 10.0.0.0/24"
grep -q '^ID=ubuntu' /etc/os-release || fail "This script is for Ubuntu."

# Refuse to turn off passwords unless a key is already set up, so you can't lock yourself out.
keys="/home/$ADMIN_USER/.ssh/authorized_keys"
[[ -s "$keys" ]] || fail "No SSH key found in $keys. Set up your key first (DEPLOYMENT.md, step 5)."

export DEBIAN_FRONTEND=noninteractive

step "1. Updates"
apt-get update
apt-get -y full-upgrade
apt-get install -y unattended-upgrades ca-certificates curl ufw
# Install security fixes automatically every day.
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

step "2. Docker"
if ! command -v docker >/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  codename="$(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")"
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
# Keep container logs from filling the disk.
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "local", "log-opts": { "max-size": "20m", "max-file": "5" } }
EOF
  systemctl restart docker
fi
systemctl enable --now docker
# Lets your admin user run docker without sudo (takes effect at next login).
usermod -aG docker "$ADMIN_USER"

step "3. Firewall"
ufw default deny incoming
ufw default allow outgoing
ufw allow from "$LAN_RANGE" to any port 22 proto tcp comment 'SSH from the LAN'
ufw allow from "$NPM_IP" to any port "$APP_PORT" proto tcp comment 'BeamHaven from Nginx Proxy Manager'
# Docker's published ports skip the rules above, so the same limit is added
# to Docker's own DOCKER-USER chain: connections to the app port from any
# address except Nginx Proxy Manager are dropped. Replies aren't affected.
rules=/etc/ufw/after.rules
sed -i '/^# BEGIN BEAMHAVEN DOCKER-USER/,/^# END BEAMHAVEN DOCKER-USER/d' "$rules"
cat >> "$rules" <<EOF
# BEGIN BEAMHAVEN DOCKER-USER
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -p tcp -m conntrack --ctorigdstport $APP_PORT --ctdir ORIGINAL ! -s $NPM_IP -j DROP
-A DOCKER-USER -j RETURN
COMMIT
# END BEAMHAVEN DOCKER-USER
EOF
ufw --force enable
ufw reload
ufw status verbose

step "4. SSH: keys only"
cat > /etc/ssh/sshd_config.d/10-beamhaven.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t || fail "The SSH settings didn't check out; nothing was reloaded."
systemctl reload ssh

echo
echo "Setup finished. Log out and back in so 'docker' works without sudo."
if [[ -f /var/run/reboot-required ]]; then
  echo "Updates need a restart: run  sudo reboot  then log back in."
fi
