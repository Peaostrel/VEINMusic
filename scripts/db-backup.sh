#!/bin/sh
# Periodic PostgreSQL backups for docker-compose (service "db-backup").
#
# Every BACKUP_INTERVAL_SEC (default: once a day) writes a compressed
# custom-format dump to /backups and deletes dumps older than
# BACKUP_KEEP_DAYS (default 7). Restore with:
#   docker compose exec -T db-backup pg_restore --clean --if-exists \
#     -d "$PGDATABASE" /backups/<file>.dump
set -eu

INTERVAL="${BACKUP_INTERVAL_SEC:-86400}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
DIR="${BACKUP_DIR:-/backups}"

mkdir -p "$DIR"
while true; do
    stamp="$(date -u +%Y%m%d-%H%M%S)"
    file="$DIR/${PGDATABASE}-${stamp}.dump"
    # Write to a temporary name so a failed dump never looks like a backup
    if pg_dump --format=custom --compress=6 --file="$file.part"; then
        mv "$file.part" "$file"
        echo "[backup] $(date -u) wrote $file"
    else
        rm -f "$file.part"
        echo "[backup] $(date -u) pg_dump failed" >&2
    fi
    find "$DIR" -name '*.dump' -type f -mtime +"$KEEP_DAYS" -delete
    sleep "$INTERVAL"
done
