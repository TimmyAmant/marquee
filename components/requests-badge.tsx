"use client";

import { useCallback, useEffect, useState } from "react";
import { getPendingRequestCountAction } from "@/lib/requests/actions";

const POLL_INTERVAL_MS = 20_000;

/** Admin-only pending-request count, polled so a newly submitted request
 * shows up in the nav without a manual page refresh. */
export function RequestsBadge({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  const [syncedInitialCount, setSyncedInitialCount] = useState(initialCount);

  // The server-rendered count changes whenever this component's parent
  // layout re-renders (e.g. router.refresh() after approving/rejecting a
  // request) — but useState only reads its initializer on mount. Adjusting
  // state during render (rather than in an effect) is the documented React
  // pattern for this: https://react.dev/learn/you-might-not-need-an-effect
  if (initialCount !== syncedInitialCount) {
    setSyncedInitialCount(initialCount);
    setCount(initialCount);
  }

  const refresh = useCallback(() => {
    getPendingRequestCountAction().then(setCount).catch(() => undefined);
  }, []);

  useEffect(() => {
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  if (count === 0) return null;

  return (
    <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-bg-0">
      {count > 9 ? "9+" : count}
    </span>
  );
}
