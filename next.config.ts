import type { NextConfig } from "next";
import { LEGACY_SETTINGS_REDIRECTS } from "./lib/settings/tabs";

const nextConfig: NextConfig = {
  images: {
    // 75 is next/image's default; 85 is the title page's full-bleed backdrop
    // (components/title-hero.tsx), where 75 bands the long fades and shows
    // blocks in dark skies at 2560px.
    qualities: [75, 85],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
      // TheTVDB's own artwork CDN — used as a poster/backdrop fallback when
      // TMDb doesn't have one yet, for titles that have a TVDB API key
      // connected.
      {
        protocol: "https",
        hostname: "artworks.thetvdb.com",
      },
    ],
  },
  // Settings' pages that moved when it was regrouped into tabs
  // (lib/settings/tabs.ts): bookmarks and the apps' links still land.
  async redirects() {
    return LEGACY_SETTINGS_REDIRECTS.map((entry) => ({ ...entry, permanent: false }));
  },
  // Every /api/v1 route handler sets X-Marquee-API itself; this also covers
  // the responses Next.js generates on its own for those paths (405 Method
  // Not Allowed, automatic OPTIONS), so native clients can always tell a v1
  // server's answer apart from something else on the same host.
  async headers() {
    return [
      // Baseline hardening for every response. Framing is deliberately left
      // alone: plenty of self-hosters embed Marquee in Organizr or Homarr,
      // and a frame-ancestors rule would break that.
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // The pages the Mac and Windows apps open for single sign-on: "Continue"
      // there hands an app a session, so it's never shown inside someone
      // else's frame (clickjacking). They're opened in the browser directly,
      // never embedded, so this costs the Organizr/Homarr case nothing.
      {
        source: "/login/sso/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      // The push service worker (public/sw.js): never cached, so a fix to
      // it reaches every browser on its next visit, and scripts only from
      // this site.
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      { source: "/api/v1", headers: [{ key: "X-Marquee-API", value: "1" }] },
      { source: "/api/v1/:path*", headers: [{ key: "X-Marquee-API", value: "1" }] },
    ];
  },
};

export default nextConfig;
