#!/usr/bin/env bash
# One-time preparation of a fresh Ubuntu 22.04/24.04 VPS for VEINMusic:
# system updates, swap, Docker, firewall, fail2ban, automatic security
# updates and a checkout of the repository. Safe to run again.
#
#   curl --proto "=https" -fsSL https://raw.githubusercontent.com/Peaostrel/VEINMusic/VEIN/deploy/setup-server.sh | bash
#
# Optional: DISABLE_SSH_PASSWORD=1 turns off SSH password logins, but only
# when /root/.ssh/authorized_keys already holds a key.
set -euo pipefail

[[ "$(id -u)" -eq 0 ]] || { echo "Run as root" >&2; exit 1; }

# Never stop silently: name the line that failed
trap 'echo "!! setup-server.sh failed at line $LINENO" >&2' ERR

REPO_URL="${REPO_URL:-https://github.com/Peaostrel/VEINMusic.git}"
BRANCH="${BRANCH:-VEIN}"
APP_DIR="${APP_DIR:-/opt/veinmusic}"
SWAP_SIZE="${SWAP_SIZE:-2G}"

export DEBIAN_FRONTEND=noninteractive

echo "==> System packages"
# Keep locally modified config files (e.g. the provider's sshd_config)
# instead of stopping at an interactive prompt
APT_OPTS=(-yq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold)
apt-get update -q
apt-get "${APT_OPTS[@]}" upgrade
apt-get "${APT_OPTS[@]}" install ca-certificates curl git openssl ufw fail2ban unattended-upgrades

echo "==> Swap ($SWAP_SIZE)"
if ! swapon --show --noheadings | grep -q .; then
    fallocate -l "$SWAP_SIZE" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
echo 'vm.swappiness=10' > /etc/sysctl.d/99-veinmusic.conf
sysctl -q --system

echo "==> Docker"
if ! command -v docker >/dev/null 2>&1; then
    curl --proto "=https" --tlsv1.2 -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Firewall (SSH, HTTP, HTTPS)"
# `sshd -T` fails on some images (e.g. no /run/sshd yet); fall back to 22
ssh_port="$( (sshd -T 2>/dev/null || true) | awk '/^port /{print $2; exit}')"
ufw allow "${ssh_port:-22}/tcp"
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> fail2ban and automatic security updates"
systemctl enable --now fail2ban
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

echo "==> Journal size"
mkdir -p /etc/systemd/journald.conf.d
printf '[Journal]\nSystemMaxUse=200M\n' > /etc/systemd/journald.conf.d/size.conf
systemctl restart systemd-journald

if [[ "${DISABLE_SSH_PASSWORD:-0}" = "1" ]]; then
    if [[ -s /root/.ssh/authorized_keys ]]; then
        echo "==> Disabling SSH password logins"
        printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' \
            > /etc/ssh/sshd_config.d/10-veinmusic.conf
        systemctl reload ssh 2>/dev/null || systemctl reload sshd
    else
        echo "!! No key in /root/.ssh/authorized_keys: SSH passwords stay enabled" >&2
    fi
fi

echo "==> Code in $APP_DIR"
if [[ -d "$APP_DIR/.git" ]]; then
    git -C "$APP_DIR" fetch --depth 1 origin "$BRANCH"
    git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

echo
echo "Done. Next: SITE_DOMAIN=... API_DOMAIN=... ACME_EMAIL=... $APP_DIR/deploy/deploy.sh"
