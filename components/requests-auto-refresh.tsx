"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getPendingRequestCountAction } from "@/lib/requests/actions";

const POLL_INTERVAL_MS = 20_000;

/** Reloads the Requests page when its count moves on the server — a member
 * requested something, a request couldn't be added or can't be found — so a
 * reviewer sitting on the page sees it without leaving and coming back.
 * The same count as the nav badge (and the apps' badge poller, which
 * reloads their Requests screens the same way). */
export function RequestsAutoRefresh({ initialCount }: { initialCount: number }) {
  const router = useRouter();
  const seen = useRef(initialCount);

  // A reload (ours or after approving) renders the page with the new count.
  useEffect(() => {
    seen.current = initialCount;
  }, [initialCount]);

  useEffect(() => {
    let cancelled = false;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      getPendingRequestCountAction()
        .then((count) => {
          if (cancelled || count === seen.current) return;
          seen.current = count;
          router.refresh();
        })
        .catch(() => undefined);
    };
    const interval = setInterval(check, POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
    };
  }, [router]);

  return null;
}
