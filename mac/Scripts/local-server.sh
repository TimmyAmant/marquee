#!/bin/bash
# A throwaway Marquee server for LiveContractTests: the server source exported
# from git (never the working checkout), its own Postgres container, and a
# seeded admin + member with TMDb configured through the API.
#
#   Scripts/local-server.sh up       export, build (cached per commit), start, seed
#   Scripts/local-server.sh down     stop the server and remove the container
#   Scripts/local-server.sh status   what's running
#
# Then:
#   TEST_RUNNER_MARQUEE_LIVE_URL=http://127.0.0.1:3100 \
#   TEST_RUNNER_MARQUEE_LIVE_USER=tester TEST_RUNNER_MARQUEE_LIVE_PASSWORD=correct-horse-battery \
#   xcodebuild … test
#
# Only ever touches the container named below and the process it started.
set -euo pipefail

REPO="${MARQUEE_SERVER_REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
REF="${MARQUEE_SERVER_REF:-origin/main}"
WORK="${MARQUEE_LOCAL_SERVER_DIR:-${TMPDIR:-/tmp}marquee-local-server}"
APP_DIR="$WORK/app"
CONTAINER="marquee-mac-test-db"
DB_PORT=55433
APP_PORT=3100
BASE_URL="http://127.0.0.1:$APP_PORT"

ADMIN_USER="tester"
ADMIN_PASSWORD="correct-horse-battery"
MEMBER_USER="member"
MEMBER_PASSWORD="correct-horse-battery"

DB_PASSWORD="marquee-local-test"
DATABASE_URL="postgres://marquee:$DB_PASSWORD@127.0.0.1:$DB_PORT/marquee"
PID_FILE="$WORK/server.pid"
LOG_FILE="$WORK/server.log"
SECRETS_FILE="$WORK/secrets.env"

log() { printf '[local-server] %s\n' "$*" >&2; }
die() { log "error: $*"; exit 1; }

server_pid() {
  [[ -f "$PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$PID_FILE")"
  kill -0 "$pid" 2>/dev/null || return 1
  echo "$pid"
}

server_info() {
  curl -fsS --max-time 5 "$BASE_URL/api/v1/server-info" 2>/dev/null
}

# MARK: Export + build

export_source() {
  local commit stamp
  commit="$(git -C "$REPO" rev-parse "$REF")"
  stamp="$WORK/built-commit"
  if [[ -f "$stamp" && "$(cat "$stamp")" == "$commit" && -d "$APP_DIR/.next" ]]; then
    log "Using the existing build of ${commit:0:7}"
    return
  fi

  log "Exporting $REF (${commit:0:7}) from $REPO"
  rm -rf "$APP_DIR"
  mkdir -p "$APP_DIR"
  git -C "$REPO" archive "$commit" | tar -x -C "$APP_DIR"

  # The exported lockfile matching the checkout's means its node_modules is
  # the same install: clone it (APFS copy-on-write, so it's instant and takes
  # no space). A symlink would point outside the project root, which
  # Turbopack refuses.
  if [[ -d "$REPO/node_modules" ]] && cmp -s "$APP_DIR/package-lock.json" "$REPO/package-lock.json"; then
    log "Lockfile matches the checkout; cloning its node_modules"
    cp -Rc "$REPO/node_modules" "$APP_DIR/node_modules"
  else
    log "Lockfile differs from the checkout; running npm ci"
    (cd "$APP_DIR" && npm ci --no-audit --no-fund)
  fi

  log "Building (next build)…"
  (cd "$APP_DIR" && env -u TMDB_ACCESS_TOKEN -u TMDB_API_KEY DATABASE_URL="$DATABASE_URL" \
    node node_modules/next/dist/bin/next build) >"$WORK/build.log" 2>&1 \
    || { tail -40 "$WORK/build.log" >&2; die "next build failed (full log: $WORK/build.log)"; }
  echo "$commit" >"$stamp"
}

# MARK: Database

start_database() {
  if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    log "Removing the previous $CONTAINER container"
    docker rm -f "$CONTAINER" >/dev/null
  fi
  log "Starting Postgres ($CONTAINER on 127.0.0.1:$DB_PORT)"
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_USER=marquee -e POSTGRES_PASSWORD="$DB_PASSWORD" -e POSTGRES_DB=marquee \
    -p "127.0.0.1:$DB_PORT:5432" \
    postgres:15 >/dev/null

  for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U marquee -d marquee >/dev/null 2>&1; then
      # pg_isready passes during the image's init restart; wait for a real query.
      if docker exec "$CONTAINER" psql -U marquee -d marquee -tAc "select 1" >/dev/null 2>&1; then
        return
      fi
    fi
    sleep 1
  done
  die "Postgres didn't become ready"
}

run_migrations() {
  # The same step entrypoint.sh runs before starting the app.
  log "Running migrations (drizzle-kit migrate)"
  (cd "$APP_DIR" && DATABASE_URL="$DATABASE_URL" npx --no-install drizzle-kit migrate) >"$WORK/migrate.log" 2>&1 \
    || { tail -40 "$WORK/migrate.log" >&2; die "migrations failed (full log: $WORK/migrate.log)"; }
}

# MARK: Server

start_server() {
  if [[ ! -f "$SECRETS_FILE" ]]; then
    umask 077
    {
      echo "AUTH_SECRET=$(openssl rand -base64 32)"
      echo "MASTER_ENCRYPTION_KEY=$(openssl rand -base64 32)"
    } >"$SECRETS_FILE"
  fi
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"

  log "Starting Marquee on $BASE_URL"
  # No TMDb credential in the environment: the harness configures TMDb
  # through the API, the way an admin would.
  (cd "$APP_DIR" && exec env -u TMDB_ACCESS_TOKEN -u TMDB_API_KEY -u TVDB_API_KEY -u TVDB_PIN \
    NODE_ENV=production \
    DATABASE_URL="$DATABASE_URL" \
    AUTH_SECRET="$AUTH_SECRET" \
    AUTH_TRUST_HOST=true \
    MASTER_ENCRYPTION_KEY="$MASTER_ENCRYPTION_KEY" \
    PORT="$APP_PORT" \
    node node_modules/next/dist/bin/next start -p "$APP_PORT" -H 127.0.0.1) >"$LOG_FILE" 2>&1 &
  echo $! >"$PID_FILE"

  for _ in $(seq 1 90); do
    if server_info | grep -q '"app":"marquee"'; then
      return
    fi
    server_pid >/dev/null || { tail -40 "$LOG_FILE" >&2; die "the server exited (log: $LOG_FILE)"; }
    sleep 1
  done
  die "the server didn't answer server-info (log: $LOG_FILE)"
}

stop_server() {
  local pid
  if pid="$(server_pid)"; then
    log "Stopping the server (pid $pid)"
    pkill -TERM -P "$pid" 2>/dev/null || true
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -KILL "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  # A next-server child that outlived its parent: only a process running from
  # our export directory and listening on our port.
  local listener
  for listener in $(lsof -ti "tcp:$APP_PORT" -sTCP:LISTEN 2>/dev/null || true); do
    if [[ "$(lsof -p "$listener" -a -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')" == "$APP_DIR" ]]; then
      log "Stopping leftover server process $listener"
      kill -TERM "$listener" 2>/dev/null || true
    fi
  done
}

# MARK: Seeding

# `api METHOD PATH [TOKEN]` with the JSON body on stdin; prints the body and
# fails on a non-2xx status unless it's listed in $ALLOW_STATUS.
api() {
  local method="$1" path="$2" token="${3:-}" status body
  local args=(-sS --max-time 60 -X "$method" -H "Content-Type: application/json" -w '\n%{http_code}' --data-binary @-)
  [[ -n "$token" ]] && args+=(-H "Authorization: Bearer $token")
  body="$(curl "${args[@]}" "$BASE_URL/api/v1$path")"
  status="${body##*$'\n'}"
  body="${body%$'\n'*}"
  if [[ "$status" != 2* && " ${ALLOW_STATUS:-} " != *" $status "* ]]; then
    die "$method $path answered $status: $(printf '%s' "$body" | jq -r '.error // .' 2>/dev/null || echo "$body")"
  fi
  printf '%s' "$body"
}

# Reads one KEY=value from the checkout's .env without echoing it.
read_env_value() {
  local key="$1" file="$REPO/.env" line value
  [[ -f "$file" ]] || return 1
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?$key=" "$file" | tail -1)" || return 1
  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  [[ -n "$value" ]] || return 1
  printf '%s' "$value"
}

seed() {
  local token
  log "Creating the admin ($ADMIN_USER)"
  token="$(jq -n --arg u "$ADMIN_USER" --arg p "$ADMIN_PASSWORD" \
      '{username: $u, password: $p, displayName: "Tester", deviceName: "local-server.sh"}' \
    | ALLOW_STATUS="409" api POST /auth/setup | jq -r '.token // empty')"
  if [[ -z "$token" ]]; then
    log "Setup was already done; signing in instead"
    token="$(jq -n --arg u "$ADMIN_USER" --arg p "$ADMIN_PASSWORD" '{username: $u, password: $p, deviceName: "local-server.sh"}' \
      | api POST /auth/login | jq -r '.token')"
  fi

  local tmdb
  if tmdb="$(read_env_value TMDB_ACCESS_TOKEN)" || tmdb="$(read_env_value TMDB_API_KEY)"; then
    log "Configuring TMDb through the API (credential read from $REPO/.env)"
    # Passed through the environment into jq and on to curl's stdin, so the
    # credential never appears in argv or on screen.
    TMDB_CREDENTIAL="$tmdb" jq -n '{accessToken: env.TMDB_CREDENTIAL}' | api PUT /settings/integrations/tmdb "$token" >/dev/null
    unset tmdb
  else
    log "warning: no TMDB_ACCESS_TOKEN or TMDB_API_KEY in $REPO/.env; TMDb-backed endpoints will answer 502"
  fi

  log "Creating the member ($MEMBER_USER)"
  jq -n --arg u "$MEMBER_USER" --arg p "$MEMBER_PASSWORD" '{username: $u, password: $p, displayName: "Member"}' \
    | ALLOW_STATUS="409" api POST /users "$token" >/dev/null

  printf '{}' | api POST /auth/logout "$token" >/dev/null
}

# MARK: Commands

cmd_up() {
  command -v docker >/dev/null || die "docker is required"
  command -v jq >/dev/null || die "jq is required"
  mkdir -p "$WORK"
  stop_server
  if lsof -ti "tcp:$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    die "port $APP_PORT is already in use by another process"
  fi
  export_source
  start_database
  run_migrations
  start_server
  seed
  cat <<EOF

Marquee $(server_info | jq -r .version) is running at $BASE_URL
  admin:  $ADMIN_USER / $ADMIN_PASSWORD
  member: $MEMBER_USER / $MEMBER_PASSWORD
  log:    $LOG_FILE

Run the live contract tests with:
  TEST_RUNNER_MARQUEE_LIVE_URL=$BASE_URL \\
  TEST_RUNNER_MARQUEE_LIVE_USER=$ADMIN_USER TEST_RUNNER_MARQUEE_LIVE_PASSWORD=$ADMIN_PASSWORD \\
  TEST_RUNNER_MARQUEE_LIVE_MEMBER_USER=$MEMBER_USER TEST_RUNNER_MARQUEE_LIVE_MEMBER_PASSWORD=$MEMBER_PASSWORD \\
  xcodebuild -project Marquee.xcodeproj -scheme Marquee -destination 'platform=macOS' \\
    -derivedDataPath build/DerivedData test -only-testing:MarqueeTests/LiveContractTests
EOF
}

cmd_down() {
  stop_server
  if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
    log "Removing $CONTAINER"
    docker rm -f "$CONTAINER" >/dev/null
  fi
  log "Stopped. (The build cache stays in $WORK; delete it to force a fresh export.)"
}

cmd_status() {
  local pid info
  if pid="$(server_pid)"; then echo "server:    running (pid $pid)"; else echo "server:    stopped"; fi
  if info="$(server_info)"; then echo "api:       $(printf '%s' "$info" | jq -c .)"; else echo "api:       not answering at $BASE_URL"; fi
  local state
  state="$(docker container inspect -f '{{.State.Status}}' "$CONTAINER" 2>/dev/null | tr -d '\n' || true)"
  echo "database:  ${state:-no container}"
  [[ -f "$WORK/built-commit" ]] && echo "build:     $(cut -c1-7 "$WORK/built-commit")"
  return 0
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  *) echo "usage: $0 up|down|status" >&2; exit 2 ;;
esac
