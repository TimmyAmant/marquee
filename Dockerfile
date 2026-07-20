# Debian-based (not alpine) — argon2 and sharp ship native bindings that are
# more reliably prebuilt for glibc than musl, and image size isn't a priority
# for a self-hosted single-instance app.
#
# Postgres runs inside this same image/container (not a separate one) so a
# self-hoster only has one thing to install and manage — appropriate for a
# single-user appliance-style app, even though it trades away the usual
# one-process-per-container Docker convention.
FROM node:22-bookworm-slim AS base

# Pinned to a specific major version (rather than the bare "postgresql"
# package, whose version tracks whatever Debian bookworm currently
# defaults to) so a future rebuild never silently ends up with a server
# version that can't read data directories from earlier installs — bump
# this deliberately, alongside a documented migration path, not by accident.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-15 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies separately so this layer is cached across rebuilds
# that only change application code.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# `next build` imports every route module (including lib/db/client.ts, which
# requires DATABASE_URL to be set) to collect page data, but never actually
# queries the database during that step — postgres-js connects lazily on
# first query. This placeholder only needs to exist, never to be reachable;
# the real DATABASE_URL is built at container startup by entrypoint.sh.
ENV DATABASE_URL="postgres://build:build@build-time-placeholder:5432/build"
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["npm", "run", "start"]
