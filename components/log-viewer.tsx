"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLogsAction } from "@/app/settings/logs/actions";
import type { LogEntry, LogLevel } from "@/lib/logs/buffer";
import { formatDate } from "@/lib/i18n/format";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translator";
import { showToast } from "@/components/toast";
import { SETTINGS_INPUT, SETTINGS_SECONDARY_BUTTON } from "@/components/settings/settings-ui";

// Settings › Logs: the server's recent lines, newest at the bottom, filtered
// by level and text, refreshed every few seconds unless paused, and copied
// or downloaded as text. The filter runs on the server (lib/logs/buffer.ts);
// a refresh only asks for lines newer than the last one shown.

const REFRESH_MS = 3000;
const KEEP = 2000;

const LEVEL_LABELS: Record<LogLevel, MessageKey> = {
  debug: "admin.logLevelDebug",
  info: "admin.logLevelInfo",
  warn: "admin.logLevelWarn",
  error: "admin.logLevelError",
};

const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: "border-border-strong text-text-muted",
  info: "border-sky-400/40 text-sky-300",
  warn: "border-amber-400/40 text-amber-300",
  error: "border-red-400/50 text-red-400",
};

function asText(entries: LogEntry[]): string {
  return entries.map((e) => `${e.time} ${e.level.toUpperCase().padEnd(5)} [${e.source}] ${e.message}`).join("\n");
}

export function LogViewer() {
  const t = useT();
  const [level, setLevel] = useState<LogLevel>("info");
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const lastId = useRef<number | undefined>(undefined);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const load = useCallback(
    async (fresh: boolean) => {
      const result = await getLogsAction({ level, query, after: fresh ? undefined : lastId.current }).catch(() => null);
      if (!result || !result.ok) {
        setError(result && !result.ok ? result.error : t("common.somethingWentWrong"));
        return;
      }
      setError(null);
      setLoaded(true);
      lastId.current = result.latestId;
      setEntries((current) => (fresh ? result.results : [...current, ...result.results].slice(-KEEP)));
    },
    [level, query, t],
  );

  // A new filter starts over (after a short pause while typing).
  useEffect(() => {
    const timer = setTimeout(() => void load(true), 250);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => void load(false), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load, paused]);

  // Follow new lines while the list is scrolled to its end.
  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [entries]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(asText(entries));
      showToast(t("admin.logsCopied"));
    } catch {
      showToast(t("common.somethingWentWrong"), "error");
    }
  }

  function download() {
    const blob = new Blob([asText(entries) + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `marquee-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.log`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="mt-6 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="log-level">
          {t("admin.logsLevel")}
        </label>
        <select
          id="log-level"
          value={level}
          onChange={(e) => setLevel(e.target.value as LogLevel)}
          className="rounded-lg border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent"
        >
          {(Object.keys(LEVEL_LABELS) as LogLevel[]).map((l) => (
            <option key={l} value={l}>
              {t("admin.logsLevelAndUp", { level: t(LEVEL_LABELS[l]) })}
            </option>
          ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("admin.logsFilter")}
          aria-label={t("admin.logsFilter")}
          className={`${SETTINGS_INPUT} min-w-0 flex-1 py-2 sm:max-w-xs`}
        />
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} className={SETTINGS_SECONDARY_BUTTON}>
            {paused ? t("admin.logsResume") : t("admin.logsPause")}
          </button>
          <button type="button" onClick={copy} disabled={entries.length === 0} className={SETTINGS_SECONDARY_BUTTON}>
            {t("common.copy")}
          </button>
          <button type="button" onClick={download} disabled={entries.length === 0} className={SETTINGS_SECONDARY_BUTTON}>
            {t("admin.logsDownload")}
          </button>
        </div>
      </div>

      <p className="text-xs text-text-muted" aria-live="polite">
        {error ??
          (paused
            ? t("admin.logsPaused", { count: entries.length })
            : t("admin.logsLive", { count: entries.length }))}
      </p>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
        className="max-h-[65vh] min-h-[240px] overflow-y-auto rounded-2xl border border-border bg-bg-1"
      >
        {loaded && entries.length === 0 && <p className="p-5 text-sm text-text-secondary">{t("admin.logsEmpty")}</p>}
        <ol className="divide-y divide-border font-mono text-[12px] leading-relaxed">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-1 px-4 py-2 sm:flex-row sm:gap-3">
              <span className="flex shrink-0 items-center gap-2 sm:w-[260px]">
                <time dateTime={entry.time} className="text-text-muted">
                  {formatDate(t, entry.time, "dateTime")}
                </time>
                <span className={`rounded-full border px-1.5 text-[10px] uppercase ${LEVEL_STYLES[entry.level]}`}>
                  {t(LEVEL_LABELS[entry.level])}
                </span>
                <span className="truncate text-text-secondary">{entry.source}</span>
              </span>
              <span className="min-w-0 whitespace-pre-wrap break-words text-text-primary">{entry.message}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
