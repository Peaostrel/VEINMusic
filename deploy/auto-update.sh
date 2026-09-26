#!/usr/bin/env bash
# Deploys the newest commit of the VEIN branch once GitHub Actions has
# published its images. Run by veinmusic-update.timer (see
# install-auto-update.sh); safe to run by hand.
#
# Each commit is deployed with its own image tag (the commit SHA), so the
# code on disk and the running images always match. A commit whose images
# are not published yet is simply picked up on a later run; a commit whose
# deploy fails is retried MAX_ATTEMPTS times, then skipped until a newer
# commit arrives.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BRANCH="${BRANCH:-VEIN}"
STATE_DIR="$APP_DIR/deploy/.state"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"
IMAGES=(ghcr.io/peaostrel/veinmusic-backend ghcr.io/peaostrel/veinmusic-frontend)

# One run at a time
exec 9>"/tmp/veinmusic-update.lock"
flock -n 9 || exit 0

mkdir -p "$STATE_DIR"
cd "$APP_DIR"

git fetch -q --depth 1 origin "$BRANCH"
target="$(git rev-parse FETCH_HEAD)"
deployed="$(cat "$STATE_DIR/deployed" 2>/dev/null || true)"
# "failed" holds "<sha> <attempts>" for the commit that last failed
read -r failed_sha attempts 2>/dev/null < "$STATE_DIR/failed" || true
[[ "${failed_sha:-}" == "$target" ]] || attempts=0

if [[ "$target" == "$deployed" ]] || (( attempts >= MAX_ATTEMPTS )); then
    exit 0
fi

for image in "${IMAGES[@]}"; do
    if ! docker manifest inspect "$image:$target" >/dev/null 2>&1; then
        echo "Images for ${target:0:7} are not published yet"
        exit 0
    fi
done

echo "==> Deploying ${target:0:7} (was ${deployed:0:7})"
git reset -q --hard "$target"

if IMAGE_TAG="$target" "$APP_DIR/deploy/deploy.sh"; then
    echo "$target" > "$STATE_DIR/deployed"
    rm -f "$STATE_DIR/failed"
    echo "==> Deployed ${target:0:7}"
else
    echo "$target $((attempts + 1))" > "$STATE_DIR/failed"
    echo "!! Deploy of ${target:0:7} failed (attempt $((attempts + 1))/$MAX_ATTEMPTS)" >&2
    exit 1
fi
