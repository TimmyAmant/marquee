import { expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", async () => (await import("@/lib/test/pglite")).testDatabase());

import { translatorForUser } from "@/lib/i18n/server";

it("probe", async () => {
  const results = await Promise.allSettled([translatorForUser("00000000-0000-4000-8000-000000000001"), translatorForUser("00000000-0000-4000-8000-000000000002")]);
  console.log(results.map((r) => (r.status === "rejected" ? String(r.reason) : r.value.locale)));
  const again = await Promise.allSettled([translatorForUser("00000000-0000-4000-8000-000000000001")]);
  console.log(again.map((r) => (r.status === "rejected" ? String(r.reason) : r.value.locale)));
  expect([results, again].flat().map((r) => (r.status === "rejected" ? String(r.reason) : r.value.locale))).toEqual([]);
});
