#!/bin/sh
# Restore into a disposable PostgreSQL with no network. Never uses service credentials.
set -eu
DUMP="${1:?Usage: verify-backup.sh /path/to/recovered.dump [status-file]}"
MARKER="${2:-}"
test -r "$DUMP"
NAME="vein-restore-check-$(date +%s)-$$"
IMAGE="${RESTORE_POSTGRES_IMAGE:-public.ecr.aws/docker/library/postgres:15-alpine}"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
docker run -d --name "$NAME" --network none --memory 256m \
    -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=restore_check "$IMAGE" >/dev/null
ready=0
for attempt in $(seq 1 30); do
    # The entrypoint's temporary initialization server accepts Unix-socket
    # connections before stopping again. Only the final server listens on TCP.
    if docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres -d restore_check >/dev/null 2>&1; then ready=1; break; fi
    sleep 1
done
test "$ready" = 1
docker exec -i "$NAME" pg_restore -h 127.0.0.1 -U postgres -d restore_check --exit-on-error --no-owner --no-acl < "$DUMP"
docker exec "$NAME" psql -h 127.0.0.1 -U postgres -d restore_check -v ON_ERROR_STOP=1 \
    -c 'SELECT version_num FROM alembic_version; SELECT count(*) AS restored_users FROM users; SELECT count(*) AS restored_listens FROM scrobbles;'
if [ -n "$MARKER" ]; then touch "$MARKER"; fi
echo 'Backup restored and queried successfully in an isolated PostgreSQL; disposable database removed on exit.'
