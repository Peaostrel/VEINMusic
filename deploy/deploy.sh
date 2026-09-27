#!/usr/bin/env bash
# Deploys (or updates) VEINMusic from prebuilt images.
#
# First run creates deploy/.env with generated secrets; pass the domains:
#   SITE_DOMAIN=music.vein.guru API_DOMAIN=api.music.vein.guru \
#   ACME_EMAIL=you@example.com ./deploy.sh
# Later runs pull the newest images and restart what changed:
#   ./deploy.sh
# SKIP_PULL=1 uses images already present locally (e.g. built on the host).
set -euo pipefail
cd "$(dirname "$0")"

compose() { docker compose "$@"; }

# Random string of letters and digits
rand() {
    local length="$1"
    openssl rand -base64 96 | tr -dc 'A-Za-z0-9' | head -c "$length"
}

set_var() {
    # set_var NAME VALUE: replace the NAME= line in .env
    local name="$1" value="$2"
    if grep -q "^${name}=" .env; then
        sed -i "s|^${name}=.*|${name}=${value}|" .env
    else
        printf '%s=%s\n' "$name" "$value" >> .env
    fi
}

get_var() {
    local name="$1"
    sed -n "s/^${name}=//p" .env | tail -n 1
}

if [[ ! -f .env ]]; then
    echo "==> Creating .env with fresh secrets"
    cp .env.example .env
    chmod 600 .env
    set_var POSTGRES_PASSWORD "$(rand 40)"
    set_var SECRET_KEY "$(rand 64)"
    set_var REDIS_PASSWORD "$(rand 40)"
    # Fernet key: url-safe base64 of 32 random bytes
    set_var TOKEN_ENCRYPTION_KEY "$(openssl rand 32 | base64 | tr '+/' '-_')"
fi

for name in SITE_DOMAIN API_DOMAIN ACME_EMAIL IMAGE_TAG; do
    if [[ -n "${!name:-}" ]]; then
        set_var "$name" "${!name}"
    fi
done

for name in SITE_DOMAIN API_DOMAIN ACME_EMAIL; do
    if [[ -z "$(get_var "$name")" ]]; then
        echo "Set $name (in .env or as an environment variable)." >&2
        exit 1
    fi
done

if grep -q '=generated$' .env; then
    echo "Some secrets in .env still read 'generated'; fill them in first." >&2
    exit 1
fi

if [[ "${SKIP_PULL:-0}" != "1" ]]; then
    echo "==> Pulling images"
    # A failed pull (e.g. Docker Hub rate limit) keeps the local copy;
    # `up` still fails if an image is missing entirely
    compose pull -q --ignore-pull-failures
fi

if [[ -z "$(get_var VAPID_PRIVATE_KEY)" ]]; then
    echo "==> Generating Web Push keys"
    keys="$(compose run --rm --no-deps -T --entrypoint python backend \
        -m app.services.push_notifications)"
    set_var VAPID_PRIVATE_KEY "$(printf '%s\n' "$keys" | sed -n 's/^VAPID_PRIVATE_KEY=//p')"
    set_var VAPID_PUBLIC_KEY "$(printf '%s\n' "$keys" | sed -n 's/^VAPID_PUBLIC_KEY=//p')"
fi

# While the containers restart, Caddy answers with the "update in
# progress" page (see Caddyfile); open pages show the same notice and
# reload once the new version is up. Removed on any exit.
if compose ps -q backend 2>/dev/null | grep -q .; then
    touch maintenance/on
fi
trap 'rm -f maintenance/on' EXIT

echo "==> Starting"
compose up -d --remove-orphans

echo "==> Waiting for the API"
for _ in $(seq 1 60); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$(compose ps -q backend)" 2>/dev/null || true)"
    [[ "$status" = "healthy" ]] && break
    sleep 3
done
echo "==> Waiting for the site"
for _ in $(seq 1 30); do
    compose exec -T frontend node -e \
        "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))" \
        >/dev/null 2>&1 && break
    sleep 2
done
rm -f maintenance/on
compose ps
docker image prune -f >/dev/null
# Older releases (every commit has its own tag): drop the ones no container uses
docker image prune -af --filter \
    "label=org.opencontainers.image.source=https://github.com/Peaostrel/VEINMusic" >/dev/null

if [[ "${status:-}" != "healthy" ]]; then
    echo "!! The API is not healthy yet: docker compose logs backend" >&2
    exit 1
fi
echo "Done: https://$(get_var SITE_DOMAIN)"
