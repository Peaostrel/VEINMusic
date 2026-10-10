#!/bin/sh
# Copies only a completed pg_dump to an encrypted, pre-initialized repository.
set -eu
: "${RESTIC_REPOSITORY:?Configure the external repository}"
: "${RESTIC_PASSWORD_FILE:?Configure the repository password file}"
INTERVAL="${OFFSITE_INTERVAL_SEC:-86400}"
RETRY="${OFFSITE_RETRY_SEC:-60}"
DIR="${BACKUP_DIR:-/backups}"

backup_once() {
    latest="$(find "$DIR" -maxdepth 1 -type f -name '*.dump' | sort | tail -n 1)"
    if [ -z "$latest" ]; then
        echo '[offsite] No completed database dump yet' >&2
        return 1
    fi
    # Never auto-init: a network/auth error must not create a new repository.
    restic snapshots --latest 1 >/dev/null || return 1
    restic backup --host veinmusic-server --tag veinmusic-postgres "$latest" || return 1
    touch /tmp/offsite-last-success
    echo '[offsite] Encrypted external backup completed'
}

if [ "${OFFSITE_RUN_ONCE:-0}" = "1" ]; then
    backup_once
    exit "$?"
fi
while true; do
    if backup_once; then sleep "$INTERVAL"; else sleep "$RETRY"; fi
done
