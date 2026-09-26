import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Tests import server modules directly; the guard that keeps them out
      // of browser bundles has nothing to guard here (lib/i18n/server.ts
      // and everything that translates on the server imports it).
      "server-only": path.resolve(__dirname, "node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // .claude/worktrees holds other checkouts of this repo (agents'
    // working copies); their tests are theirs, not this tree's.
    exclude: ["node_modules/**", ".claude/**"],
  },
});
