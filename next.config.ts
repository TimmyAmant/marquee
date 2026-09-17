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
      { source: "/api/v1", headers: [{ key: "X-Marquee-API", value: "1" }] },
      { source: "/api/v1/:path*", headers: [{ key: "X-Marquee-API", value: "1" }] },
    ];
  },
};

export default nextConfig;
