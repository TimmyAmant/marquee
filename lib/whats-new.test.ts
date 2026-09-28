import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog";
import {
  decideWhatsNew,
  selectWhatsNew,
  whatsNewStorageKey,
  WHATS_NEW_CAP,
} from "@/lib/whats-new";
import { compareVersions } from "@/lib/version";

function entry(version: string): ChangelogEntry {
  return { version, date: "2026-09-26", changes: [`Change in ${version}`] };
}

describe("decideWhatsNew", () => {
  it("shows nothing on a device's first run, just remembers", () => {
    expect(decideWhatsNew(null, "0.45.3")).toEqual({ kind: "first-run" });
    expect(decideWhatsNew("", "0.45.3")).toEqual({ kind: "first-run" });
    // Something unreadable in storage counts as nothing stored.
    expect(decideWhatsNew("garbage", "0.45.3")).toEqual({ kind: "first-run" });
  });

  it("shows after an upgrade", () => {
    expect(decideWhatsNew("0.45.1", "0.45.3")).toEqual({ kind: "show", since: "0.45.1" });
    expect(decideWhatsNew("0.45.9", "0.45.10")).toEqual({ kind: "show", since: "0.45.9" });
  });

  it("shows nothing for the same version or a downgrade", () => {
    expect(decideWhatsNew("0.45.3", "0.45.3")).toEqual({ kind: "none" });
    expect(decideWhatsNew("0.46.0", "0.45.3")).toEqual({ kind: "none" });
  });
});

describe("selectWhatsNew", () => {
  const changelog = ["0.45.10", "0.45.9", "0.45.3", "0.45.2", "0.45.1", "0.45.0"].map(entry);

  it("lists what's newer than the stored version, up to the current one, newest first", () => {
    const picked = selectWhatsNew(changelog, "0.45.2", "0.45.10");
    expect(picked.entries.map((e) => e.version)).toEqual(["0.45.10", "0.45.9", "0.45.3"]);
    expect(picked.hasMore).toBe(false);
  });

  it("leaves out releases newer than the current version", () => {
    expect(selectWhatsNew(changelog, "0.45.0", "0.45.3").entries.map((e) => e.version)).toEqual([
      "0.45.3",
      "0.45.2",
      "0.45.1",
    ]);
  });

  it("caps the list and says there's more", () => {
    const many = Array.from({ length: 15 }, (_, i) => entry(`0.30.${i}`));
    const picked = selectWhatsNew(many, "0.29.0", "0.30.14");
    expect(picked.entries).toHaveLength(WHATS_NEW_CAP);
    expect(picked.entries[0].version).toBe("0.30.14");
    expect(picked.hasMore).toBe(true);
  });

  it("works on the real changelog", () => {
    const picked = selectWhatsNew(CHANGELOG, "0.45.1", CHANGELOG[0].version);
    expect(picked.entries[0]).toBe(CHANGELOG[0]);
    expect(picked.entries.every((e) => compareVersions(e.version, "0.45.1") > 0)).toBe(true);
  });
});

describe("whatsNewStorageKey", () => {
  it("is per server and per account", () => {
    expect(whatsNewStorageKey("https://marquee.example", "u1")).toBe("marquee:whats-new:https://marquee.example:u1");
    expect(whatsNewStorageKey("https://a", "u1")).not.toBe(whatsNewStorageKey("https://b", "u1"));
  });
});

/**
 * The Mac and Windows apps carry lib/changelog.ts itself and read it with a
 * small scanner (App/WhatsNew.swift, Marquee.Core/Updates/WhatsNew.cs) for
 * their own "What's new" after an app-only update. This is that scanner, so
 * a change to the file's shape the apps can't read fails here first: keep
 * entries as `version: "…"`, `date: "…"`, `changes: ["…", …]` with
 * double-quoted strings.
 */
function scanChangelogSource(source: string): ChangelogEntry[] | null {
  // The array after `export const CHANGELOG: ChangelogEntry[] =`.
  const start = source.indexOf("=", source.indexOf("export const CHANGELOG"));
  if (start < 0 || source.indexOf("export const CHANGELOG") < 0) return null;
  const entries: ChangelogEntry[] = [];
  let current: { version?: string; date?: string; changes?: string[] } | null = null;
  let pendingKey: string | null = null;
  let inChanges = false;
  let i = source.indexOf("[", start);
  if (i < 0) return null;
  i++;
  while (i < source.length) {
    const c = source[i];
    if (c === "/" && source[i + 1] === "/") {
      i = source.indexOf("\n", i);
      if (i < 0) break;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      const end = source.indexOf("*/", i + 2);
      if (end < 0) return null;
      i = end + 2;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < source.length && source[j] !== '"') j += source[j] === "\\" ? 2 : 1;
      if (j >= source.length) return null;
      let text: string;
      try {
        text = JSON.parse(source.slice(i, j + 1)) as string;
      } catch {
        return null;
      }
      i = j + 1;
      if (!current) return null;
      if (inChanges) current.changes!.push(text);
      else if (pendingKey === "version") current.version = text;
      else if (pendingKey === "date") current.date = text;
      pendingKey = null;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
      pendingKey = source.slice(i, j);
      i = j;
      continue;
    }
    if (c === "{") current = {};
    else if (c === "[" && pendingKey === "changes" && current) {
      current.changes = [];
      inChanges = true;
    } else if (c === "]" && inChanges) inChanges = false;
    else if (c === "]") break;
    else if (c === "}" && current) {
      if (!current.version || !current.date || !current.changes) return null;
      entries.push({ version: current.version, date: current.date, changes: current.changes });
      current = null;
    }
    i++;
  }
  return entries;
}

describe("lib/changelog.ts as the apps read it", () => {
  it("scans to exactly CHANGELOG", () => {
    const source = readFileSync(path.join(__dirname, "changelog.ts"), "utf8");
    expect(scanChangelogSource(source)).toEqual(CHANGELOG);
  });
});
