import { inspect } from "util";
import { redactSecrets } from "@/lib/logs/redact";

// The log lines Settings › Logs shows: the last few thousand, in memory,
// each with its level, time, where it came from ("plex-sync", from the
// "[plex-sync] …" prefix the server's messages use) and the message with
// secrets masked. lib/logs/capture.ts fills it from the console and a file.

export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogEntry = {
  id: number;
  /** ISO 8601. */
  time: string;
  level: LogLevel;
  /** The subsystem, or "server" when the line doesn't say. */
  source: string;
  message: string;
};

export const MAX_ENTRIES = 2000;
const MAX_MESSAGE = 8000;

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && (LOG_LEVELS as readonly string[]).includes(value);
}

/** The console arguments as one line of text, like console.log prints
 * them. */
export function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === "string") return arg;
      if (arg instanceof Error) return arg.stack ?? `${arg.name}: ${arg.message}`;
      return inspect(arg, { depth: 3, breakLength: Infinity, maxStringLength: 2000 });
    })
    .join(" ");
}

/** "[plex-sync] scheduled sync failed" → source "plex-sync", the rest the
 * message. */
export function splitSource(text: string): { source: string; message: string } {
  const match = text.match(/^\s*\[([A-Za-z0-9 _.:/-]{1,40})\]\s*([\s\S]*)$/);
  if (match) return { source: match[1].trim(), message: match[2] };
  return { source: "server", message: text };
}

/** One entry from what was written: source split off, secrets masked,
 * trimmed to a sensible length. */
export function makeEntry(id: number, level: LogLevel, args: unknown[], time = new Date()): LogEntry {
  const { source, message } = splitSource(formatArgs(args));
  const masked = redactSecrets(message);
  return {
    id,
    time: time.toISOString(),
    level,
    source: redactSecrets(source),
    message: masked.length > MAX_MESSAGE ? `${masked.slice(0, MAX_MESSAGE)}…` : masked,
  };
}

export type LogFilter = {
  /** The least severe level to include. */
  level?: LogLevel;
  /** Text anywhere in the message or source, any case. */
  query?: string;
  /** Only entries newer than this id (for polling). */
  after?: number;
  limit?: number;
};

/** The entries that pass the filter, oldest first, at most `limit` of the
 * newest. Pure; unit tested. */
export function filterEntries(entries: readonly LogEntry[], filter: LogFilter): LogEntry[] {
  const minimum = LOG_LEVELS.indexOf(filter.level ?? "debug");
  const query = filter.query?.trim().toLowerCase() ?? "";
  const matching = entries.filter(
    (e) =>
      LOG_LEVELS.indexOf(e.level) >= minimum &&
      (filter.after === undefined || e.id > filter.after) &&
      (!query || e.message.toLowerCase().includes(query) || e.source.toLowerCase().includes(query)),
  );
  const limit = Math.max(1, Math.min(filter.limit ?? 500, MAX_ENTRIES));
  return matching.slice(-limit);
}

/** A fixed-size list of the newest entries. */
export class LogBuffer {
  private entries: LogEntry[] = [];
  private nextId = 1;

  constructor(private readonly size = MAX_ENTRIES) {}

  add(level: LogLevel, args: unknown[], time = new Date()): LogEntry {
    const entry = makeEntry(this.nextId++, level, args, time);
    this.push(entry);
    return entry;
  }

  /** An entry read back from the file: renumbered in this buffer. */
  restore(entry: Omit<LogEntry, "id">): void {
    this.push({ ...entry, id: this.nextId++ });
  }

  private push(entry: LogEntry) {
    this.entries.push(entry);
    if (this.entries.length > this.size) this.entries.splice(0, this.entries.length - this.size);
  }

  list(filter: LogFilter = {}): LogEntry[] {
    return filterEntries(this.entries, filter);
  }

  get latestId(): number {
    return this.nextId - 1;
  }
}
