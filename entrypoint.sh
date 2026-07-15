#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
npx drizzle-kit migrate

echo "[entrypoint] Starting Marquee..."
exec "$@"
