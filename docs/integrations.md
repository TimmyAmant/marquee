# Connecting other tools to Marquee

Dashboards, phone apps and scripts talk to Marquee through the same JSON API
the Mac and Windows apps use (`/api/v1`), with an **API key** instead of a
sign-in. Available from server version 0.47.

- Full reference: [`docs/api-v1.md`](api-v1.md) (§16 covers API keys).
- Machine-readable: `https://<your-marquee>/api/v1/openapi.json` (OpenAPI 3.1),
  shown as a table at `https://<your-marquee>/api-docs`.

## 1. Create a key

As the admin: **Settings › General › API access › API keys**.

| Choice | Pick |
|---|---|
| Name | What will use it — "Homepage", "Script on the NAS" |
| Access | **Read-only** for dashboards and anything that only looks. **Full access** only for tools that make or approve requests |
| Act as | Leave on **You (the admin)** for dashboards. Pick a household member for an app that should only request titles as them — the key then can do exactly what they can |
| Expires | Never, 30 days, 90 days or 1 year |

The key (`mq_…`) is shown **once** — copy it straight into the tool's
config. Lost it? Revoke it and make another. Revoking works immediately.

Whatever the access, no key can manage API keys, sign in or out, link
accounts, change household accounts, or read or change the Sonarr/Radarr,
Plex/Jellyfin, sign-in and notification integrations.

Send the key in a header — never put it in a URL:

```sh
curl -H "X-Api-Key: mq_…" https://marquee.example.com/api/v1/stats/summary
# or
curl -H "Authorization: Bearer mq_…" https://marquee.example.com/api/v1/stats/summary
```

```json
{ "pendingRequests": 3, "openIssues": 1, "cantFind": 2, "movies": 812, "series": 164, "downloading": 4 }
```

`pendingRequests`, `openIssues` and `cantFind` count for keys acting as the
admin (or a trusted member); for a regular member they're 0.

## 2. Homepage (gethomepage.dev)

Homepage's [Custom API widget](https://gethomepage.dev/widgets/services/customapi/)
reads `GET /api/v1/stats/summary`. Use a **read-only** key.

Put the key in Homepage's environment (for example in its
`docker-compose.yml`) rather than in the YAML itself:

```yaml
    environment:
      HOMEPAGE_VAR_MARQUEE_KEY: mq_your_key_here
```

Then in `services.yaml`:

```yaml
- Media:
    - Marquee:
        icon: mdi-movie-open-star
        href: https://marquee.example.com
        description: Requests & library
        widget:
          type: customapi
          url: http://marquee:3000/api/v1/stats/summary
          refreshInterval: 60000
          headers:
            X-Api-Key: "{{HOMEPAGE_VAR_MARQUEE_KEY}}"
          mappings:
            - field: pendingRequests
              label: Pending
              format: number
            - field: cantFind
              label: Can't find
              format: number
            - field: downloading
              label: Downloading
              format: number
            - field: movies
              label: Movies
              format: number
```

Swap any mapping for `openIssues` ("Issues") or `series` ("Series").
`url` is how *Homepage's container* reaches Marquee — on the same Docker
network that's usually `http://<marquee-container-name>:3000`.

## 3. Homarr

Homarr has no general-purpose JSON widget, so Marquee shows up there as an
app tile (with a status check) and, if you like, embedded in an iFrame
widget — Marquee allows itself to be framed.

1. **Add an app**: name *Marquee*, URL `https://marquee.example.com`, and turn
   on the status check with ping URL `http://marquee:3000/api/v1/server-info`
   (public, no key needed — it answers `200` with `"status": "ok"` when the
   database is reachable).
2. **Optional iFrame widget**: embed `https://marquee.example.com/requests`
   (you'll be asked to sign in inside the frame once).

For the request counts on a Homarr board, use the Homepage widget above or a
script that reads `/api/v1/stats/summary`.

## 4. Scripts and other apps

Everything in [`api-v1.md`](api-v1.md) works with a key, within its access.
A few useful calls:

```sh
KEY=mq_your_key_here
BASE=https://marquee.example.com/api/v1

# What's waiting for review (read-only key acting as the admin)
curl -s -H "X-Api-Key: $KEY" "$BASE/requests/pending" | jq '.results[] | .title'

# Request a movie (full-access key; acting as a member, it's their request)
curl -s -X POST -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{}' "$BASE/titles/movie/603/request"

# Approve a request (full-access key acting as the admin)
curl -s -X POST -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
  -d '{}' "$BASE/requests/<request-id>/approve"
```

What you'll get back when something's off: `401` — the key is wrong,
expired or revoked; `403` — the key isn't allowed to do that (read-only, or
something no key may do); `429` — too many wrong keys from your address,
wait a few minutes. Errors are always `{"error": "…", "code": "…"}`.

Behind a reverse proxy, set `TRUSTED_PROXY_HOPS` (see [Remote
access](remote-access.md#behind-a-proxy-trusted_proxy_hops)) so the
wrong-key limit counts each client separately; without it, every caller
shares one budget.
