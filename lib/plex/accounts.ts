import { plexHeaders } from "@/lib/plex/client";

// plex.tv account lookups behind "Sign in with Plex" and "Import from Plex"
// (lib/auth/media-signin.ts). The fetches are thin; the parsing is pure and
// unit tested against the documented response shapes (accounts.test.ts).

const PLEX_TV_BASE = "https://plex.tv";
// Same budget as the rest of lib/plex/client.ts: plex.tv being slow
// shouldn't hang a sign-in.
const REQUEST_TIMEOUT_MS = 8000;

/** Who a Plex token belongs to. Deliberately without the token itself —
 * nothing downstream needs it, and a member's Plex token is never stored. */
export type PlexAccount = {
  /** plex.tv's numeric account id, as a string — the same id /api/users
   * lists for the admin's friends and home users, which is what lets an
   * imported account and a later sign-in meet on one value. */
  id: string;
  uuid: string | null;
  username: string;
  /** The display name ("title" on plex.tv; a home user's only name). */
  title: string;
  email: string | null;
  thumb: string | null;
};

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function accountId(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value) && value !== "0") return value;
  return null;
}

/**
 * Parses `GET https://plex.tv/api/v2/user` (JSON with `Accept:
 * application/json`): an object with `id` (number), `uuid`, `username`,
 * `title`, `email`, `thumb`, `friendlyName`, `authToken` and a lot more we
 * ignore. Reference: python-plexapi's MyPlexAccount (key
 * "https://plex.tv/api/v2/user"), and Plex's own web app, which reads the
 * same fields. Returns null when there's no usable id — better to refuse the
 * sign-in than to link an account to nothing.
 */
export function parsePlexAccount(body: unknown): PlexAccount | null {
  if (!body || typeof body !== "object") return null;
  const raw = body as Record<string, unknown>;
  const id = accountId(raw.id);
  if (!id) return null;
  const username = nonEmptyString(raw.username) ?? nonEmptyString(raw.title) ?? "";
  const title = nonEmptyString(raw.title) ?? nonEmptyString(raw.friendlyName) ?? username;
  return {
    id,
    uuid: nonEmptyString(raw.uuid),
    username,
    title,
    email: nonEmptyString(raw.email),
    thumb: nonEmptyString(raw.thumb),
  };
}

export async function getPlexAccount(clientId: string, token: string): Promise<PlexAccount | null> {
  const res = await fetch(`${PLEX_TV_BASE}/api/v2/user`, {
    headers: plexHeaders(clientId, token),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to read the Plex account (${res.status})`);
  return parsePlexAccount(await res.json());
}

/** One entry of `GET https://plex.tv/api/v2/resources`, as far as the
 * access check needs it. */
export type PlexResourceSummary = { clientIdentifier: string; provides: string; owned?: boolean };

/** Every Plex Media Server this token can reach — its own and the ones
 * shared with it (a friend's share, or the owner's servers for a Plex Home
 * member). Unlike getResources in client.ts, which keeps only owned servers
 * for syncing, nothing is filtered out here: a shared server is exactly
 * what a member's sign-in is checked against. */
export async function getServerResources(clientId: string, token: string): Promise<PlexResourceSummary[]> {
  const res = await fetch(`${PLEX_TV_BASE}/api/v2/resources?includeHttps=1`, {
    headers: plexHeaders(clientId, token),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to list Plex resources (${res.status})`);
  const body: unknown = await res.json();
  if (!Array.isArray(body)) return [];
  return body.filter(
    (r): r is PlexResourceSummary =>
      Boolean(r) && typeof r.clientIdentifier === "string" && typeof r.provides === "string",
  );
}

/**
 * Whether a Plex account's resource list includes one of the admin's
 * servers (`plex_servers.machine_identifier`, which is a server's
 * `clientIdentifier` on plex.tv), and whether it owns it. `owned` is true
 * only on the owner's own account, so `owner` identifies the admin's Plex
 * account without trusting anything the account says about itself.
 */
export function plexServerAccess(
  resources: PlexResourceSummary[],
  machineIds: readonly string[],
): { access: boolean; owner: boolean } {
  const wanted = new Set(machineIds);
  const matches = resources.filter(
    (r) => wanted.has(r.clientIdentifier) && r.provides.split(",").includes("server"),
  );
  return { access: matches.length > 0, owner: matches.some((r) => r.owned === true) };
}

/** Someone the admin's Plex account shares with: a friend or a Plex Home
 * user. */
export type PlexSharedUser = PlexAccount & {
  home: boolean;
  /** A managed Home user: no plex.tv login of their own. */
  restricted: boolean;
  /** machineIdentifiers of the admin's servers shared with this user. */
  serverMachineIds: string[];
};

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return XML_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function parseXmlAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of source.matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? "");
  }
  return attrs;
}

/**
 * Parses `GET https://plex.tv/api/users` — XML only, a MediaContainer of
 * `<User id title username email thumb home restricted …>` elements, each
 * with a `<Server machineIdentifier … />` child per server of the admin's
 * shared with them (https://www.plexopedia.com/plex-media-server/api-plextv/users/;
 * Seerr's server/api/plextv.ts getUsers and Tautulli's get_plextv_friends
 * read the same document). It's used rather than the JSON
 * `/api/v2/friends` because it's the one listing that says *which* server
 * each person can use, and it includes Plex Home users too.
 *
 * The document is flat and machine-generated, so a tag scanner is enough:
 * no DTD, no CDATA, no nesting beyond User > Server. There's no XML parser
 * in the dependency tree and this doesn't warrant adding one.
 */
export function parsePlexUsersXml(xml: string): PlexSharedUser[] {
  const result: PlexSharedUser[] = [];
  let current: PlexSharedUser | null = null;

  for (const match of xml.matchAll(/<(\/?)([A-Za-z][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g)) {
    const [, closing, tag, attrSource, selfClosing] = match;
    if (tag === "User") {
      if (closing) {
        if (current) result.push(current);
        current = null;
        continue;
      }
      const attrs = parseXmlAttributes(attrSource);
      const account = parsePlexAccount(attrs);
      const user: PlexSharedUser | null = account
        ? {
            ...account,
            home: attrs.home === "1",
            restricted: attrs.restricted === "1",
            serverMachineIds: [],
          }
        : null;
      if (selfClosing) {
        if (user) result.push(user);
      } else {
        current = user;
      }
    } else if (tag === "Server" && !closing && current) {
      const machineId = parseXmlAttributes(attrSource).machineIdentifier;
      if (machineId) current.serverMachineIds.push(machineId);
    }
  }
  return result;
}

export async function getPlexSharedUsers(clientId: string, adminToken: string): Promise<PlexSharedUser[]> {
  const res = await fetch(`${PLEX_TV_BASE}/api/users`, {
    headers: { ...plexHeaders(clientId, adminToken), Accept: "application/xml" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Failed to list Plex users (${res.status})`);
  return parsePlexUsersXml(await res.text());
}

/** The people "Import from Plex" offers: Plex Home users, and friends with
 * at least one of the admin's servers shared with them. A friend with only
 * some other server of theirs can't sign in here anyway. */
export function importablePlexUsers(users: PlexSharedUser[], machineIds: readonly string[]): PlexSharedUser[] {
  const wanted = new Set(machineIds);
  return users.filter((u) => u.home || u.serverMachineIds.some((id) => wanted.has(id)));
}
