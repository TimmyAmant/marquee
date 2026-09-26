import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { can, normalizePermissions, PERMISSIONS, presetFor, type Permission } from "./permissions";

// Migration 0051 on a real Postgres: accounts made before it (every role,
// with and without auto-approval) come out able to do exactly what they
// could before — no more, no less.

const MIGRATIONS = path.resolve(__dirname, "../db/migrations");
const TAG = "0051_add_user_permissions";

/** A copy of the migrations folder that stops just before 0051. */
function migrationsBefore(tag: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "marquee-migrations-"));
  fs.cpSync(MIGRATIONS, dir, { recursive: true });
  const journalPath = path.join(dir, "meta", "_journal.json");
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
  const index = journal.entries.findIndex((e) => e.tag === tag);
  expect(index).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, index);
  fs.writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

type Before = { username: string; role: string; movies: boolean; tv: boolean };

// What each account could do before permissions existed, straight from the
// old rules (lib/users/roles.ts and the request code at 0.47).
function oldAbilities(u: Before): Record<Permission, boolean> {
  const admin = u.role === "admin";
  const reviewer = admin || u.role === "trusted";
  return {
    requestMovies: true,
    requestTv: true,
    request4kMovies: true,
    request4kTv: true,
    autoApproveMovies: reviewer || u.movies,
    autoApproveTv: reviewer || u.tv,
    autoApprove4kMovies: reviewer || u.movies,
    autoApprove4kTv: reviewer || u.tv,
    advancedRequests: reviewer,
    viewRequests: reviewer,
    reviewRequests: reviewer,
    manageIssues: reviewer,
    reportIssues: true,
    manageBlocklist: admin,
    bypassLimits: reviewer,
  };
}

describe("migration 0051 (user permissions)", () => {
  it("gives every existing account exactly what it could do before", async () => {
    const client = new PGlite();
    const db = drizzle(client);
    await migrate(db, { migrationsFolder: migrationsBefore(TAG) });

    const before: Before[] = [
      { username: "admin", role: "admin", movies: false, tv: false },
      { username: "trusted", role: "trusted", movies: false, tv: false },
      { username: "trusted-flags", role: "trusted", movies: true, tv: false },
      { username: "member", role: "member", movies: false, tv: false },
      { username: "movies-auto", role: "member", movies: true, tv: false },
      { username: "tv-auto", role: "member", movies: false, tv: true },
      { username: "both-auto", role: "member", movies: true, tv: true },
    ];
    for (const u of before) {
      await db.execute(
        sql`insert into users (username, role, auto_approve_movies, auto_approve_tv) values (${u.username}, ${u.role}, ${u.movies}, ${u.tv})`,
      );
    }

    await migrate(db, { migrationsFolder: MIGRATIONS });

    const rows = (
      await db.execute<{ username: string; role: string; permissions: string[] }>(
        sql`select username, role, permissions from users`,
      )
    ).rows;
    expect(rows).toHaveLength(before.length);
    for (const u of before) {
      const row = rows.find((r) => r.username === u.username)!;
      expect(row.role, u.username).toBe(u.role);
      const expected = oldAbilities(u);
      for (const p of PERMISSIONS) {
        expect(can(row, p), `${u.username}: ${p}`).toBe(expected[p]);
      }
    }

    // The roles still read as their presets.
    const preset = (name: string) => presetFor(rows.find((r) => r.username === name)!);
    expect(preset("admin")).toBe("admin");
    expect(preset("trusted")).toBe("trusted");
    expect(preset("trusted-flags")).toBe("trusted");
    expect(preset("member")).toBe("member");
    expect(preset("movies-auto")).toBe("custom");

    // An account made after it starts as a Member.
    await db.execute(sql`insert into users (username) values ('newcomer')`);
    const [fresh] = (await db.execute<{ permissions: string[] }>(sql`select permissions from users where username = 'newcomer'`)).rows;
    expect(normalizePermissions(fresh.permissions)).toEqual([
      "requestMovies",
      "requestTv",
      "request4kMovies",
      "request4kTv",
      "reportIssues",
    ]);
    await client.close();
  });
});
