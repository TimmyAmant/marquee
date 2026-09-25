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
#
# The password reaches psql through a file rather than a nested shell
# string: inside `su -c "..."` a quote, "$" or backtick in it would be
# parsed a second time (or break the SQL), so a perfectly good password
# could keep the container from starting. Only the SQL quoting rule
# applies here (a single quote doubles).
SQL_PASSWORD=${POSTGRES_PASSWORD//\'/\'\'}
ROLE_SQL=$(mktemp)
chown postgres:postgres "$ROLE_SQL"
chmod 600 "$ROLE_SQL"
if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='$POSTGRES_USER'\"" | grep -q 1; then
  echo "[entrypoint] Creating role $POSTGRES_USER..."
  printf "CREATE ROLE \"%s\" WITH LOGIN PASSWORD '%s';\n" "$POSTGRES_USER" "$SQL_PASSWORD" > "$ROLE_SQL"
else
  # Password may have changed since the role was first created (e.g. the
  # container was recreated with a different POSTGRES_PASSWORD) — keep
  # Postgres in sync with whatever's currently configured, since that's
  # also what DATABASE_URL below will be built from.
  printf "ALTER ROLE \"%s\" WITH PASSWORD '%s';\n" "$POSTGRES_USER" "$SQL_PASSWORD" > "$ROLE_SQL"
fi
su postgres -c "psql -q -f '$ROLE_SQL'"
rm -f "$ROLE_SQL"

if ! su postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='$POSTGRES_DB'\"" | grep -q 1; then
  echo "[entrypoint] Creating database $POSTGRES_DB..."
  su postgres -c "createdb -O \"$POSTGRES_USER\" \"$POSTGRES_DB\""
fi

# Percent-encoded, because a password straight out of `openssl rand -base64`
# has a "/" in it half the time, and postgres-js refuses the whole URL as
# invalid when one turns up in the userinfo.
URL_PASSWORD=$(node -e 'process.stdout.write(encodeURIComponent(process.env.POSTGRES_PASSWORD))')
export DATABASE_URL="postgres://$POSTGRES_USER:$URL_PASSWORD@localhost:5432/$POSTGRES_DB"

echo "[entrypoint] Running database migrations..."
npx drizzle-kit migrate

echo "[entrypoint] Starting Marquee..."
# Not `exec`: this script stays PID 1 so that on `docker stop` it can stop
# the app first and then shut Postgres down cleanly, instead of Docker
# killing Postgres mid-write when the stop timeout runs out.
stop_postgres() {
  su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -m fast -w stop" >/dev/null 2>&1 || true
}
shutdown() {
  echo "[entrypoint] Stopping Marquee..."
  kill -TERM "$APP_PID" 2>/dev/null || true
  wait "$APP_PID" 2>/dev/null || true
  echo "[entrypoint] Stopping Postgres..."
  stop_postgres
  exit 0
}
trap shutdown TERM INT

"$@" &
APP_PID=$!
set +e
wait "$APP_PID"
STATUS=$?
# Only reached when the app exited on its own (a signal runs shutdown above
# and exits there) — still leave Postgres in a clean state.
stop_postgres
exit "$STATUS"
