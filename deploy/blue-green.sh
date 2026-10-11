#!/usr/bin/env bash
# Prepare a second release, probe both services, then reload the proxy.
# Exit 75 means the existing maintenance deployment is required instead.
set -euo pipefail
cd "$(dirname "$0")"
compose() { docker compose "$@"; }
state=.state
mkdir -p "$state" routing

schema_compatible() {
    compose run --rm --no-deps -T -e RUN_MIGRATIONS=0 --entrypoint python backend -c '
from alembic.config import Config
from alembic.script import ScriptDirectory
from alembic.runtime.migration import MigrationContext
from app.database import engine
import sys
with engine.connect() as connection:
    current = set(MigrationContext.configure(connection).get_current_heads())
expected = set(ScriptDirectory.from_config(Config("alembic.ini")).get_heads())
sys.exit(0 if current == expected else 1)
' >/dev/null
}

if ! compose exec -T caddy test -f /srv/routing/upstreams.caddy; then
    echo "Proxy needs the new routing mount; using maintenance deployment once."
    exit 75
fi
if ! schema_compatible; then
    echo "Schema differs or cannot be verified; using maintenance deployment."
    exit 75
fi
# Both copies briefly need memory. On a small VPS, swap can provide headroom.
available=$(awk '/^(MemAvailable|SwapFree):/ {total += $2} END {print total}' /proc/meminfo)
if (( available < 786432 )); then
    echo "Insufficient memory headroom for a second release; using maintenance deployment."
    exit 75
fi

release="$(date +%s)-$$"
api="vein-api-$release"
site="vein-site-$release"
tag=$(sed -n 's/^IMAGE_TAG=//p' .env | tail -n 1)
old_api=backend
old_site=frontend
old_tag="${PREVIOUS_IMAGE_TAG:-latest}"
old_id=$(compose ps -q backend)
if [[ -f "$state/active-release" ]]; then
    read -r old_api old_site old_tag old_image < "$state/active-release"
    old_id=$old_api
fi
old_image=$(docker inspect -f '{{.Image}}' "$old_id")
printf '(site_upstream) {\n reverse_proxy %s:3000\n}\n(api_upstream) {\n reverse_proxy %s:8000\n}\n' "$old_site" "$old_api" > "$state/before-switch.caddy"
switched=0

write_routes() {
    printf '(site_upstream) {\n reverse_proxy %s:3000\n}\n(api_upstream) {\n reverse_proxy %s:8000\n}\n' "$2" "$1" > routing/upstreams.next
    mv routing/upstreams.next routing/upstreams.caddy
}

reload_proxy() {
    compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null
    compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null
}

restore_workers() {
    printf '{"services":{"worker":{"image":"%s"},"monitor":{"image":"%s","environment":{"MONITOR_API_URL":"http://%s:8000/health"}}}}' "$old_image" "$old_image" "$old_api" > "$state/rollback-compose.json" # NOSONAR: HTTP is restricted to the unpublished Compose network; Caddy terminates public TLS.
    compose -f docker-compose.yml -f "$state/rollback-compose.json" up -d --no-deps worker monitor
}

cleanup_failure() {
    status=$?
    trap - EXIT
    if (( status != 0 )); then
        if (( switched )); then
            cp "$state/before-switch.caddy" routing/upstreams.next
            mv routing/upstreams.next routing/upstreams.caddy
            if ! reload_proxy || ! restore_workers; then
                touch maintenance/on
                echo "Rollback needs attention; maintenance mode retained." >&2
                exit "$status"
            fi
        fi
        docker rm -f "$api" "$site" >/dev/null 2>&1 || true
    fi
    exit "$status"
}
trap cleanup_failure EXIT

probe() {
    local container="$1" url="$2"
    for ((attempt=0; attempt<60; attempt++)); do
        if docker exec "$container" python -c "import urllib.request; urllib.request.urlopen('$url', timeout=4)" >/dev/null 2>&1; then return 0; fi
        sleep 2
    done
    return 1
}

echo "Starting candidate API (migrations disabled)."
compose run -d --no-deps --name "$api" -e RUN_MIGRATIONS=0 backend >/dev/null
probe "$api" http://127.0.0.1:8000/health
echo "Starting candidate site."
compose run -d --no-deps --name "$site" -e "API_INTERNAL_URL=http://$api:8000" frontend >/dev/null # NOSONAR: Internal API URL never leaves the unpublished Compose network; Caddy terminates public TLS.
site_ready=0
for ((attempt=0; attempt<60; attempt++)); do
    if docker exec "$site" node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then site_ready=1; break; fi
    sleep 2
done
[[ "$site_ready" == 1 ]]
# Probe actual database-backed API access, not just the process liveness.
probe "$api" http://127.0.0.1:8000/api/leaderboard
echo "Switching proxy to the verified release."
write_routes "$api" "$site"
switched=1
reload_proxy
API_UPSTREAM="$api" compose up -d --no-deps worker monitor
worker_ready=0
for ((attempt=0; attempt<15; attempt++)); do
    if compose exec -T worker arq --check app.worker.WorkerSettings >/dev/null 2>&1; then worker_ready=1; break; fi
    sleep 2
done
[[ "$worker_ready" == 1 ]]
probe "$api" http://127.0.0.1:8000/health

# Keep the immediately preceding release alive for a quick rollback.
if [[ -f "$state/previous-release" ]]; then
    read -r older_api older_site _ < "$state/previous-release"
    if [[ "$older_api" == backend ]]; then
        compose stop backend frontend
    elif [[ "$older_api" != "$old_api" ]]; then
        docker rm -f "$older_api" "$older_site" >/dev/null
    fi
fi
printf '%s %s %s %s\n' "$old_api" "$old_site" "$old_tag" "$old_image" > "$state/previous-release"
printf '%s %s %s %s\n' "$api" "$site" "$tag" "$(docker inspect -f '{{.Image}}' "$api")" > "$state/active-release"
cp "$state/before-switch.caddy" "$state/previous-upstreams.caddy"
rm -f maintenance/on
echo "Release switched; previous containers and image retained for rollback."
