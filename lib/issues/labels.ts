import { issueKindValues, type IssueKind, type MediaType } from "@/lib/db/schema";
import type { MessageKey, Translator } from "@/lib/i18n/translator";

// The pure parts of problem reports (lib/issues): labels and checking a
// report's fields. Kept apart from the database code so the API mappers and
// tests can use them.

const ISSUE_KIND_KEYS: Record<IssueKind, MessageKey> = {
  video: "title.issueKindVideo",
  audio: "title.issueKindAudio",
  subtitles: "title.issueKindSubtitles",
  wont_play: "title.issueKindWontPlay",
  wrong_title: "title.issueKindWrongTitle",
  other: "title.issueKindOther",
};

/** What's wrong, in words ("Bad video quality"). */
export function issueKindLabel(t: Translator, kind: IssueKind): string {
  return t(ISSUE_KIND_KEYS[kind]);
}

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
  t: Translator,
  mediaType: MediaType,
  input: ReportInput,
):
  | { ok: true; kind: IssueKind; message: string | null; seasonNumber: number | null; episodeNumber: number | null }
  | { ok: false; error: string } {
  if (typeof input.kind !== "string" || !(issueKindValues as readonly string[]).includes(input.kind)) {
    return { ok: false, error: t("title.reportPickKind") };
  }
  const kind = input.kind as IssueKind;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (message.length > MAX_ISSUE_MESSAGE) return { ok: false, error: t("title.reportTooLong", { max: MAX_ISSUE_MESSAGE }) };
  if (kind === "other" && !message) return { ok: false, error: t("title.reportSayWhat") };
  let seasonNumber = wholeNumber(input.seasonNumber);
  let episodeNumber = wholeNumber(input.episodeNumber);
  if (seasonNumber === "invalid" || episodeNumber === "invalid") {
    return { ok: false, error: t("title.reportWholeNumbers") };
  }
  if (mediaType === "movie") {
    seasonNumber = null;
    episodeNumber = null;
  } else if (episodeNumber !== null && seasonNumber === null) {
    return { ok: false, error: t("title.reportPickSeason") };
  }
  return { ok: true, kind, message: message || null, seasonNumber, episodeNumber };
}

/** "S2 E5", "Season 2", or null. Pure. */
export function issueEpisodeLabel(
  t: Translator,
  seasonNumber: number | null,
  episodeNumber: number | null,
): string | null {
  if (seasonNumber === null) return null;
  if (episodeNumber === null) return seasonNumber === 0 ? t("title.specials") : t("common.season", { number: seasonNumber });
  return t("title.episodeShort", { season: seasonNumber, episode: episodeNumber });
}

