/** Radarr's quality profile names bake resolution straight into the string
 * (e.g. "Bluray-1080p", "WEBDL-2160p", "HDTV-720p") — no separate
 * resolution field needed, just pattern-match the name. True HDR/Dolby
 * Vision detection would need Radarr's customFormats data (a separate API
 * field this app doesn't fetch yet), so this is resolution-only for now. */
export function resolutionTier(qualityName: string | null | undefined): "4K" | "1080p" | "720p" | null {
  if (!qualityName) return null;
  if (/2160p|4K/i.test(qualityName)) return "4K";
  if (/1080p/i.test(qualityName)) return "1080p";
  if (/720p/i.test(qualityName)) return "720p";
  return null;
}
