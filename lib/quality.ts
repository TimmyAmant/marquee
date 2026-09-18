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
 * through as-is. "SDR" gets no label at all: Plex and Jellyfin say it
 * explicitly (Radarr just leaves the field empty), and a badge on every
 * non-HDR title in the library is noise — the File details card still shows
 * the word, since there it's a filled-in field rather than a highlight. */
export function hdrLabel(dynamicRange: string | null | undefined): string | null {
  if (!dynamicRange) return null;
  if (/^sdr$/i.test(dynamicRange)) return null;
  if (/^dv$/i.test(dynamicRange)) return "Dolby Vision";
  if (/^hdr10plus$/i.test(dynamicRange)) return "HDR10+";
  return dynamicRange;
}

/** The tier to show for a file, from whichever source knows it: an *arr
 * quality profile name first (authoritative about the release it grabbed),
 * then the resolution a media server reported — already normalised to
 * "4K"/"1080p"/"720p" by lib/media-info.ts, but a raw "3840x2160" (Radarr's
 * mediaInfo.resolution spelling) is matched too. */
export function resolutionTierOf(
  qualityName: string | null | undefined,
  resolution: string | null | undefined,
): "4K" | "1080p" | "720p" | null {
  const fromQuality = resolutionTier(qualityName);
  if (fromQuality) return fromQuality;
  if (!resolution) return null;

  const fromLabel = resolutionTier(resolution);
  if (fromLabel) return fromLabel;

  const dimensions = resolution.match(/^\s*(\d+)\s*x\s*(\d+)\s*$/i);
  if (!dimensions) return null;
  const width = Number(dimensions[1]);
  const height = Number(dimensions[2]);
  if (width >= 3000 || height >= 1700) return "4K";
  if (width >= 1800 || height >= 1000) return "1080p";
  if (width >= 1200 || height >= 700) return "720p";
  return null;
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
