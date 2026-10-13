#!/usr/bin/env bash
# Run once after putting the site behind Cloudflare (orange cloud in DNS),
# and again from time to time: Cloudflare rarely changes its networks.
#
#   deploy/cloudflare.sh          # trust Cloudflare's networks
#   deploy/cloudflare.sh --off    # back to direct connections
#
# Without this, Caddy and the API see Cloudflare's address instead of the
# visitor's: every visitor would share one rate limit and address blocks
# would hit everyone. With it, only connections from Cloudflare's networks
# may name the visitor's address (nobody else can forge it).
set -euo pipefail

cd "$(dirname "$0")"
ENV_FILE=.env
CADDY_IP=172.30.0.10

[[ -f "$ENV_FILE" ]] || { echo "No deploy/.env yet: run deploy.sh first" >&2; exit 1; }

set_var() {
    local name="$1" value="$2"
    if grep -q "^${name}=" "$ENV_FILE"; then
        # Values are IP ranges, spaces and commas: no sed metacharacters
        sed -i "s|^${name}=.*|${name}=${value}|" "$ENV_FILE"
    else
        printf '%s=%s\n' "$name" "$value" >> "$ENV_FILE"
    fi
}

if [[ "${1:-}" == "--off" ]]; then
    set_var TRUSTED_PROXIES "private_ranges"
    set_var FORWARDED_ALLOW_IPS "$CADDY_IP"
    echo "Cloudflare trust removed. Apply with: deploy/deploy.sh"
    exit 0
fi

ranges="$(
    curl --proto "=https" --tlsv1.2 -fsS https://www.cloudflare.com/ips-v4
    echo
    curl --proto "=https" --tlsv1.2 -fsS https://www.cloudflare.com/ips-v6
)"
# Keep only well-formed networks, one per line
ranges="$(printf '%s\n' "$ranges" | grep -E '^[0-9a-fA-F:.]+/[0-9]{1,3}$' || true)"
count="$(printf '%s\n' "$ranges" | grep -c . || true)"
if [[ "$count" -lt 10 ]]; then
    echo "!! Got $count networks from cloudflare.com, expected ~20: nothing changed" >&2
    exit 1
fi

set_var TRUSTED_PROXIES "\"$(printf '%s\n' "$ranges" | paste -sd' ')\""
set_var FORWARDED_ALLOW_IPS "$CADDY_IP,$(printf '%s\n' "$ranges" | paste -sd',')"
echo "Trusting $count Cloudflare networks. Apply with: deploy/deploy.sh"
echo "Then let only Cloudflare reach ports 80/443 in your hosting provider's firewall"
echo "(see docs/security-setup.md), or attackers can bypass it by the server's IP."
