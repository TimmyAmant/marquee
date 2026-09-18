/**
 * Normalisation for the per-file media detail Plex and Jellyfin report
 * alongside a library item (resolution, codecs, dynamic range, container,
 * bitrate). The two providers spell everything differently — Plex says
 * `videoResolution: "4k"` and `videoCodec: "hevc"`, Jellyfin reports
 * `Width/Height` and `VideoRangeType: "DOVI"` — so both are funnelled
 * through here into one shape, spelled the way Radarr's `mediaInfo` already
 * spells it. That's what keeps `lib/quality.ts`'s badge helpers
 * (`resolutionTier`, `hdrLabel`, `audioLabel`) working on media-server-owned
 * titles without special cases.
 *
 * Every field is optional on both sides — an item can be missing streams
 * entirely — so every function here takes anything and returns null rather
 * than guessing.
 */

export type MediaDetail = {
  /** "4K" | "1080p" | "720p" | "576p" | "480p" | "SD", or a raw "1920x816"
   * when the dimensions don't land on a tier. */
  resolution: string | null;
  /** "HEVC" | "H.264" | "AV1" | "VC-1" | "MPEG-2" | … */
  videoCodec: string | null;
  /** "DV" | "HDR10" | "HDR10Plus" | "HLG" | "SDR" — spelled the way Radarr's
   * videoDynamicRangeType is, so `hdrLabel` renders it the same way. */
  dynamicRange: string | null;
  /** "TrueHD Atmos" | "EAC3 Atmos" | "DTS-HD MA" | "AAC" | … */
  audioCodec: string | null;
  audioChannels: number | null;
  /** "MKV" | "MP4" | … */
  container: string | null;
  /** Overall (whole-file) bitrate in kbps — Plex reports kbps natively,
   * Jellyfin bps. */
  bitrateKbps: number | null;
};

export const EMPTY_MEDIA_DETAIL: MediaDetail = {
  resolution: null,
  videoCodec: null,
  dynamicRange: null,
  audioCodec: null,
  audioChannels: null,
  container: null,
  bitrateKbps: null,
};

function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function positiveInt(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

/** Plex labels a 3840×2160 file "4k" and a 1920×1080 one "1080"; Jellyfin
 * reports no label at all, only the video stream's pixel dimensions. Both
 * end up as the tier strings `resolutionTier` already matches, falling back
 * to a raw "WxH" for anything off-tier (a 720×306 upscale, say) so the value
 * is still shown rather than dropped. */
export function normalizeResolution(
  raw?: string | null,
  width?: number | null,
  height?: number | null,
): string | null {
  const label = clean(raw)?.toLowerCase();
  if (label) {
    if (/^(4k|uhd|2160p?)$/.test(label)) return "4K";
    if (/^8k|^4320p?$/.test(label)) return "8K";
    if (/^1080p?$/.test(label)) return "1080p";
    if (/^720p?$/.test(label)) return "720p";
    if (/^576p?$/.test(label)) return "576p";
    if (/^480p?$/.test(label)) return "480p";
    if (label === "sd") return "SD";
    if (/^\d+\s*x\s*\d+$/.test(label)) return label.replace(/\s*x\s*/, "x");
  }
  return resolutionFromDimensions(width, height);
}

function resolutionFromDimensions(width?: number | null, height?: number | null): string | null {
  const w = positiveInt(width);
  const h = positiveInt(height);
  if (!w && !h) return null;
  if ((w ?? 0) >= 7000 || (h ?? 0) >= 3500) return "8K";
  if ((w ?? 0) >= 3000 || (h ?? 0) >= 1700) return "4K";
  if ((w ?? 0) >= 1800 || (h ?? 0) >= 1000) return "1080p";
  if ((w ?? 0) >= 1200 || (h ?? 0) >= 700) return "720p";
  if (w && h) return `${w}x${h}`;
  return null;
}

const VIDEO_CODECS: Record<string, string> = {
  hevc: "HEVC",
  h265: "HEVC",
  "h.265": "HEVC",
  x265: "HEVC",
  h264: "H.264",
  "h.264": "H.264",
  avc: "H.264",
  x264: "H.264",
  av1: "AV1",
  vc1: "VC-1",
  "vc-1": "VC-1",
  vp9: "VP9",
  mpeg2video: "MPEG-2",
  mpeg2: "MPEG-2",
  mpeg4: "MPEG-4",
  msmpeg4: "MPEG-4",
  msmpeg4v3: "MPEG-4",
  divx: "MPEG-4",
  xvid: "MPEG-4",
};

export function normalizeVideoCodec(raw?: string | null): string | null {
  const value = clean(raw);
  if (!value) return null;
  return VIDEO_CODECS[value.toLowerCase()] ?? value.toUpperCase();
}

const AUDIO_CODECS: Record<string, string> = {
  truehd: "TrueHD",
  mlp: "TrueHD",
  eac3: "EAC3",
  "e-ac-3": "EAC3",
  "ec-3": "EAC3",
  ddp: "EAC3",
  ac3: "AC3",
  "ac-3": "AC3",
  dts: "DTS",
  dca: "DTS",
  aac: "AAC",
  "aac-lc": "AAC",
  flac: "FLAC",
  opus: "Opus",
  vorbis: "Vorbis",
  mp3: "MP3",
  mp2: "MP2",
  pcm: "PCM",
  lpcm: "PCM",
};

/** Dolby Atmos isn't a codec — it rides inside TrueHD or EAC3 — but Radarr
 * reports it as part of the codec string ("TrueHD Atmos"), which is what
 * `audioLabel` looks for, so do the same here. Plex signals it with the
 * audio stream's `profile: "joc"` (Joint Object Coding) or in the stream
 * title; Jellyfin puts it in the stream's Profile/Title/DisplayTitle. */
export function normalizeAudioCodec(
  raw?: string | null,
  opts: { profile?: string | null; atmos?: boolean } = {},
): string | null {
  const value = clean(raw);
  if (!value) return null;
  let base = AUDIO_CODECS[value.toLowerCase().replace(/_.*$/, "")] ?? value.toUpperCase();

  const profile = clean(opts.profile)?.toLowerCase();
  if (base === "DTS" && profile) {
    if (/^ma$/.test(profile) || /dts-?hd\s*ma/.test(profile)) base = "DTS-HD MA";
    else if (/^hra$/.test(profile) || /dts-?hd\s*hra?/.test(profile)) base = "DTS-HD HRA";
    else if (/^es$/.test(profile)) base = "DTS-ES";
    else if (/^x$/.test(profile) || /dts[:\-\s]?x/.test(profile)) base = "DTS-X";
  }

  return opts.atmos ? `${base} Atmos` : base;
}

/** True when any of these provider strings names Dolby Atmos. `"joc"` is
 * how Plex reports an EAC3 Atmos track's profile. */
export function hasAtmos(...values: (string | null | undefined)[]): boolean {
  return values.some((value) => {
    const v = clean(value)?.toLowerCase();
    if (!v) return false;
    return v.includes("atmos") || v === "joc";
  });
}

/** Jellyfin's VideoRangeType is already close to Radarr's spelling; Plex
 * reports no such field and has to be derived from the video stream's Dolby
 * Vision flags and transfer characteristics (see lib/plex/client.ts). */
export function normalizeDynamicRange(raw?: string | null): string | null {
  const value = clean(raw);
  if (!value) return null;
  const v = value.toLowerCase();
  // Jellyfin's "DOVIWithHDR10"/"DOVIWithHLG"/"DOVIWithSDR" all describe a
  // Dolby Vision file with a fallback layer — DV is the headline.
  if (/^(dovi|dv|dolby\s*vision)/.test(v)) return "DV";
  if (/hdr10\s*\+|hdr10plus/.test(v)) return "HDR10Plus";
  if (/hdr10/.test(v)) return "HDR10";
  if (/^hlg$/.test(v)) return "HLG";
  if (/^pq$/.test(v)) return "PQ";
  if (/^sdr$/.test(v)) return "SDR";
  if (/^hdr$/.test(v)) return "HDR";
  return value;
}

const CONTAINERS: Record<string, string> = {
  matroska: "MKV",
  mkv: "MKV",
  webm: "WEBM",
  mp4: "MP4",
  m4v: "M4V",
  "mov,mp4,m4a,3gp,3g2,mj2": "MP4",
  mpegts: "TS",
  ts: "TS",
  avi: "AVI",
  mov: "MOV",
  wmv: "WMV",
  asf: "WMV",
  flv: "FLV",
  mpeg: "MPEG",
};

export function normalizeContainer(raw?: string | null): string | null {
  const value = clean(raw)?.replace(/^\./, "");
  if (!value) return null;
  return CONTAINERS[value.toLowerCase()] ?? value.toUpperCase();
}

export function normalizeBitrateKbps(
  value: number | null | undefined,
  unit: "kbps" | "bps",
): number | null {
  const n = positiveInt(value);
  if (n === null) return null;
  const kbps = unit === "bps" ? Math.round(n / 1000) : n;
  return kbps > 0 ? kbps : null;
}

export function normalizeChannels(value: number | null | undefined): number | null {
  return positiveInt(value);
}

/** Fill each null field of `primary` from `fallback` — used where a cheap
 * source (a Plex section listing) covers most fields and a second, richer
 * one (that item's own metadata, which is the only place streams appear)
 * covers the rest. */
export function mergeMediaDetail(primary: MediaDetail, fallback: MediaDetail): MediaDetail {
  return {
    resolution: primary.resolution ?? fallback.resolution,
    videoCodec: primary.videoCodec ?? fallback.videoCodec,
    dynamicRange: primary.dynamicRange ?? fallback.dynamicRange,
    audioCodec: primary.audioCodec ?? fallback.audioCodec,
    audioChannels: primary.audioChannels ?? fallback.audioChannels,
    container: primary.container ?? fallback.container,
    bitrateKbps: primary.bitrateKbps ?? fallback.bitrateKbps,
  };
}

function mostCommon<T extends string | number>(values: (T | null)[]): T | null {
  const counts = new Map<T, number>();
  for (const value of values) {
    if (value === null || value === undefined) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let best: T | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/**
 * One detail for a whole TV series, from its episodes' individual ones. A
 * series has no single file, so "the show is 1080p HEVC" means "most of its
 * episodes are": take the most common value per field (ties go to whichever
 * was seen first), and the mean for bitrate, where a single representative
 * number doesn't exist but an average is still the useful summary.
 */
export function aggregateMediaDetail(details: MediaDetail[]): MediaDetail {
  if (details.length === 0) return { ...EMPTY_MEDIA_DETAIL };

  const bitrates = details.map((d) => d.bitrateKbps).filter((b): b is number => b !== null);
  return {
    resolution: mostCommon(details.map((d) => d.resolution)),
    videoCodec: mostCommon(details.map((d) => d.videoCodec)),
    dynamicRange: mostCommon(details.map((d) => d.dynamicRange)),
    audioCodec: mostCommon(details.map((d) => d.audioCodec)),
    audioChannels: mostCommon(details.map((d) => d.audioChannels)),
    container: mostCommon(details.map((d) => d.container)),
    bitrateKbps:
      bitrates.length > 0
        ? Math.round(bitrates.reduce((sum, b) => sum + b, 0) / bitrates.length)
        : null,
  };
}

/** True when there's nothing worth storing — lets a caller skip an update
 * that would only overwrite good values with nulls. */
export function isEmptyMediaDetail(detail: MediaDetail): boolean {
  return Object.values(detail).every((value) => value === null);
}
