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
    icons: [{ src: "/marquee-icon.png", sizes: "180x180", type: "image/png", purpose: "any" }],
  };
}
