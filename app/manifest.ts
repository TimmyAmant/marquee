import type { MetadataRoute } from "next";
import { getT } from "@/lib/i18n/server";

/** What "Add to Home Screen" (and a desktop browser's Install) uses. On an
 * iPhone or iPad this is also what makes notifications possible at all:
 * Safari only offers Web Push to a site opened from the Home Screen. In the
 * language of whoever installs it (reading the request makes it dynamic
 * rather than cached at build time). */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const t = await getT();
  return {
    name: "Marquee",
    short_name: "Marquee",
    description: t("nav.manifestDescription"),
    lang: t.locale,
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
      { name: t("nav.requests"), url: "/requests" },
      { name: t("common.search"), url: "/search" },
    ],
  };
}
