"use client";

import { useEffect, useState } from "react";
import { getPendingRequestCountAction } from "@/lib/requests/actions";

const POLL_INTERVAL_MS = 20_000;

/** Admin-only pending-request count, polled so a newly submitted request
 * shows up in the nav without a manual page refresh. */
export function RequestsBadge({
  initialCount,
  className = "ml-auto",
}: {
  initialCount: number;
  /** Where it sits; beside a label by default. */
  className?: string;
}) {
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

  // Not while the tab is in the background (like RequestsAutoRefresh):
  // it catches up the moment the tab is looked at again.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      getPendingRequestCountAction()
        .then((next) => {
          if (!cancelled) setCount(next);
        })
        .catch(() => undefined);
    };
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  if (count === 0) return null;

  return (
    <span className={`${className} flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-accent px-[5px] text-[10.5px] font-bold text-bg-0`}>
      {count > 9 ? "9+" : count}
    </span>
  );
}
