#!/usr/bin/env bash
# Read-only security check of the server: open ports, firewall, SSH,
# fail2ban, recent logins and pending updates. Changes nothing and prints
# no secrets, so the output can be shared for review.
#
#   sudo /opt/veinmusic/deploy/check-server.sh
set -uo pipefail

[[ "$(id -u)" -eq 0 ]] || { echo "Run as root (sudo)" >&2; exit 1; }

section() { printf '\n===== %s =====\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

section "System"
. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME, kernel $(uname -r)"
uptime -p
[[ -f /var/run/reboot-required ]] && echo "!! Reboot required (installed updates wait for it)"
free -m | awk 'NR==1 || /Mem|Swap/'
df -h / | awk 'NR==2 {print "Disk /: " $5 " used of " $2}'

section "Pending updates"
if have apt; then
    apt list --upgradable 2>/dev/null | awk 'NR>1' > /tmp/.upgradable.$$
    echo "total: $(wc -l < /tmp/.upgradable.$$), security: $(grep -c -- '-security' /tmp/.upgradable.$$)"
    grep -- '-security' /tmp/.upgradable.$$ | cut -d/ -f1 | head -20
    rm -f /tmp/.upgradable.$$
fi
grep -h 'Unattended-Upgrade "1"' /etc/apt/apt.conf.d/*auto-upgrades 2>/dev/null >/dev/null \
    && echo "automatic security updates: on" || echo "!! automatic security updates: off"

section "Listening ports (outside localhost)"
ss -tulpnH 2>/dev/null | awk '$5 !~ /^(127\.|\[::1\]|::1)/ {print $1, $5, $7}' | sort -u

section "Docker published ports"
if have docker; then
    docker ps --format '{{.Names}}: {{.Ports}}' 2>/dev/null | grep -E '0\.0\.0\.0|\[::\]|:::' \
        || echo "none on all interfaces"
    echo "(Docker publishes ports past ufw: only 80/443 of caddy should be listed)"
fi

section "Firewall (ufw)"
if have ufw; then ufw status verbose 2>/dev/null; else echo "!! ufw not installed"; fi

section "SSH effective settings"
if have sshd; then
    sshd -T 2>/dev/null | grep -Ei '^(port|permitrootlogin|passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|permitemptypasswords|maxauthtries|logingracetime|x11forwarding|allowusers|allowgroups) '
    ssh -V 2>&1
fi

section "SSH keys allowed to log in"
for home in /root /home/*; do
    keys="$home/.ssh/authorized_keys"
    [[ -s "$keys" ]] || continue
    echo "$keys:"
    ssh-keygen -lf "$keys" 2>/dev/null | sed 's/^/  /'
done

section "Accounts that can log in"
awk -F: '$7 !~ /(nologin|false|sync)$/ {print $1 " (uid " $3 ", shell " $7 ")"}' /etc/passwd
echo "sudo group: $(getent group sudo | cut -d: -f4)"
empty=$(awk -F: '$2 == "" {print $1}' /etc/shadow)
[[ -n "$empty" ]] && echo "!! accounts without a password: $empty"
locked_root=$(passwd -S root 2>/dev/null | awk '{print $2}')
echo "root password: ${locked_root:-unknown} (P = set, L = locked)"

section "fail2ban"
if have fail2ban-client; then
    systemctl is-active fail2ban
    fail2ban-client status sshd 2>/dev/null | grep -E 'Currently|Total' || echo "!! sshd jail not active"
else
    echo "!! fail2ban not installed"
fi

section "SSH logins (7 days)"
since="7 days ago"
logs() { journalctl -q -u ssh -u sshd --since "$since" 2>/dev/null; }
echo "failed password attempts: $(logs | grep -c 'Failed password')"
echo "invalid user attempts: $(logs | grep -c 'Invalid user')"
echo "top attacking addresses:"
logs | grep -oE 'Failed password .* from [0-9a-f.:]+' | awk '{print $NF}' | sort | uniq -c | sort -rn | head -5
echo "successful logins:"
logs | grep 'Accepted ' | sed -E 's/^(\S+ \S+ \S+).*(Accepted \S+ for \S+ from \S+).*/\1 \2/' | tail -10
last -n 5 -a 2>/dev/null | head -6

echo
echo "Done. Nothing was changed."
