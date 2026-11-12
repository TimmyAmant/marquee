import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __marqueePgClient: postgres.Sql | undefined;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Kept on globalThis in production too, not just across dev hot reloads:
// Next.js can load this module more than once in the same process (once for
// server actions, once for route handlers…), and each copy would otherwise
// open a pool of its own.
const client = (globalThis.__marqueePgClient ??= postgres(connectionString, {
  max: process.env.NODE_ENV === "production" ? 10 : 1,
}));

export const db = drizzle(client, { schema });
