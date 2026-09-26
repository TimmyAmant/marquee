import { issueKindValues, type IssueKind, type MediaType } from "@/lib/db/schema";

// The pure parts of problem reports (lib/issues): labels and checking a
// report's fields. Kept apart from the database code so the API mappers and
// tests can use them.

export const ISSUE_KIND_LABELS: Record<IssueKind, string> = {
  video: "Bad video quality",
  audio: "Audio problem",
  subtitles: "Subtitles missing or wrong",
  wont_play: "Won't play",
  wrong_title: "Wrong movie or episode",
  other: "Something else",
};

export const MAX_ISSUE_MESSAGE = 1000;
export const MAX_ISSUE_RESOLUTION = 500;
/** Open reports per person at once — plenty, and stops a flood. */
export const MAX_OPEN_ISSUES_PER_USER = 20;

export type ReportInput = { kind: unknown; message?: unknown; seasonNumber?: unknown; episodeNumber?: unknown };

function wholeNumber(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 0 && n <= 10_000 ? n : "invalid";
}

/** Checks a report's fields. Pure; unit tested. */
export function parseReport(
  mediaType: MediaType,
  input: ReportInput,
):
  | { ok: true; kind: IssueKind; message: string | null; seasonNumber: number | null; episodeNumber: number | null }
  | { ok: false; error: string } {
  if (typeof input.kind !== "string" || !(issueKindValues as readonly string[]).includes(input.kind)) {
    return { ok: false, error: "Pick what's wrong." };
  }
  const kind = input.kind as IssueKind;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length > MAX_ISSUE_MESSAGE) return { ok: false, error: `Keep it under ${MAX_ISSUE_MESSAGE} characters.` };
  if (kind === "other" && !message) return { ok: false, error: "Say what's wrong." };
  let seasonNumber = wholeNumber(input.seasonNumber);
  let episodeNumber = wholeNumber(input.episodeNumber);
  if (seasonNumber === "invalid" || episodeNumber === "invalid") {
    return { ok: false, error: "Season and episode are whole numbers." };
  }
  if (mediaType === "movie") {
    seasonNumber = null;
    episodeNumber = null;
  } else if (episodeNumber !== null && seasonNumber === null) {
    return { ok: false, error: "Pick the season too." };
  }
  return { ok: true, kind, message: message || null, seasonNumber, episodeNumber };
}

/** "S2 E5", "Season 2", or null. Pure. */
export function issueEpisodeLabel(seasonNumber: number | null, episodeNumber: number | null): string | null {
  if (seasonNumber === null) return null;
  if (episodeNumber === null) return seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
  return `S${seasonNumber} E${episodeNumber}`;
}

