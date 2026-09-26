import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Migration 0044 moves the four fixed Sonarr/Radarr connections of 0.37
// (integration_credentials rows sonarr, radarr, sonarr4k, radarr4k) into
// arr_servers as the defaults, so an existing install keeps working with no
// admin action. There's no database in the test run, so this checks the
// statement's shape; the move itself was run against a real 0.42 database.

const sql = readFileSync(path.join(__dirname, "../db/migrations/0044_add_arr_servers.sql"), "utf8");
const statements = sql.split("--> statement-breakpoint").map((s) => s.trim());
const insert = statements.find((s) => /INSERT INTO "arr_servers"/.test(s)) ?? "";
const cacheLink = statements.findIndex((s) => /UPDATE "arr_status_cache"/.test(s));
const cleanup = statements.findIndex((s) => /DELETE FROM "integration_credentials"/.test(s));

describe("migration 0044: the fixed connections become default servers", () => {
  it("creates the table before moving anything into it", () => {
    const create = statements.findIndex((s) => s.startsWith('CREATE TABLE "arr_servers"'));
    expect(create).toBeGreaterThanOrEqual(0);
    expect(statements.indexOf(insert)).toBeGreaterThan(create);
  });

  it("moves exactly the four Sonarr/Radarr providers, and only complete ones", () => {
    expect(insert).toMatch(/WHERE "provider" IN \('sonarr', 'radarr', 'sonarr4k', 'radarr4k'\)/);
    for (const column of ["base_url", "api_key_enc", "api_key_iv", "api_key_tag"]) {
      expect(insert).toContain(`AND "${column}" IS NOT NULL`);
    }
    expect(insert).not.toMatch(/plex|jellyfin/);
  });

  it("maps each provider to its kind, name and 4K-ness, as the default", () => {
    expect(insert).toContain(`CASE WHEN "provider" IN ('sonarr', 'sonarr4k') THEN 'sonarr' ELSE 'radarr' END`);
    expect(insert).toContain(`WHEN 'sonarr4k' THEN '4K Sonarr'`);
    expect(insert).toContain(`ELSE '4K Radarr'`);
    expect(insert).toContain(`"provider" IN ('sonarr4k', 'radarr4k'),\n\ttrue,`);
  });

  it("keeps the encrypted key and the add defaults as they were", () => {
    expect(insert).toContain(`"base_url", "api_key_enc", "api_key_iv", "api_key_tag",`);
    expect(insert).toContain(`"quality_profile_id", "root_folder_path",`);
  });

  it("keeps a migrated Sonarr adding shows the way it did: standard, no season folders", () => {
    expect(insert).toContain(`CASE WHEN "provider" IN ('sonarr', 'sonarr4k') THEN 'standard' ELSE NULL END`);
    expect(insert).toContain(`CASE WHEN "provider" IN ('sonarr', 'sonarr4k') THEN false ELSE NULL END`);
  });

  it("gives every server its own random webhook secret", () => {
    expect(insert).toMatch(/replace\(gen_random_uuid\(\)::text, '-', ''\) \|\| replace\(gen_random_uuid\(\)::text, '-', ''\)/);
  });

  it("links the cached statuses to the standard default, and keeps the old rows for a rollback", () => {
    expect(cacheLink).toBeGreaterThan(statements.indexOf(insert));
    expect(statements[cacheLink]).toContain(`"s"."is_4k" = false`);
    expect(cleanup).toBe(-1);
  });

  it("allows at most one default per owner, kind and 4K-ness", () => {
    expect(sql).toContain(
      `CREATE UNIQUE INDEX "arr_servers_one_default_idx" ON "arr_servers" USING btree ("user_id","kind","is_4k") WHERE "arr_servers"."is_default"`,
    );
  });
});
