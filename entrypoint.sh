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
  su postgres -c "$PG_BIN/initdb -D $PGDATA --auth-local=peer --auth-host=scram-sha-256" >/dev/null
fi

# Who may connect to Postgres, rewritten on every start so installs whose
# data directory was initialized with --auth=trust (every one before this)
# get it too. Trust let anything in the container connect as any role,
# superuser included, without a password — so the app, which runs
# unprivileged below, could have taken over the database and the files
# Postgres owns. Now only the postgres OS user reaches the postgres role
# (peer, over the unix socket — how this script manages roles), and
# everything else needs a password (the app role's is re-set below on
# every start, stored as SCRAM). The previous file is kept once, in case
# it had been edited by hand.
HBA="$PGDATA/pg_hba.conf"
HBA_MARKER="# Managed by Marquee's entrypoint.sh"
if ! grep -qF "$HBA_MARKER" "$HBA" 2>/dev/null; then
  [ -f "$HBA" ] && cp -p "$HBA" "$HBA.before-marquee"
  echo "[entrypoint] Requiring passwords for Postgres connections (previous pg_hba.conf kept as pg_hba.conf.before-marquee)..."
fi
cat > "$HBA" <<EOF
$HBA_MARKER — rewritten on every start.
# TYPE  DATABASE  USER      ADDRESS       METHOD
local   all       postgres                peer
local   all       all                     scram-sha-256
host    all       all       127.0.0.1/32  scram-sha-256
host    all       all       ::1/128       scram-sha-256
EOF
chown postgres:postgres "$HBA"
chmod 0600 "$HBA"

echo "[entrypoint] Starting Postgres..."
su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -l $PGDATA/postgresql.log -w -o '-c listen_addresses=localhost' start"

# Set up as soon as Postgres is running, not once the app has started: a
# step that fails in between (a migration, say) exits through here too and
# still shuts Postgres down cleanly instead of leaving it to be killed.
# Not `exec` for the app further down: this script stays PID 1 so that on
# `docker stop` it can stop the app first and then Postgres, instead of
# Docker killing Postgres mid-write when the stop timeout runs out.
APP_PID=
stop_postgres() {
  su postgres -c "$PG_BIN/pg_ctl -D $PGDATA -m fast -w stop" >/dev/null 2>&1 || true
}
shutdown() {
  if [ -n "$APP_PID" ]; then
    echo "[entrypoint] Stopping Marquee..."
    kill -TERM "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  echo "[entrypoint] Stopping Postgres..."
  exit 0
}
trap stop_postgres EXIT
trap shutdown TERM INT

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

# The rolling log file (Settings › Logs, MARQUEE_LOG_DIR): a folder mounted
# from the host arrives owned by whoever made it, so hand it to the app.
if [ -n "$MARQUEE_LOG_DIR" ]; then
  mkdir -p "$MARQUEE_LOG_DIR"
  chown -R node:node "$MARQUEE_LOG_DIR" 2>/dev/null || echo "[entrypoint] Couldn't take ownership of $MARQUEE_LOG_DIR; the log may not be saved there." >&2
fi

# Everything from here on runs as the unprivileged `node` user, not root:
# the app never needs root, and shouldn't hold it if it's ever compromised.
# What it writes at runtime (.next's caches) is owned by node in the image.
# A copy of the database before an update changes it, so a migration that
# goes wrong can be undone: only when this image has migrations the database
# hasn't had yet (the newest one in the journal is newer than the last one
# drizzle recorded — the same test drizzle itself uses), and not on a first
# start, when there's nothing to keep. Stored in the data volume next to the
# database, the newest few kept. Restore one with:
#   pg_restore --clean --if-exists -d "$POSTGRES_DB" <file>
BACKUP_DIR="$PGDATA/marquee-backups"
BACKUPS_KEPT=3
LATEST_MIGRATION=$(node -e 'const j=require("/app/lib/db/migrations/meta/_journal.json"); process.stdout.write(String(Math.max(...j.entries.map((e) => e.when))))')
APPLIED_MIGRATION=$(su postgres -c "psql -d \"$POSTGRES_DB\" -tAc \"SELECT CASE WHEN to_regclass('drizzle.__drizzle_migrations') IS NULL THEN '' ELSE (SELECT COALESCE(MAX(created_at), 0)::text FROM drizzle.__drizzle_migrations) END\"")
if [ -n "$APPLIED_MIGRATION" ] && [ "$APPLIED_MIGRATION" -lt "$LATEST_MIGRATION" ]; then
  mkdir -p "$BACKUP_DIR"
  chown postgres:postgres "$BACKUP_DIR"
  chmod 0700 "$BACKUP_DIR"
  VERSION=$(node -p 'require("/app/package.json").version')
  BACKUP="$BACKUP_DIR/before-$VERSION-$(date -u +%Y%m%d-%H%M%S).dump"
  echo "[entrypoint] New database migrations to run; backing the database up to $BACKUP first..."
  if ! su postgres -c "pg_dump -Fc -d \"$POSTGRES_DB\" -f \"$BACKUP\""; then
    rm -f "$BACKUP"
    echo "[entrypoint] Couldn't back the database up (is the disk full?), so not migrating it. Refusing to start." >&2
    exit 1
  fi
  # Only the newest few: each is a full copy of the database.
  ls -1t "$BACKUP_DIR"/before-*.dump 2>/dev/null | tail -n +$((BACKUPS_KEPT + 1)) | xargs -r rm -f
fi

echo "[entrypoint] Running database migrations..."
if ! gosu node npx drizzle-kit migrate; then
  echo "[entrypoint] Database migration failed. Refusing to start.${BACKUP:+ The database as it was before is in $BACKUP.}" >&2
  exit 1
fi

echo "[entrypoint] Starting Marquee..."
gosu node "$@" &
APP_PID=$!
set +e
wait "$APP_PID"
STATUS=$?
# Only reached when the app exited on its own (a signal runs shutdown above
# and exits there); the EXIT trap still shuts Postgres down cleanly.
exit "$STATUS"
