#!/usr/bin/env node
// Recovery tool for when the admin account is locked out and there's no
// other way in — run from inside the running container:
//   docker exec -it <container> node scripts/reset-admin-password.js <new-password>
// Builds DATABASE_URL itself from the same POSTGRES_* env vars entrypoint.sh
// uses, since a fresh `docker exec` shell doesn't inherit the runtime
// DATABASE_URL that entrypoint.sh only exports into its own process tree.
/* eslint-disable @typescript-eslint/no-require-imports -- plain CommonJS on purpose, run directly by `node` with no build step */
const { hash } = require("argon2");
const postgres = require("postgres");

async function main() {
  const newPassword = process.argv[2];
  if (!newPassword || newPassword.length < 8) {
    console.error("Usage: node scripts/reset-admin-password.js <new-password>");
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const databaseUrl =
    process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("build-time-placeholder")
      ? process.env.DATABASE_URL
      : `postgres://${process.env.POSTGRES_USER || "marquee"}:${process.env.POSTGRES_PASSWORD}@localhost:5432/${process.env.POSTGRES_DB || "marquee"}`;

  const client = postgres(databaseUrl, { max: 1 });
  const passwordHash = await hash(newPassword);
  const result = await client`
    update users set password_hash = ${passwordHash} where role = 'admin' returning username
  `;

  if (result.length === 0) {
    console.error("No admin account found.");
    process.exit(1);
  }

  console.log(`Password updated for admin account "${result[0].username}".`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
