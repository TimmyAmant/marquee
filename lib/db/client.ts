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

const client =
  global.__marqueePgClient ??
  postgres(connectionString, { max: process.env.NODE_ENV === "production" ? 10 : 1 });

if (process.env.NODE_ENV !== "production") {
  global.__marqueePgClient = client;
}

export const db = drizzle(client, { schema });
