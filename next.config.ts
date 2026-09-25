import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
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
