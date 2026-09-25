# Remote access

Marquee runs on your LAN and speaks plain HTTP. To use it from a phone on
mobile data, or from anywhere that isn't home, pick one of these.

## Option A — Cloudflare Tunnel and a domain (recommended)

A tunnel dials out from your server to Cloudflare, so nothing is exposed
inbound: no ports open on your router, and your home IP stays private. It's
free, and it gives you HTTPS on your own domain.

1. Point a domain (or subdomain) at Cloudflare — the free plan is enough.
2. In the [Zero Trust dashboard](https://one.dash.cloudflare.com) go to
   **Networks → Tunnels → Create a tunnel**, choose **Cloudflared**, and name
   it.
3. Install the connector on the machine running Marquee. On Unraid, install
   **cloudflared** from Community Applications and paste the tunnel token;
   elsewhere run the `docker run … cloudflared tunnel run --token …` command
   the dashboard gives you.
4. Add a **public hostname**: `marquee.example.com` → **HTTP** →
   `<your-server-ip>:3000` (the port you set as `APP_PORT`). If the connector
   runs in Docker on the same host, use the host's LAN IP rather than
   `localhost`.
5. Visit `https://marquee.example.com`. Certificates are handled for you.

Keep an eye on Cloudflare's upload limits if you use the tunnel for anything
else; Marquee itself only serves pages and JSON, so it stays well inside them.

## Option B — Port forwarding

Forward a port on your router to `<your-server-ip>:3000`. It works, and it's
the least safe of the three: your home IP is public, there's no HTTPS unless
you add a reverse proxy with a certificate, and the login page is exposed to
the whole internet. Marquee rate-limits sign-ins and hashes passwords with
argon2, but a tunnel is still the better answer. If you do this anyway, put a
reverse proxy with TLS in front and never forward the database port.

## Option C — Authelia (or Cloudflare Access) in front

Either option above puts Marquee's own login page on the internet. To require
a second, stronger login — with 2FA — before anyone even reaches it, put an
identity provider in front.

**Cloudflare Access** is the simplest if you're already tunnelling: in Zero
Trust, add an **Application** for `marquee.example.com` and a policy (allow
your own email addresses, one-time PIN or a social login). No extra container.

**[Authelia](https://www.authelia.com)** keeps it self-hosted, and needs a
reverse proxy that supports forward auth — Traefik, Caddy, or Nginx Proxy
Manager — because a tunnel alone can't ask another service whether a request
is allowed:

1. Run Authelia and your reverse proxy on the same host as Marquee, with a
   users file or LDAP backend and 2FA turned on.
2. Give the proxy a route for `marquee.example.com` that forward-auths to
   Authelia and proxies to `<your-server-ip>:3000`.
3. Point the tunnel's public hostname at the **proxy**, not at Marquee.

**Important, for the Mac app and for Sonarr/Radarr webhooks.** A login portal
in front of the whole domain will block anything that isn't a browser:

- **The Mac and Windows apps** sign in with a bearer token on
  `/api/v1`. Exempt that path in your policy (an Authelia `bypass` rule for
  `/api/v1*`, or a Cloudflare Access **service token**), or point the apps at
  the LAN address when you're home. Marquee authenticates those requests
  itself — the API is never open.
- **Webhooks** from Sonarr and Radarr are sent on your LAN to
  `/api/webhooks/…` with a per-account secret, so they're unaffected — unless
  you deliberately route them through the domain, in which case exempt that
  path too.

## Behind a proxy: `TRUSTED_PROXY_HOPS`

Marquee rate-limits failed sign-ins per client address. It can only tell
clients apart when a proxy it trusts says who they are, in the
`X-Forwarded-For` header — without one, that header is whatever the client
chose to send. So by default (`TRUSTED_PROXY_HOPS=0`) Marquee ignores it:
sign-ins are slowed down per username instead (a few seconds between
attempts once one has had several failures — never a lockout), and nobody
can dodge the limit by making up an address.

If every request reaches Marquee through proxies you control, set
`TRUSTED_PROXY_HOPS` to how many of them there are, counting each one that
adds to `X-Forwarded-For`:

| Setup | Value |
|---|---|
| LAN only, or port forwarding straight to Marquee | `0` (the default) |
| Cloudflare Tunnel (Option A), or one reverse proxy (Nginx Proxy Manager, Caddy, Traefik, SWAG) | `1` |
| Cloudflare Tunnel into a reverse proxy (Option C with Authelia) | `2` |

Then too many failed sign-ins from one address lock out only that address,
for 15 minutes. Too high a value is worse than too low: it makes Marquee
trust an address the client wrote itself.
