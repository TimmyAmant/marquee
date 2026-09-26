import type { MetadataRoute } from "next";

/** What "Add to Home Screen" (and a desktop browser's Install) uses. On an
 * iPhone or iPad this is also what makes notifications possible at all:
 * Safari only offers Web Push to a site opened from the Home Screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Marquee",
    short_name: "Marquee",
    description: "Your self-hosted media dashboard",
    start_url: "/discover",
    scope: "/",
    display: "standalone",
    background_color: "#0a0a0c",
    theme_color: "#0a0a0c",
    // 192 and 512 are what Android's "Install app" needs; the maskable one
    // fills its adaptive-icon shapes without a black border.
    icons: [
      { src: "/marquee-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the home-screen icon.
    shortcuts: [
      { name: "Requests", url: "/requests" },
      { name: "Search", url: "/search" },
    ],
  };
}
