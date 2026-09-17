# Marquee API v1 — core contract

The Mac app is a client of a self-hosted Marquee server (the Next.js app at
the repo root). This file fixes the parts of the contract both
sides need up front: conventions, discovery and authentication. The full
endpoint reference (every page's data and every action) lives in the server
repo at [`docs/api-v1.md`](../../docs/api-v1.md).

## Conventions

- Base path: `{server}/api/v1`. A server is `http://<host>:<port>` (default port 3000, the Docker `APP_PORT`).
- JSON request and response bodies, `Content-Type: application/json`, camelCase keys.
- Timestamps are ISO-8601 UTC strings with milliseconds (`"2026-09-17T12:00:00.000Z"`). Calendar dates without a time are `"YYYY-MM-DD"` strings.
- Nullable fields are always present and `null`, never omitted.
- Every v1 response carries the header `X-Marquee-API: 1`.
- Errors are non-2xx responses with body `{"error": "<human-readable message>", "code": "<machine code>"}`:
  - `400 invalid` for validation failures; the message is safe to show in the UI
  - `401 unauthorized` for a missing, invalid, expired or revoked token (the client returns to sign-in)
  - `401 invalid_credentials` for a failed login
  - `403 forbidden` when a member calls an admin-only endpoint
  - `404 not_found`
  - `409 conflict`, or `409 setup_complete` for setup once accounts already exist
  - `429 rate_limited`
  - `502 upstream` when a connected service (TMDb, Plex, Sonarr, …) failed; the message says which one
  - `500 internal`
- Paginated lists are `{"page": 1, "totalPages": 12, "totalResults": 231, "results": [...]}`.
- Images: the API returns TMDb paths (`posterPath: "/abc.jpg"`), and the client builds `https://image.tmdb.org/t/p/<size><path>` itself.

## Discovery (public, no auth)

`GET /api/v1/server-info`

```json
{ "app": "marquee", "apiVersion": 1, "version": "0.22.0", "setupComplete": true, "status": "ok" }
```

- This endpoint must be cheap: no integrations are called, only a single `hasAnyUser()` query.
- If the database is unreachable, it still returns 200 with `"setupComplete": null, "status": "degraded"`, so the server can be identified.
- The proxy must not redirect `/api/v1/*` to `/login`. v1 routes authenticate themselves and answer 401 JSON.

**Legacy detection (client side).** A Marquee server older than 0.22.0 has no v1 API. There, `/api/v1/server-info` redirects to `/login`, which serves HTML containing `<title>Marquee</title>`. The client reports that as "Marquee found, but it needs updating".

## Authentication

Clients hold a bearer token: `Authorization: Bearer mqt_<43 base64url chars>`.

### Token storage (server)

- Table `api_tokens`: `id uuid pk`, `user_id uuid fk → users (cascade)`, `name text` (the device name), `token_hash text unique` (SHA-256 hex; the raw token is never stored), `created_at`, `last_used_at`, `expires_at`.
- Tokens expire 90 days after last use. `expires_at` slides forward on use, at most once per hour, to limit writes.
- Logout revokes the token. Deleting a user cascades to their tokens. Changing or resetting a password revokes all of that user's tokens.
- The role is read fresh from `users` on every request. It is never trusted from the token row.

### `POST /api/v1/auth/login`

Request:

```json
{ "username": "timmy", "password": "…", "deviceName": "Timmy's MacBook Pro" }
```

Response 200:

```json
{
  "token": "mqt_…",
  "expiresAt": "2026-12-16T12:00:00.000Z",
  "user": { "id": "uuid", "username": "timmy", "displayName": "Timmy", "role": "admin", "libraryOwnerId": "uuid" }
}
```

- Failures: `401 invalid_credentials`, `429 rate_limited` (same limits as the web login, sharing its buckets: 5 per username and 20 per IP per 15 minutes), `400 invalid`.

### `POST /api/v1/auth/setup`

- Request: `{ "username", "password", "displayName", "deviceName" }`.
- Response: the same shape as login. It creates the first (admin) account exactly like the web `/setup` action, using the same validation.
- Returns `409 setup_complete` if any account already exists.

### Authenticated account routes

- `POST /api/v1/auth/logout` → `{"ok": true}` and revokes the calling token.
- `GET /api/v1/me` → `User` (the shape above, plus any extra per-user fields the web session exposes, as the full reference documents).

## User

```ts
type User = {
  id: string;             // uuid
  username: string;
  displayName: string | null;
  role: "admin" | "member";
  libraryOwnerId: string; // whose integrations and library this user sees
};
```
