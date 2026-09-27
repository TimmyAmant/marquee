"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RAIL_POSITIONS, railLabelsCookie, railPositionCookie, type RailPosition } from "@/lib/rail-position";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translator";

const LABELS: Record<RailPosition, MessageKey> = {
  left: "settings.menuPositionLeft",
  right: "settings.menuPositionRight",
  top: "settings.menuPositionTop",
  bottom: "settings.menuPositionBottom",
};

/** Where the menu sits in each option's little window, in a 40x28 box. */
const BAR: Record<RailPosition, { x: number; y: number; width: number; height: number }> = {
  left: { x: 4, y: 7, width: 4, height: 14 },
  right: { x: 32, y: 7, width: 4, height: 14 },
  top: { x: 11, y: 4, width: 18, height: 4 },
  bottom: { x: 11, y: 20, width: 18, height: 4 },
};

/** Saves the choice for the server's next render and moves the rail now. */
function applyRailPosition(position: RailPosition) {
  document.cookie = railPositionCookie(position);
  document.documentElement.setAttribute("data-rail", position);
}

/**
 * Settings › Account › Appearance: which edge of the window the menu rail
 * sits on, for this device (lib/rail-position.ts). Applies at once: the
 * cookie is for the server's next render, and data-rail on <html> is what
 * the rail and the page's margins follow in CSS, so there's no reload.
 */
export function RailPositionSetting({ initial }: { initial: RailPosition }) {
  const t = useT();
  const router = useRouter();
  const [position, setPosition] = useState<RailPosition>(initial);

  function choose(next: RailPosition) {
    setPosition(next);
    applyRailPosition(next);
    // The root layout renders data-rail from the cookie; refreshing keeps
    // React's copy in step with what's now on <html>.
    router.refresh();
  }

  return (
    <div className="p-6">
      <p id="rail-position-label" className="text-sm font-medium text-text-primary">
        {t("settings.menuPositionLabel")}
      </p>
      <p className="mt-1 text-sm text-text-secondary">{t("settings.menuPositionHelp")}</p>
      <div role="radiogroup" aria-labelledby="rail-position-label" className="mt-4 grid grid-cols-4 gap-2">
        {RAIL_POSITIONS.map((option) => {
          const selected = option === position;
          const bar = BAR[option];
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(option)}
              className={`flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-xs font-medium transition-colors ${
                selected
                  ? "border-accent bg-accent/10 text-text-primary"
                  : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
              }`}
            >
              <svg viewBox="0 0 40 28" aria-hidden className="h-7 w-10">
                <rect x="0.75" y="0.75" width="38.5" height="26.5" rx="4" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
                <rect {...bar} rx="2" className={selected ? "fill-accent" : "fill-current"} />
              </svg>
              {t(LABELS[option])}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Settings › Account › Appearance: "Show menu labels", for this device
 * (lib/rail-position.ts). The rail shows each section's name beside its
 * icon and the server's version at the end. Applies at once, like the
 * position above.
 */
export function RailLabelsSetting({ initial }: { initial: boolean }) {
  const t = useT();
  const router = useRouter();
  const [on, setOn] = useState(initial);

  function toggle() {
    const next = !on;
    setOn(next);
    document.cookie = railLabelsCookie(next);
    if (next) document.documentElement.setAttribute("data-rail-labels", "on");
    else document.documentElement.removeAttribute("data-rail-labels");
    router.refresh();
  }

  return (
    <div className="flex items-start justify-between gap-4 p-6">
      <div>
        <p id="rail-labels-label" className="text-sm font-medium text-text-primary">
          {t("settings.menuLabelsLabel")}
        </p>
        <p className="mt-1 text-sm text-text-secondary">{t("settings.menuLabelsHelp")}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="rail-labels-label"
        onClick={toggle}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-text-primary/20"}`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left] ${on ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}
