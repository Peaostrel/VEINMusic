#!/usr/bin/env bash
# Return traffic and workers to the retained, same-schema previous release.
set -euo pipefail
cd "$(dirname "$0")"
state=.state
mkdir -p "$state"
exec 8>"$state/release.lock"
flock -w 60 8
if [[ ! -f "$state/previous-release" || ! -f "$state/previous-upstreams.caddy" ]]; then
    echo "No retained same-schema release. Use the documented manual rollback procedure." >&2
    exit 1
fi
read -r api site tag image < "$state/previous-release"
if [[ "$api" == backend ]]; then
    api_container=$(docker compose ps -q backend)
    site_container=$(docker compose ps -q frontend)
else
    api_container=$api
    site_container=$site
fi
docker exec "$api_container" python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"
docker exec "$site_container" node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
# Never roll code back across a migration. Retained versions have the same head.
docker exec "$api_container" python -c '
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.runtime.migration import MigrationContext
from app.database import engine
import sys
with engine.connect() as connection:
    current = set(MigrationContext.configure(connection).get_current_heads())
sys.exit(0 if current == set(ScriptDirectory.from_config(Config("alembic.ini")).get_heads()) else 1)
'
cp routing/upstreams.caddy "$state/rollback-start.caddy"
cp "$state/previous-upstreams.caddy" routing/upstreams.next
mv routing/upstreams.next routing/upstreams.caddy
if ! docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile || ! docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile; then
    cp "$state/rollback-start.caddy" routing/upstreams.next
    mv routing/upstreams.next routing/upstreams.caddy
    docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile || touch maintenance/on
    exit 1
fi
printf '{"services":{"worker":{"image":"%s"},"monitor":{"image":"%s","environment":{"MONITOR_API_URL":"http://%s:8000/health"}}}}' "$image" "$image" "$api" > "$state/rollback-compose.json"
if ! docker compose -f docker-compose.yml -f "$state/rollback-compose.json" up -d --no-deps worker monitor; then
    touch maintenance/on
    echo "Worker rollback failed; maintenance mode retained." >&2
    exit 1
fi
cp "$state/previous-release" "$state/active-release"
sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=$tag/" .env
printf '%s\n' "$tag" > "$state/deployed"
rm -f "$state/previous-release" "$state/previous-upstreams.caddy" maintenance/on
echo "Rolled back. Disable the auto-update timer before rollback to prevent redeployment."
