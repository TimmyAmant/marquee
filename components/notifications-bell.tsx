"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  getUnreadCountAction,
  getRecentNotificationsAction,
  markAllReadAction,
  markReadAction,
} from "@/lib/notifications/actions";
import { UserAvatar } from "@/components/user-avatar";
import { avatarPath } from "@/lib/users/avatar-path";

type NotificationRow = Awaited<ReturnType<typeof getRecentNotificationsAction>>[number];

const POLL_INTERVAL_MS = 30_000;

/** Where the rail takes over from the header (Tailwind's md). */
const RAIL_QUERY = "(min-width: 768px)";

function subscribeToRailQuery(onChange: () => void) {
  const query = window.matchMedia(RAIL_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Whether the rail is showing; false on the server, where nothing polls. */
function useRailShowing(): boolean {
  return useSyncExternalStore(
    subscribeToRailQuery,
    () => window.matchMedia(RAIL_QUERY).matches,
    () => false,
  );
}

function timeAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** A shared title's message without its note, which shows on a line of its
 * own ("Susan shared “Ice Age” with you: …" → "Susan shared “Ice Age” with you"). */
function sharedHeadline(message: string, note: string): string {
  const suffix = `: ${note}`;
  return message.endsWith(suffix) ? message.slice(0, -suffix.length) : message;
}

/**
 * The bell and its list. In the header (phones) it's the small round
 * button with a count, the list dropping below it; on the rail (md and up)
 * it's a rail item with a dot, the list opening beside the rail (toward
 * the content, wherever the rail sits), and
 * `railLabel` (the item's hover name) hidden while the list is open.
 */
export function NotificationsBell({
  variant = "header",
  railLabel,
}: {
  variant?: "header" | "rail";
  railLabel?: ReactNode;
} = {}) {
  const onRail = variant === "rail";
  // Both bells are mounted (CSS hides one), so only the one on screen polls:
  // otherwise every signed-in page would ask twice every 30 seconds, and
  // server actions queue one at a time behind real clicks.
  const visible = useRailShowing() === onRail;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    getUnreadCountAction().then(setUnreadCount).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!visible) return;
    refreshCount();
    const interval = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshCount, visible]);

  useEffect(() => {
    if (!open) return;
    getRecentNotificationsAction().then(setItems).catch(() => undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleMarkAllRead() {
    await markAllReadAction();
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  async function handleItemClick(item: NotificationRow) {
    setOpen(false);
    if (!item.read) {
      await markReadAction(item.id);
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
    router.push(`/title/${item.mediaType}/${item.tmdbId}`);
  }

  return (
    <div ref={containerRef} className={onRail ? "group relative" : "relative"}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        className={
          onRail
            ? `relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                open ? "bg-text-primary text-bg-0" : "text-text-secondary hover:bg-text-primary/10 hover:text-text-primary"
              }`
            : "relative flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg-2/70 text-text-secondary backdrop-blur-[18px] transition-colors hover:border-accent hover:text-accent"
        }
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={onRail ? 1.7 : 1.75}
          aria-hidden
          className={onRail ? "h-[19px] w-[19px]" : "h-4 w-4"}
        >
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 &&
          (onRail ? (
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-bg-1" />
          ) : (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-bg-0">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ))}
      </button>
      {onRail && !open && railLabel}

      {open && (
        <div
          className={`absolute z-50 w-80 rounded-2xl border border-border bg-bg-1 p-2 shadow-xl ${
            onRail ? "rail-popover" : "right-0 top-11"
          }`}
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-xs font-medium text-text-primary">Notifications</span>
            {items.some((n) => !n.read) && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] text-text-secondary transition-colors hover:text-accent"
              >
                Mark all read
              </button>
            )}
          </div>
          {/* On the rail the list opens toward the content — beside a side
              rail, from above the middle of the window, or below or above a
              top or bottom bar — so short windows cap it to what fits
              (.rail-popover in app/globals.css). */}
          <div className={onRail ? "rail-popover-list overflow-y-auto" : "max-h-96 overflow-y-auto"}>
            {items.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-text-secondary">No notifications yet.</p>
            ) : (
              items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleItemClick(item)}
                  className={`block w-full rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-bg-0 ${
                    item.read ? "text-text-secondary" : "text-text-primary"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!item.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                    {/* A shared title leads with who sent it. */}
                    {item.eventType === "title_shared" && item.sender && (
                      <span className={item.read ? "ml-3.5" : ""}>
                        <UserAvatar
                          label={item.sender.displayName || item.sender.username}
                          src={avatarPath(item.sender, "/api")}
                          size={24}
                        />
                      </span>
                    )}
                    <div className={item.read && !(item.eventType === "title_shared" && item.sender) ? "pl-3.5" : ""}>
                      <p>{item.eventType === "title_shared" && item.note ? sharedHeadline(item.message, item.note) : item.message}</p>
                      {item.eventType === "title_shared" && item.note && (
                        <p className="mt-0.5 italic text-text-secondary">“{item.note}”</p>
                      )}
                      <p className="mt-0.5 text-[10px] text-text-secondary">{timeAgo(item.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
