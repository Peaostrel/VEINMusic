#!/bin/sh
set -e

# The database schema is managed by Alembic. Only one service (the API)
# should run migrations, so this is opt-in via RUN_MIGRATIONS=1.
if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
    echo "Applying database migrations..."
    python -m app.core.migrate
fi

exec "$@"
