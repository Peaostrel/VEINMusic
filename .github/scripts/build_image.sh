#!/usr/bin/env bash
set -euo pipefail

: "${IMAGE:?}" "${DOCKERFILE:?}" "${BASE_IMAGE_TAG:?}"
: "${GITHUB_EVENT_NAME:?}" "${GITHUB_REPOSITORY:?}" "${GITHUB_SHA:?}"

# Keep the runner's built-in BuildKit: a container driver adds another pull.
output=(--load)
if [[ "$GITHUB_EVENT_NAME" != "pull_request" ]]; then output=(--push); fi
log_file=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/vein-image-build.XXXXXX")
trap 'rm -f "$log_file"' EXIT

# Both registries carry the same Docker Official Image and version tag.
# After the ECR attempt, allow two attempts against Docker Hub.
for attempt in 0 1 2; do
    if (( attempt == 0 )); then
        base="public.ecr.aws/docker/library/$BASE_IMAGE_TAG"
    else
        base="docker.io/library/$BASE_IMAGE_TAG"
        sleep "$((attempt * 5))"
    fi
    echo "Building $DOCKERFILE using $base (attempt $((attempt + 1))/3)"
    if docker buildx build --progress=plain \
        --file "$DOCKERFILE" \
        --build-arg "BASE_IMAGE=$base" \
        --build-arg "NEXT_PUBLIC_API_URL=${PUBLIC_API_URL:-https://api.music.vein.guru}" \
        --build-arg "NEXT_PUBLIC_WS_URL=${PUBLIC_WS_HOST:-api.music.vein.guru}" \
        --label "org.opencontainers.image.source=https://github.com/$GITHUB_REPOSITORY" \
        --tag "$IMAGE:latest" --tag "$IMAGE:$GITHUB_SHA" \
        "${output[@]}" . 2>&1 | tee "$log_file"; then
        exit 0
    else
        build_status=${PIPESTATUS[0]}
        # A failed tee must not turn a successful Docker exit into CI success.
        if (( build_status == 0 )); then exit 1; fi
    fi

    # Retry only transient base-image metadata failures. Compilation, package,
    # authorization and image publication errors retain their original failure.
    if (( attempt == 2 )) ||
        ! grep -qi 'failed to resolve source metadata' "$log_file" ||
        ! grep -Eqi '(^|[^[:alnum:]])(429|500|502|503|504)([^[:alnum:]]|$)|Too Many Requests|Data limit exceeded|TLS handshake timeout|i/o timeout|connection reset|unexpected EOF|temporary failure in name resolution' "$log_file"; then
        exit "$build_status"
    fi
    echo "::warning::Base-image registry temporarily unavailable; retrying with Docker Hub."
done
