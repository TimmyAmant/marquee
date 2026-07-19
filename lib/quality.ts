/** Radarr's quality profile names bake resolution straight into the string
 * (e.g. "Bluray-1080p", "WEBDL-2160p", "HDTV-720p") — no separate
 * resolution field needed, just pattern-match the name. */
export function resolutionTier(qualityName: string | null | undefined): "4K" | "1080p" | "720p" | null {
  if (!qualityName) return null;
  if (/2160p|4K/i.test(qualityName)) return "4K";
  if (/1080p/i.test(qualityName)) return "1080p";
  if (/720p/i.test(qualityName)) return "720p";
  return null;
}

/** Radarr's mediaInfo.videoDynamicRangeType comes back as things like
 * "HDR10", "HDR10Plus", "DV", "PQ", "HLG", or empty/absent for plain SDR —
 * normalize the two that get their own shorthand elsewhere, pass the rest
 * through as-is. */
export function hdrLabel(dynamicRange: string | null | undefined): string | null {
  if (!dynamicRange) return null;
  if (/^dv$/i.test(dynamicRange)) return "Dolby Vision";
  if (/^hdr10plus$/i.test(dynamicRange)) return "HDR10+";
  return dynamicRange;
}

/** Radarr's mediaInfo.audioCodec is usually a short codec name (DTS,
 * TrueHD, EAC3, AC3, AAC...); Dolby Atmos is layered on top of a codec
 * rather than being one itself, but Radarr includes it in this same
 * string when present (e.g. "TrueHD Atmos") — surface just "Atmos" for
 * that case since that's the part people actually look for. */
export function audioLabel(audioCodec: string | null | undefined): string | null {
  if (!audioCodec) return null;
  if (/atmos/i.test(audioCodec)) return "Atmos";
  return audioCodec;
}
