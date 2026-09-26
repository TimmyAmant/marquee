import { englishT } from "@/lib/i18n/catalog";
import type { MessageKey, Translator } from "@/lib/i18n/translator";

export type ErrorReferenceEntry = {
  message: string;
  meaning: string;
  whatToDo: string;
};

export type ErrorReferenceCategory = {
  title: string;
  entries: ErrorReferenceEntry[];
};

/** One entry's three messages, in lib/i18n/messages/<language>/help.json as
 * `<id>Message`, `<id>Meaning` and `<id>WhatToDo`. */
type EntryId =
  | "errSonarrNotConnected"
  | "errRadarrNotConnected"
  | "errSonarrNoTvdb"
  | "errRadarrAddFailed"
  | "errSonarrAddFailed"
  | "errNotInLibrary"
  | "errMonitoringFailed"
  | "errAdminOnlyAdd"
  | "errAlreadyRequested"
  | "errAlreadyOwned"
  | "errRequestNotFound"
  | "errRequestAlreadyReviewed"
  | "errUrlKeyRequired"
  | "errConnectFailed"
  | "errTmdbTokenInvalid"
  | "errTmdbTokenMissing"
  | "errSyncFailed"
  | "errPlexStartFailed"
  | "errBadCredentials"
  | "errTooManyAttempts"
  | "errUsernameTaken"
  | "errEditOwnOnly"
  | "errPlexNoAccess"
  | "errPlexNoAccount"
  | "errJellyfinBadCredentials"
  | "errPlexExpired"
  | "errPlexLinkedElsewhere"
  | "errSsoNotAllowed"
  | "errSsoNoAccount"
  | "errSsoExpired"
  | "errQuickConnectOff"
  | "errQuickConnectExpired"
  | "errSignInRequired"
  | "errNoFilterMatches";

/** Plain-language explanations for every user-facing error string in the
 * app, grouped by the area of the app that surfaces them. Kept as static
 * content (not derived from the code) so wording can be written for a
 * household member reading it, not a developer — but every `message` here
 * should match a string returned by a server action (in each language), so
 * update this alongside any error copy change. */
const CATEGORIES: { title: MessageKey; entries: EntryId[] }[] = [
  {
    title: "help.catAddingTitles",
    entries: [
      "errSonarrNotConnected",
      "errRadarrNotConnected",
      "errSonarrNoTvdb",
      "errRadarrAddFailed",
      "errSonarrAddFailed",
      "errNotInLibrary",
      "errMonitoringFailed",
      "errAdminOnlyAdd",
    ],
  },
  {
    title: "help.catRequests",
    entries: ["errAlreadyRequested", "errAlreadyOwned", "errRequestNotFound", "errRequestAlreadyReviewed"],
  },
  {
    title: "help.catIntegrations",
    entries: [
      "errUrlKeyRequired",
      "errConnectFailed",
      "errTmdbTokenInvalid",
      "errTmdbTokenMissing",
      "errSyncFailed",
      "errPlexStartFailed",
    ],
  },
  {
    title: "help.catSignIn",
    entries: [
      "errBadCredentials",
      "errTooManyAttempts",
      "errUsernameTaken",
      "errEditOwnOnly",
      "errPlexNoAccess",
      "errPlexNoAccount",
      "errJellyfinBadCredentials",
      "errPlexExpired",
      "errPlexLinkedElsewhere",
      "errSsoNotAllowed",
      "errSsoNoAccount",
      "errSsoExpired",
      "errQuickConnectOff",
      "errQuickConnectExpired",
    ],
  },
  {
    title: "help.catGeneral",
    entries: ["errSignInRequired", "errNoFilterMatches"],
  },
];

/** The error reference in the reader's language (Help › Errors, and the
 * API's /help/errors). */
export function errorReference(t: Translator): ErrorReferenceCategory[] {
  return CATEGORIES.map((category) => ({
    title: t(category.title),
    entries: category.entries.map((id) => ({
      message: t(`help.${id}Message`),
      meaning: t(`help.${id}Meaning`),
      whatToDo: t(`help.${id}WhatToDo`),
    })),
  }));
}

/** The same in English, for callers with no reader to ask. */
export const ERROR_REFERENCE: ErrorReferenceCategory[] = errorReference(englishT());
