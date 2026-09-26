#!/usr/bin/env bash
# Installs a systemd timer that runs auto-update.sh every 5 minutes: every
# merge into VEIN reaches the server once its images are built.
#
#   /opt/veinmusic/deploy/install-auto-update.sh
#
# Status:   systemctl list-timers veinmusic-update.timer
# Log:      journalctl -u veinmusic-update -n 50
# Disable:  systemctl disable --now veinmusic-update.timer
set -euo pipefail

[[ "$(id -u)" -eq 0 ]] || { echo "Run as root" >&2; exit 1; }

script="$(cd "$(dirname "$0")" && pwd)/auto-update.sh"
chmod +x "$script"

cat > /etc/systemd/system/veinmusic-update.service <<UNIT
[Unit]
Description=Deploy the newest VEINMusic release
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
ExecStart=$script
UNIT

cat > /etc/systemd/system/veinmusic-update.timer <<'UNIT'
[Unit]
Description=Check for a new VEINMusic release every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
RandomizedDelaySec=30s

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now veinmusic-update.timer
echo "Auto-update enabled. Log: journalctl -u veinmusic-update -n 50"
