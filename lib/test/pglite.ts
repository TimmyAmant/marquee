import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "@/lib/db/schema";

// A real Postgres for tests (PGlite: Postgres compiled to WebAssembly, in
// process, in memory) with every migration applied — for the logic whose
// correctness lives in its SQL: guarded updates, cascades, counts. Use it
// from a test file as
//
//   vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());
//
// and call resetTestDatabase() before each test.

type TestDb = ReturnType<typeof drizzle<typeof schema>>;

let instance: { db: TestDb; ready: Promise<void> } | null = null;

export async function testDatabase(): Promise<{ db: TestDb }> {
  if (!instance) {
    const client = new PGlite();
    const db = drizzle(client, { schema });
    const ready = migrate(db, { migrationsFolder: path.resolve(__dirname, "../db/migrations") });
    instance = { db, ready };
  }
  await instance.ready;
  return { db: instance.db };
}

/** Empties every table the tests write to. */
export async function resetTestDatabase(): Promise<void> {
  const { db } = await testDatabase();
  const result = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const tables = result.rows.map((r) => `"${r.tablename}"`);
  if (tables.length > 0) await db.execute(sql.raw(`truncate ${tables.join(", ")} cascade`));
}
