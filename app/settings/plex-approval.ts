"use client";

export type PlexPollAnswer = { status: "pending" } | { status: "done" } | { status: "error"; error: string };

/** Tells one approval attempt from the next: Cancel (or leaving the page)
 * moves `current` on, so a loop still sleeping from an earlier attempt stops
 * instead of polling on and later overwriting a newer attempt's outcome. */
export type ApprovalAttempts = { current: number };

/**
 * Opens plex.tv in a new tab and polls until the person approves there:
 * resolves "done", "cancelled", or the error to show. Must be called inside
 * the click handler, before any await, so the tab isn't blocked as a
 * pop-up.
 */
export async function runPlexApproval(
  start: () => Promise<{ handle?: string; authUrl?: string; error?: string }>,
  poll: (handle: string) => Promise<PlexPollAnswer>,
  attempts: ApprovalAttempts,
): Promise<
  | { status: "done" }
  /** `completed`: a poll already under way when it was cancelled went
   * through anyway — the server did its work, so the caller should refresh. */
  | { status: "cancelled"; completed: boolean }
  | { status: "error"; error: string }
> {
  const attempt = ++attempts.current;
  const cancelled = () => attempts.current !== attempt;
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  const started = await start();
  if (!started.handle || !started.authUrl) {
    tab?.close();
    if (cancelled()) return { status: "cancelled", completed: false };
    return { status: "error", error: started.error ?? "Couldn't start Plex sign-in. Try again." };
  }
  if (tab) tab.location.href = started.authUrl;
  else window.open(started.authUrl, "_blank", "noopener,noreferrer");

  const deadline = Date.now() + 10 * 60 * 1000;
  while (!cancelled() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (cancelled()) break;
    const answer = await poll(started.handle);
    if (answer.status === "pending") continue;
    if (cancelled()) return { status: "cancelled", completed: answer.status === "done" };
    return answer;
  }
  if (cancelled()) return { status: "cancelled", completed: false };
  return { status: "error", error: "Timed out waiting for Plex sign-in. Try again." };
}
