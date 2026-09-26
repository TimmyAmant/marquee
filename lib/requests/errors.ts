/** The message key of "Couldn't resolve this show for Sonarr." — the one
 * approval failure the Requests page offers "add it manually" for. The
 * approve action (lib/requests/actions.ts) flags it with
 * `code: "sonarr_unresolved"` rather than the page matching on text, which
 * is in the reviewer's language. */
export const SONARR_UNRESOLVED = "notify.sonarrUnresolved" as const;
