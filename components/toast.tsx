"use client";

import { useEffect, useState } from "react";

const TOAST_EVENT = "marquee:toast";
const TOAST_MS = 4000;

type Toast = { id: number; text: string };

/** Shows a short confirmation at the bottom of the window ("Arcane
 * requested successfully!") from anywhere on the client: the host in the
 * root layout listens for it. */
export function showToast(text: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: text }));
}

let nextId = 1;

/** Mounted once in app/layout.tsx. Each toast fades out after a few
 * seconds; several stack. */
export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function onToast(e: Event) {
      const text = (e as CustomEvent<string>).detail;
      const id = nextId++;
      setToasts((list) => [...list, { id, text }]);
      window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), TOAST_MS);
    }
    window.addEventListener(TOAST_EVENT, onToast);
    return () => window.removeEventListener(TOAST_EVENT, onToast);
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(20px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className="nav-glass pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-medium text-text-primary shadow-[0_12px_32px_rgb(0_0_0/0.35)]"
        >
          <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-owned text-bg-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
              <path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {toast.text}
        </div>
      ))}
    </div>
  );
}
