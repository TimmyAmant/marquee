// The site-wide Content-Security-Policy, set per page by proxy.ts with a
// fresh nonce each time. Next.js reads the nonce back out of the request's
// copy of the header and puts it on its own scripts (the framework, the
// page's chunks, the inline hydration data); the root layout puts it on the
// theme-init script. 'strict-dynamic' then lets those scripts load the rest
// of the app's chunks, and nothing else runs: no injected inline script, no
// script from another site.
//
// Deliberately left out:
//  - frame-ancestors: plenty of self-hosters embed Marquee in Organizr or
//    Homarr. (The SSO pages forbid framing on their own, next.config.ts.)
//  - form-action: browsers apply it to a form's redirects too, and signing
//    in with Plex or single sign-on posts to Marquee and is redirected on to
//    the provider.
//  - upgrade-insecure-requests: most installs are reached over plain http on
//    the LAN.

/** A fresh, unguessable nonce for one response. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function contentSecurityPolicy(nonce: string, dev = process.env.NODE_ENV === "development"): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'self' is ignored alongside 'strict-dynamic' by browsers that know
    // it; it's there for the few that don't. React's dev build needs eval.
    "script-src": ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Inline style attributes are everywhere (React's style prop renders
    // them), and a nonce can't cover an attribute.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Artwork goes through next/image (/_next/image, so 'self'); a few small
    // logos load straight from TMDb.
    "img-src": ["'self'", "data:", "blob:", "https://image.tmdb.org"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'"],
    // Trailers (components/trailer-button.tsx).
    "frame-src": ["https://www.youtube.com", "https://www.youtube-nocookie.com"],
    // The push service worker (public/sw.js): 'strict-dynamic' would
    // otherwise rule it out.
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
