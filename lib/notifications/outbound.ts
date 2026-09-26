import { lookup as dnsLookup, type LookupAddress } from "dns";
import http from "http";
import https from "https";
import { isIP, type LookupFunction } from "net";

// Posting to an address a member typed in (their own webhook, their own
// ntfy server). The Marquee server usually sits inside a home network, so
// without care a member could point "my webhook" at the router, the NAS or
// Sonarr and have the server send requests there for them. So these go only
// to public addresses: the check runs on the addresses the connection
// actually uses (a lookup hook on the socket), so a name that resolves to a
// public address when checked and a private one a moment later (DNS
// rebinding) is still refused. Redirects aren't followed.
//
// The admin's own URLs (the household channels, and their personal ones)
// can reach the local network, as they always could. So can members' when
// MARQUEE_ALLOW_PRIVATE_WEBHOOKS=true is set, for households that run their
// own ntfy or automation on the LAN and trust everyone with an account.

const REQUEST_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export function privateAddressesAllowedForMembers(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.MARQUEE_ALLOW_PRIVATE_WEBHOOKS ?? "");
}

function ipv4ToNumber(address: string): number {
  return address.split(".").reduce((acc, part) => acc * 256 + Number(part), 0);
}

const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT, Tailscale
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, broadcast
];

function isPrivateV4(address: string): boolean {
  const value = ipv4ToNumber(address);
  return PRIVATE_V4.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const start = ipv4ToNumber(base);
    return value >= start && value < start + size;
  });
}

/** Expands an IPv6 address to its eight 16-bit groups. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  // A trailing dotted IPv4 (::ffff:10.0.0.1) becomes two groups.
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = ipv4ToNumber(dotted[2]);
    text = `${dotted[1]}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/** Loopback, private, link-local, multicast, reserved and the like: any
 * address that isn't somewhere on the public internet. Pure; unit tested. */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateV4(address);
  if (family !== 6) return true;
  const groups = ipv6Groups(address);
  if (!groups) return true;
  const [a, b] = groups;
  const allZeroUpTo = (n: number) => groups.slice(0, n).every((g) => g === 0);
  if (allZeroUpTo(8)) return true; // ::
  if (allZeroUpTo(7) && groups[7] === 1) return true; // ::1
  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the IPv4 inside.
  if (allZeroUpTo(5) && (groups[5] === 0xffff || groups[5] === 0)) {
    return isPrivateV4(`${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`);
  }
  if (a === 0x64 && b === 0xff9b) return true; // NAT64
  if ((a & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((a & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local
  if ((a & 0xff00) === 0xff00) return true; // multicast
  if (a === 0x2001 && b === 0x0db8) return true; // documentation
  if (a === 0x2002) return true; // 6to4, which can wrap a private IPv4
  return false;
}

export type OutboundPolicy = { allowPrivate: boolean };

/** Checks a URL someone typed in before it's saved. Null when it's fine,
 * else the message to show. Only the form; the address is checked on
 * every connection (see safeLookup). Pure; unit tested. */
export function outboundUrlError(raw: string, policy: OutboundPolicy): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Enter a full URL, starting with https:// or http://.";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return "Enter a full URL, starting with https:// or http://.";
  }
  if (url.username || url.password) return "Leave the user name and password out of the URL.";
  if (raw.length > 2000) return "That URL is too long.";
  if (policy.allowPrivate) return null;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host)) {
    return isPrivateAddress(host) ? "Marquee only sends to addresses on the internet, not the home network." : null;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".")) {
    return "Marquee only sends to addresses on the internet, not the home network.";
  }
  return null;
}

class BlockedAddressError extends Error {
  constructor() {
    super("That address is on the home network, which Marquee doesn't send members' notifications to.");
  }
}

/** A dns.lookup that refuses private addresses: handed to the socket, so it
 * judges the very address the connection goes to. */
function safeLookup(policy: OutboundPolicy): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = (Array.isArray(addresses) ? addresses : [addresses]) as LookupAddress[];
      const usable = policy.allowPrivate ? list : list.filter((entry) => !isPrivateAddress(entry.address));
      // Any private answer at all is suspicious enough to refuse the lot.
      if (usable.length === 0 || usable.length !== list.length) {
        return callback(new BlockedAddressError() as NodeJS.ErrnoException, "", 0);
      }
      if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, usable);
      callback(null, usable[0].address, usable[0].family);
    });
  };
}

export type OutboundResult = { ok: true } | { ok: false; error: string };

/** POSTs `body` and reports whether the far end took it (a 2xx), with a
 * short reason when it didn't. Never throws. */
export async function postOutbound(
  rawUrl: string,
  request: { headers: Record<string, string>; body: string },
  policy: OutboundPolicy,
): Promise<OutboundResult> {
  const invalid = outboundUrlError(rawUrl, policy);
  if (invalid) return { ok: false, error: invalid };
  const url = new URL(rawUrl);
  const hostIsIp = isIP(url.hostname.replace(/^\[|\]$/g, ""));
  const client = url.protocol === "https:" ? https : http;
  const payload = Buffer.from(request.body, "utf8");

  return new Promise<OutboundResult>((resolve) => {
    let settled = false;
    const finish = (result: OutboundResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const req = client.request(
      url,
      {
        method: "POST",
        headers: { ...request.headers, "Content-Length": String(payload.length), "User-Agent": "Marquee" },
        // A literal IP never goes through lookup; outboundUrlError judged it.
        lookup: hostIsIp ? undefined : safeLookup(policy),
        timeout: REQUEST_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_RESPONSE_BYTES) res.destroy();
        });
        res.on("close", () => {
          if (status >= 200 && status < 300) finish({ ok: true });
          else if (status >= 300 && status < 400) finish({ ok: false, error: `It answered with a redirect (HTTP ${status}); use the final address.` });
          else finish({ ok: false, error: `HTTP ${status}` });
        });
        res.resume();
      },
    );
    req.on("timeout", () => {
      req.destroy();
      finish({ ok: false, error: "It didn't answer in time." });
    });
    req.on("error", (err) => {
      finish({
        ok: false,
        error: err instanceof BlockedAddressError ? err.message : `Couldn't reach it (${(err as NodeJS.ErrnoException).code ?? err.message}).`,
      });
    });
    req.end(payload);
  });
}
