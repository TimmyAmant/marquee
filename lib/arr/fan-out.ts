import type { LibraryStatus } from "@/components/status-badge";

// Asking several Sonarr/Radarr servers the same question at once. A page
// waits for them in parallel, and at most ARR_LOOKUP_BUDGET_MS for any one
// of them — a slow or unreachable server then counts as not having the
// title, rather than holding the page (the same 2.5s budget the 4K lookup
// has always had). Pure apart from timers, so it's shared with tests.

export const ARR_LOOKUP_BUDGET_MS = 2500;

/** `promise`, or `fallback` if it fails or takes longer than `ms`. */
export function withinBudget<T>(promise: Promise<T>, fallback: T, ms = ARR_LOOKUP_BUDGET_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
    (timer as { unref?: () => void }).unref?.();
  });
  return Promise.race([promise.catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
}

/** Runs `ask` against every server in parallel, each within the budget.
 * Results keep the servers' order; a failed or slow server gives `fallback`. */
export function askEachServer<S, T>(
  servers: readonly S[],
  ask: (server: S) => Promise<T>,
  fallback: T,
  ms = ARR_LOOKUP_BUDGET_MS,
): Promise<{ server: S; value: T }[]> {
  return Promise.all(
    servers.map(async (server) => ({
      server,
      value: await withinBudget(
        // A synchronous throw inside `ask` becomes a rejection, not a crash.
        Promise.resolve().then(() => ask(server)),
        fallback,
        ms,
      ),
    })),
  );
}

/** How far along a copy is — owned beats downloading beats wanted, etc. —
 * for picking which server's copy of a title to show when several have it. */
const STATUS_RANK: Record<LibraryStatus, number> = {
  owned: 4,
  tracked_downloading: 3,
  tracked_monitored: 2,
  coming_soon: 1,
  untracked: 0,
};

export function statusRank(status: LibraryStatus | string | null | undefined): number {
  return status && status in STATUS_RANK ? STATUS_RANK[status as LibraryStatus] : 0;
}

/** The entry with the best status; the earliest one wins a tie, so the
 * default server (listed first) is preferred between equals. Null for none. */
export function bestByStatus<T>(entries: readonly T[], statusOf: (entry: T) => LibraryStatus): T | null {
  let best: T | null = null;
  let bestRank = -1;
  for (const entry of entries) {
    const rank = statusRank(statusOf(entry));
    if (rank > bestRank) {
      best = entry;
      bestRank = rank;
    }
  }
  return best;
}
