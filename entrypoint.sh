#!/bin/bash
set -e

: "${POSTGRES_USER:=marquee}"
: "${POSTGRES_DB:=marquee}"
if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "[entrypoint] POSTGRES_PASSWORD is not set. Refusing to start." >&2
  exit 1
fi

PG_BIN=$(dirname "$(find /usr/lib/postgresql -maxdepth 3 -name postgres | head -1)")
PGDATA=/var/lib/postgresql/data

# First run against an empty (or freshly mounted, empty) data volume —
# initialize the cluster. On every later start this directory already has
# a PG_VERSION file and initdb is skipped.
if [ ! -s "$PGDATA/PG_VERSION" ]; then
  echo "[entrypoint] Initializing Postgres data directory at $PGDATA..."
  mkdir -p "$PGDATA"
  chown -R postgres:postgres "$PGDATA"
  chmod 0700 "$PGDATA"
  su postgres -c "$PG_BIN/initdb -D $PGDATA --auth=trust" >/dev/null
fi

echo "[entrypoint] Starting Postgres..."
su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -l $PGDATA/postgresql.log -w -o '-c listen_addresses=localhost' start"

# Idempotent — safe to run on every start, not just the first one, since a
# role/database created on a previous run already satisfies these checks.
if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$POSTGRES_USER'\"" | grep -q 1; then
  echo "[entrypoint] Creating role $POSTGRES_USER..."
  su postgres -c "psql -c \"CREATE ROLE \\\"$POSTGRES_USER\\\" WITH LOGIN PASSWORD '$POSTGRES_PASSWORD';\""
else
  # Password may have changed since the role was first created (e.g. the
  # container was recreated with a different POSTGRES_PASSWORD) — keep
  # Postgres in sync with whatever's currently configured, since that's
  # also what DATABASE_URL below will be built from.
  su postgres -c "psql -c \"ALTER ROLE \\\"$POSTGRES_USER\\\" WITH PASSWORD '$POSTGRES_PASSWORD';\"" >/dev/null
fi

if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'\"" | grep -q 1; then
  echo "[entrypoint] Creating database $POSTGRES_DB..."
  su postgres -c "createdb -O \"$POSTGRES_USER\" \"$POSTGRES_DB\""
fi

export DATABASE_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@localhost:5432/$POSTGRES_DB"

echo "[entrypoint] Running database migrations..."
npx drizzle-kit migrate

echo "[entrypoint] Starting Marquee..."
exec "$@"
