import fs from "fs";
import os from "os";
import path from "path";
import { LogBuffer, isLogLevel, type LogEntry, type LogLevel } from "@/lib/logs/buffer";

// Settings › Logs' source: every console line the server writes, masked
// (lib/logs/redact.ts), kept in memory for the page and appended to a file
// (one JSON object a line) so a restart doesn't lose the recent history.
// The file rolls over at 5 MB, keeping one old one. MARQUEE_LOG_DIR says
// where: the Docker image sets /var/log/marquee (a mounted folder in the
// Unraid template and docker-compose.yml); otherwise the system's temporary
// folder.

const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** How much of the file is read back on start. */
const RESTORE_BYTES = 1024 * 1024;

type CaptureState = {
  buffer: LogBuffer;
  file: string | null;
  fileBytes: number;
  installed: boolean;
};

declare global {
  var __marqueeLogs: CaptureState | undefined;
}

function state(): CaptureState {
  globalThis.__marqueeLogs ??= { buffer: new LogBuffer(), file: null, fileBytes: 0, installed: false };
  return globalThis.__marqueeLogs;
}

export function logBuffer(): LogBuffer {
  return state().buffer;
}

export function logFilePath(): string {
  return path.join(process.env.MARQUEE_LOG_DIR?.trim() || path.join(os.tmpdir(), "marquee-logs"), "marquee.log");
}

function restore(file: string, buffer: LogBuffer): number {
  try {
    const stat = fs.statSync(file);
    const start = Math.max(0, stat.size - RESTORE_BYTES);
    const fd = fs.openSync(file, "r");
    try {
      const chunk = Buffer.alloc(stat.size - start);
      fs.readSync(fd, chunk, 0, chunk.length, start);
      const lines = chunk.toString("utf8").split("\n");
      if (start > 0) lines.shift(); // a partial first line
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as Partial<LogEntry>;
          if (typeof entry.time === "string" && isLogLevel(entry.level) && typeof entry.message === "string") {
            buffer.restore({ time: entry.time, level: entry.level, source: String(entry.source ?? "server"), message: entry.message });
          }
        } catch {
          // Not one of ours; skipped.
        }
      }
    } finally {
      fs.closeSync(fd);
    }
    return stat.size;
  } catch {
    return 0;
  }
}

function append(s: CaptureState, entry: LogEntry, original: typeof console.error) {
  if (!s.file) return;
  const line = `${JSON.stringify({ time: entry.time, level: entry.level, source: entry.source, message: entry.message })}\n`;
  try {
    if (s.fileBytes + line.length > MAX_FILE_BYTES) {
      fs.renameSync(s.file, `${s.file}.1`);
      s.fileBytes = 0;
    }
    fs.appendFileSync(s.file, line);
    s.fileBytes += Buffer.byteLength(line);
  } catch (err) {
    // The folder isn't writable: keep the memory copy only, and say so once.
    s.file = null;
    original.call(console, "[logs] can't write the log file, keeping logs in memory only:", (err as Error).message);
  }
}

const METHODS: [keyof Console & ("debug" | "log" | "info" | "warn" | "error"), LogLevel][] = [
  ["debug", "debug"],
  ["log", "info"],
  ["info", "info"],
  ["warn", "warn"],
  ["error", "error"],
];

/** Starts keeping the console's lines. Once per server (instrumentation.ts). */
export function installLogCapture(): void {
  const s = state();
  if (s.installed) return;
  s.installed = true;

  const file = logFilePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    s.fileBytes = restore(file, s.buffer);
    s.file = file;
  } catch {
    s.file = null;
  }

  const originalError = console.error;
  for (const [method, level] of METHODS) {
    const original = console[method].bind(console) as (...args: unknown[]) => void;
    console[method] = (...args: unknown[]) => {
      original(...args);
      try {
        const entry = s.buffer.add(level, args);
        append(s, entry, originalError);
      } catch {
        // Keeping the line must never break the code that logged it.
      }
    };
  }
}
