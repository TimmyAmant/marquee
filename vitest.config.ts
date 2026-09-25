import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
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
