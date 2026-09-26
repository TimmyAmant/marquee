import http from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Name → addresses for the lookup hook, so no test depends on real DNS.
const answers = vi.hoisted(() => new Map<string, { address: string; family: number }[]>());
vi.mock("dns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("dns")>();
  return {
    ...actual,
    lookup: (hostname: string, options: unknown, callback: (err: Error | null, addresses: unknown) => void) => {
      const found = answers.get(hostname);
      if (!found) return callback(Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" }), []);
      callback(null, found);
    },
  };
});

import { isPrivateAddress, outboundUrlError, postOutbound } from "./outbound";

describe("isPrivateAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "fc12:3456::1",
    "::ffff:127.0.0.1",
    "::ffff:192.168.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
    "2002:c0a8:101::1",
    "not-an-ip",
  ])("refuses %s", (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(["1.1.1.1", "8.8.8.8", "172.32.0.1", "192.169.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (address) => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe("outboundUrlError", () => {
  const member = { allowPrivate: false };
  const admin = { allowPrivate: true };

  it("wants a full http(s) URL without credentials", () => {
    expect(outboundUrlError("example.com/hook", member)).toMatch(/full URL/);
    expect(outboundUrlError("ftp://example.com/hook", member)).toMatch(/full URL/);
    expect(outboundUrlError("file:///etc/passwd", admin)).toMatch(/full URL/);
    expect(outboundUrlError("https://user:pass@example.com/hook", member)).toMatch(/user name/);
    expect(outboundUrlError("https://example.com/hook", member)).toBeNull();
  });

  it("keeps members' URLs off the home network", () => {
    for (const url of [
      "http://127.0.0.1:8989/api",
      "http://[::1]/",
      "http://192.168.1.2/",
      "http://169.254.169.254/latest/meta-data",
      "http://localhost:3000/",
      "http://nas.local/",
      "http://sonarr/",
      "http://[::ffff:10.0.0.1]/",
    ]) {
      expect(outboundUrlError(url, member), url).toMatch(/home network/);
    }
  });

  it("lets the admin (or a server that allows it) reach the home network, as before", () => {
    expect(outboundUrlError("http://192.168.1.2:8080/hook", admin)).toBeNull();
    expect(outboundUrlError("http://sonarr/", admin)).toBeNull();
  });
});

describe("postOutbound", () => {
  let server: http.Server;
  let port = 0;
  const received: { body: string; headers: http.IncomingHttpHeaders }[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ body, headers: req.headers });
        if (req.url === "/redirect") {
          res.writeHead(302, { Location: "http://169.254.169.254/" });
          return res.end();
        }
        res.writeHead(req.url === "/broken" ? 500 : 204);
        res.end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
    answers.set("hooks.example.test", [{ address: "127.0.0.1", family: 4 }]);
    answers.set("public.example.test", [{ address: "93.184.215.14", family: 4 }]);
    answers.set("mixed.example.test", [
      { address: "93.184.215.14", family: 4 },
      { address: "10.0.0.8", family: 4 },
    ]);
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("refuses a public-looking name that resolves to a private address (checked at connect time)", async () => {
    const result = await postOutbound(
      `http://hooks.example.test:${port}/hook`,
      { headers: { "Content-Type": "application/json" }, body: "{}" },
      { allowPrivate: false },
    );
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/home network/) });
    expect(received).toHaveLength(0);
  });

  it("refuses a name with any private answer among public ones", async () => {
    const result = await postOutbound("http://mixed.example.test/hook", { headers: {}, body: "{}" }, { allowPrivate: false });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/home network/) });
  });

  it("posts when private addresses are allowed, and reports the status", async () => {
    const ok = await postOutbound(
      `http://hooks.example.test:${port}/hook`,
      { headers: { "Content-Type": "application/json" }, body: '{"a":1}' },
      { allowPrivate: true },
    );
    expect(ok).toEqual({ ok: true });
    expect(received.at(-1)?.body).toBe('{"a":1}');
    expect(received.at(-1)?.headers["content-type"]).toBe("application/json");

    const broken = await postOutbound(`http://127.0.0.1:${port}/broken`, { headers: {}, body: "" }, { allowPrivate: true });
    expect(broken).toEqual({ ok: false, error: "HTTP 500" });
  });

  it("doesn't follow redirects", async () => {
    const result = await postOutbound(`http://127.0.0.1:${port}/redirect`, { headers: {}, body: "" }, { allowPrivate: true });
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/redirect/) });
  });
});
