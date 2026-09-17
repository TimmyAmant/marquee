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
    <span className="ml-auto flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-accent px-[5px] text-[10.5px] font-bold text-bg-0">
      {count > 9 ? "9+" : count}
    </span>
  );
}
