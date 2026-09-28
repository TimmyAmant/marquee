import { describe, expect, it } from "vitest";
import { redactSecrets } from "@/lib/logs/redact";
import { LogBuffer, filterEntries, makeEntry, splitSource } from "@/lib/logs/buffer";

describe("redactSecrets", () => {
  const cases: [string, string][] = [
    ["GET http://sonarr:8989/api/v3/series?apikey=0123456789abcdef0123456789abcdef", "?apikey=[redacted]"],
    ["https://plex.tv/api/resources?X-Plex-Token=AbCdEf123456&foo=1", "X-Plex-Token=[redacted]&foo=1"],
    ["Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijk", "Authorization: [redacted]"],
    ["headers { 'x-api-key': 'mq_abcdefghijklmnopqrstuvwxyz123456' }", "[redacted]"],
    ['{"username":"anna","password":"hunter2"}', '"password":"[redacted]"'],
    ["posting to https://discord.com/api/webhooks/123/SeCrEt-token", "discord.com/api/webhooks/[redacted]"],
    ["https://hooks.slack.com/services/T000/B000/XXXXXXXX", "hooks.slack.com/services/[redacted]"],
    ["https://api.telegram.org/bot123456789:AAEhBP0av18ZlLZrXVkYwQtV8BBGrVbhZ5c/sendMessage", "bot[redacted]/sendMessage"],
    ["smtp://mail:s3cr3t@smtp.example.com:587", "smtp://[redacted]@smtp.example.com"],
    ["/api/webhooks/servers/7f1c2b0e-1111-4111-8111-111111111111/abcdefSECRET", "/api/webhooks/servers/7f1c2b0e-1111-4111-8111-111111111111/[redacted]"],
  ];

  it.each(cases)("masks %s", (input, expected) => {
    const out = redactSecrets(input);
    expect(out).toContain(expected);
  });

  it("never leaves the secret itself", () => {
    for (const secret of ["0123456789abcdef0123456789abcdef", "hunter2", "SeCrEt-token", "s3cr3t", "AbCdEf123456"]) {
      const line = cases.map(([input]) => input).find((input) => input.includes(secret))!;
      expect(redactSecrets(line)).not.toContain(secret);
    }
  });

  it("leaves ordinary lines alone", () => {
    const line = "[plex-sync] synced 1234 items from Tower in 2.3s (server 7f1c2b0e-1111-4111-8111-111111111111)";
    expect(redactSecrets(line)).toBe(line);
  });
});

describe("log entries", () => {
  it("takes the source from the [prefix]", () => {
    expect(splitSource("[plex-sync] scheduled sync failed: boom")).toEqual({ source: "plex-sync", message: "scheduled sync failed: boom" });
    expect(splitSource("Listening on 3000")).toEqual({ source: "server", message: "Listening on 3000" });
  });

  it("formats the console's arguments and masks them", () => {
    const entry = makeEntry(1, "error", ["[arr-sync] failed:", new Error("apikey=0123456789abcdef0123456789abcdef")], new Date(0));
    expect(entry).toMatchObject({ id: 1, level: "error", source: "arr-sync", time: "1970-01-01T00:00:00.000Z" });
    expect(entry.message).toContain("apikey=[redacted]");
    expect(entry.message).not.toContain("0123456789abcdef");
  });

  it("filters by level, text and id, keeping the newest", () => {
    const entries = [
      makeEntry(1, "debug", ["[a] one"]),
      makeEntry(2, "info", ["[b] two"]),
      makeEntry(3, "warn", ["[a] three"]),
      makeEntry(4, "error", ["[c] four"]),
    ];
    expect(filterEntries(entries, { level: "warn" }).map((e) => e.id)).toEqual([3, 4]);
    expect(filterEntries(entries, { query: "A" }).map((e) => e.id)).toEqual([1, 3]);
    expect(filterEntries(entries, { after: 2 }).map((e) => e.id)).toEqual([3, 4]);
    expect(filterEntries(entries, { limit: 1 }).map((e) => e.id)).toEqual([4]);
  });

  it("keeps only the newest lines", () => {
    const buffer = new LogBuffer(3);
    for (let i = 0; i < 5; i++) buffer.add("info", [`line ${i}`]);
    expect(buffer.list().map((e) => e.message)).toEqual(["line 2", "line 3", "line 4"]);
    expect(buffer.latestId).toBe(5);
  });
});
