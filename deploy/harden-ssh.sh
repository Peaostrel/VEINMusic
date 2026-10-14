#!/usr/bin/env bash
# Key-only SSH and a stricter fail2ban. Safe to run again.
#
#   sudo /opt/veinmusic/deploy/harden-ssh.sh
#
# Before running: add your public key (on your computer:
# `ssh-copy-id root@<server>`) and check `ssh root@<server>` logs in
# without a password. The script refuses to run without a key.
# Afterwards keep the current session open and test a new login in a second
# terminal. The hoster's web console (VNC) is not affected and stays a way in.
#
# Undo: rm /etc/ssh/sshd_config.d/10-veinmusic.conf && systemctl reload ssh
set -euo pipefail

[[ "$(id -u)" -eq 0 ]] || { echo "Run as root" >&2; exit 1; }

SSHD_DROPIN=/etc/ssh/sshd_config.d/10-veinmusic.conf
JAIL=/etc/fail2ban/jail.d/veinmusic.local

has_key=0
for keys in /root/.ssh/authorized_keys /home/*/.ssh/authorized_keys; do
    [[ -s "$keys" ]] && ssh-keygen -lf "$keys" >/dev/null 2>&1 && has_key=1
done
if [[ "$has_key" -ne 1 ]]; then
    echo "!! No valid key in any authorized_keys: password login stays on." >&2
    echo "   Add a key first: ssh-copy-id root@<server> (from your computer)." >&2
    exit 1
fi

grep -q '^Include /etc/ssh/sshd_config.d/\*.conf' /etc/ssh/sshd_config || {
    echo "!! /etc/ssh/sshd_config does not include sshd_config.d: not changed" >&2
    exit 1
}

echo "==> SSH: keys only"
backup=""
[[ -f "$SSHD_DROPIN" ]] && backup="$(cat "$SSHD_DROPIN")"
# sshd uses the first value it reads: "10-" comes before the provider's
# "50-cloud-init.conf", which may turn passwords back on
cat > "$SSHD_DROPIN" <<'CONF'
# Managed by deploy/harden-ssh.sh
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
MaxAuthTries 3
LoginGraceTime 30
X11Forwarding no
CONF
if ! sshd -t; then
    echo "!! sshd rejected the settings: restored the previous state" >&2
    if [[ -n "$backup" ]]; then printf '%s\n' "$backup" > "$SSHD_DROPIN"; else rm -f "$SSHD_DROPIN"; fi
    exit 1
fi
effective="$(sshd -T 2>/dev/null | awk '/^passwordauthentication /{print $2}')"
if [[ "$effective" != "no" ]]; then
    echo "!! Another sshd config earlier in order keeps passwords on:" >&2
    grep -ril 'PasswordAuthentication *yes' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/ >&2 || true
fi
systemctl reload ssh 2>/dev/null || systemctl reload sshd

echo "==> fail2ban: SSH jail"
if command -v fail2ban-client >/dev/null 2>&1; then
    cat > "$JAIL" <<'CONF'
# Managed by deploy/harden-ssh.sh
[sshd]
enabled = true
mode = aggressive
maxretry = 4
findtime = 10m
bantime = 1h
# Each repeat offence doubles the ban, up to a week
bantime.increment = true
bantime.maxtime = 1w
CONF
    if fail2ban-client -t >/dev/null; then
        systemctl restart fail2ban
    else
        echo "!! fail2ban rejected $JAIL: removed it" >&2
        rm -f "$JAIL"
    fi
else
    echo "!! fail2ban is not installed (setup-server.sh installs it)" >&2
fi

echo
sshd -T 2>/dev/null | grep -Ei '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|maxauthtries) '
echo
echo "Done. Keep this session open and check a new 'ssh root@<server>' in another terminal."
