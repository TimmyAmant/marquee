"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getUnreadCountAction,
  getRecentNotificationsAction,
  markAllReadAction,
  markReadAction,
} from "@/lib/notifications/actions";

type NotificationRow = Awaited<ReturnType<typeof getRecentNotificationsAction>>[number];

const POLL_INTERVAL_MS = 30_000;

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

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(() => {
    getUnreadCountAction().then(setUnreadCount).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshCount]);

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
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
          <path
            d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-bg-0">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-2xl border border-border bg-bg-1 p-2 shadow-xl">
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
          <div className="max-h-96 overflow-y-auto">
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
                    <div className={item.read ? "pl-3.5" : ""}>
                      <p>{item.message}</p>
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
