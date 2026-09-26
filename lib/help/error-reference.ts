export type ErrorReferenceEntry = {
  message: string;
  meaning: string;
  whatToDo: string;
};

export type ErrorReferenceCategory = {
  title: string;
  entries: ErrorReferenceEntry[];
};

/** Plain-language explanations for every user-facing error string in the
 * app, grouped by the area of the app that surfaces them. Kept as static
 * content (not derived from the code) so wording can be written for a
 * household member reading it, not a developer — but every `message` here
 * should match a literal string returned by a server action, so update this
 * alongside any error copy change. */
export const ERROR_REFERENCE: ErrorReferenceCategory[] = [
  {
    title: "Adding titles to Sonarr / Radarr",
    entries: [
      {
        message: "Connect Sonarr in Settings first.",
        meaning: "No Sonarr connection is saved, or it's missing a root folder / quality profile.",
        whatToDo: "Go to Settings → Integrations and finish the Sonarr setup (URL, API key, then pick defaults).",
      },
      {
        message: "Connect Radarr in Settings first.",
        meaning: "Same as above, but for Radarr (movies).",
        whatToDo: "Go to Settings → Integrations and finish the Radarr setup.",
      },
      {
        message: "Couldn't resolve this show for Sonarr.",
        meaning:
          "Sonarr looks shows up by TVDB id, not TMDb id. TMDb's own record for this show has no linked TVDB id, so Marquee has nothing to hand Sonarr.",
        whatToDo:
          "This is a data gap on TMDb, not a connection problem. On the Requests page, an \"Add manually in Sonarr\" link appears next to this error to jump straight to Sonarr's own search. Once you've found and downloaded it yourself, hit \"Manually approve\" (which replaces the Approve button here) so the requester sees it as handled instead of stuck pending.",
      },
      {
        message: "Couldn't add this movie to Radarr.",
        meaning: "Radarr rejected the add request — wrong root folder, invalid quality profile, or Radarr itself returned an error.",
        whatToDo: "Check Radarr's own logs/UI, and confirm the root folder and quality profile saved in Settings still exist in Radarr.",
      },
      {
        message: "Couldn't add this series to Sonarr.",
        meaning: "Sonarr rejected the add request after Marquee successfully resolved the TVDB id.",
        whatToDo: "Check Sonarr's own logs/UI, and confirm the root folder and quality profile saved in Settings still exist in Sonarr.",
      },
      {
        message: "Couldn't find this title in your library.",
        meaning: "You tried to stop monitoring a title that isn't in the local sync cache (it may have already been removed).",
        whatToDo: "Refresh the page. If it persists, hit \"Sync now\" in Settings → Integrations.",
      },
      {
        message: "Couldn't update monitoring status.",
        meaning: "Sonarr/Radarr didn't accept the monitoring change.",
        whatToDo: "Try again; if it keeps failing, check that Sonarr/Radarr is reachable from Marquee.",
      },
      {
        message: "Only the admin can add titles.",
        meaning: "Adding directly to Sonarr/Radarr is an admin-only action — members use Request instead.",
        whatToDo: "Use the Request button, or ask the admin to add it.",
      },
    ],
  },
  {
    title: "Requests",
    entries: [
      {
        message: "You've already requested this.",
        meaning: "You already have an active (pending or approved) request for this exact title.",
        whatToDo: "Check the Requests page for its current status instead of requesting again.",
      },
      {
        message: "You already have this in your library.",
        meaning: "The title became owned or tracked between when you loaded the page and when you hit Request.",
        whatToDo: "Refresh the page — it should now show as already in your library.",
      },
      {
        message: "Request not found or already reviewed.",
        meaning: "Someone (possibly you, in another tab) already approved or rejected this request.",
        whatToDo: "Refresh the Requests page to see its current state.",
      },
      {
        message: "Request was already reviewed.",
        meaning: "A second approve/reject landed after the first one already went through — a race, not a bug.",
        whatToDo: "Refresh the page; no action needed.",
      },
    ],
  },
  {
    title: "Connecting integrations (Settings)",
    entries: [
      {
        message: "URL and API key are required.",
        meaning: "The connect form was submitted with one of the two fields empty.",
        whatToDo: "Fill in both the server URL and API key.",
      },
      {
        message: "Couldn't connect. Check the URL and API key and try again.",
        meaning: "Marquee reached out to the server (Sonarr, Radarr, or Jellyfin) and it didn't respond as expected — wrong URL, wrong/expired API key, or the server is down.",
        whatToDo: "Double-check the URL is reachable from wherever Marquee is running (not just your own browser), and that the API key is current.",
      },
      {
        message: "Couldn't verify this token with TMDb. Check it and try again.",
        meaning: "The TMDb access token you entered was rejected by TMDb's API.",
        whatToDo: "Generate a fresh API Read Access Token from your TMDb account settings and paste the whole thing.",
      },
      {
        message: "Enter an access token.",
        meaning: "The TMDb token field was submitted empty.",
        whatToDo: "Paste your TMDb API Read Access Token.",
      },
      {
        message: "Some integrations failed to sync — check their connection.",
        meaning: "\"Sync now\" ran, and at least one connected integration (Plex, Jellyfin, Sonarr, or Radarr) failed partway through.",
        whatToDo: "The others still synced fine. Check each integration's card in Settings for a stale \"last synced\" time to spot which one is failing.",
      },
      {
        message: "Couldn't start Plex sign-in. Try again.",
        meaning: "Marquee couldn't get a sign-in PIN from Plex's own servers — usually a transient network issue.",
        whatToDo: "Try connecting Plex again in a moment.",
      },
    ],
  },
  {
    title: "Signing in / account",
    entries: [
      {
        message: "Incorrect username or password",
        meaning: "Exactly what it says — the credentials didn't match.",
        whatToDo: "Double-check for typos, or ask the admin to reset your password from Settings.",
      },
      {
        message: "Too many attempts. Try again in a few minutes.",
        meaning: "Repeated failed sign-in attempts triggered a short rate limit, to slow down password guessing.",
        whatToDo: "Wait a few minutes before trying again.",
      },
      {
        message: "An account with that username already exists",
        meaning: "Someone (possibly you already) has that exact username.",
        whatToDo: "Pick a different username.",
      },
      {
        message: "You can only edit your own account.",
        meaning: "Non-admin accounts can't edit anyone else's profile.",
        whatToDo: "Ask the admin to make the change from Settings → Household members.",
      },
      {
        message: "This Plex account doesn't have access to this server.",
        meaning:
          "You signed in to Plex with an account the admin's Plex server isn't shared with, so it can't be used here.",
        whatToDo: "Sign in to Plex with the account the admin shares their server with, or ask them to share it with you.",
      },
      {
        message: "There's no Marquee account for this Plex account yet. Ask the admin to add you.",
        meaning:
          "Plex/Jellyfin checked out, but there's no Marquee account for you yet and the admin has turned off new accounts from Plex/Jellyfin sign-in.",
        whatToDo: "Ask the admin to import you (Settings → Account → Import from your media server) or turn new accounts back on.",
      },
      {
        message: "Incorrect Jellyfin username or password",
        meaning: "The household's Jellyfin server didn't accept those credentials (or that Jellyfin user is disabled).",
        whatToDo: "Use the username and password you use for Jellyfin itself.",
      },
      {
        message: "That Plex sign-in expired. Try again.",
        meaning: "Plex sign-in waits 10 minutes for you to approve it on plex.tv, and each one can only be used once.",
        whatToDo: "Start again with Sign in with Plex and finish in the tab that opens.",
      },
      {
        message: "This Plex account is already linked to another Marquee account.",
        meaning: "Each Plex (or Jellyfin) account can sign in to only one Marquee account.",
        whatToDo: "Unlink it from the other account first, or ask the admin.",
      },
    ],
  },
  {
    title: "General",
    entries: [
      {
        message: "Sign in required.",
        meaning: "The action needs a signed-in session, and none was found (it may have expired).",
        whatToDo: "Sign in again.",
      },
      {
        message: "Nothing matches those filters — try loosening them.",
        meaning: "The Discover page's random-pick or filtered search came back empty for the current filter combination.",
        whatToDo: "Remove a filter (genre, year range, etc.) and try again.",
      },
    ],
  },
];
