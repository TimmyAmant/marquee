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
};

export default nextConfig;
