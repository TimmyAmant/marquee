"use client";

export type PlexPollAnswer = { status: "pending" } | { status: "done" } | { status: "error"; error: string };

/**
 * Opens plex.tv in a new tab and polls until the person approves there:
 * resolves null once done, or with the error to show. Must be called inside
 * the click handler, before any await, so the tab isn't blocked as a
 * pop-up. `cancelled` is checked between polls.
 */
export async function runPlexApproval(
  start: () => Promise<{ handle?: string; authUrl?: string; error?: string }>,
  poll: (handle: string) => Promise<PlexPollAnswer>,
  cancelled: { current: boolean },
): Promise<string | null> {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  const started = await start();
  if (!started.handle || !started.authUrl) {
    tab?.close();
    return started.error ?? "Couldn't start Plex sign-in. Try again.";
  }
  if (tab) tab.location.href = started.authUrl;
  else window.open(started.authUrl, "_blank", "noopener,noreferrer");

  const deadline = Date.now() + 10 * 60 * 1000;
  while (!cancelled.current && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (cancelled.current) return null;
    const answer = await poll(started.handle);
    if (answer.status === "pending") continue;
    return answer.status === "error" ? answer.error : null;
  }
  return cancelled.current ? null : "Timed out waiting for Plex sign-in. Try again.";
}
