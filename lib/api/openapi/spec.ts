// Builds the OpenAPI 3.1 description of /api/v1 from the route registry
// (./registry.ts) and the API-key policy (lib/api/key-policy.ts), so what it
// says a key may call is what the server actually enforces. Pure: no
// database, no request — GET /api/v1/openapi.json serves it as is.
import { keyAccessFor } from "@/lib/api/key-policy";
import { API_OPERATIONS, type ApiAuthLevel, type ApiOperation } from "@/lib/api/openapi/registry";
import { permissionLabel } from "@/lib/users/permissions";
import { englishT } from "@/lib/i18n/catalog";

type Json = Record<string, unknown>;

const AUTH_DESCRIPTIONS: Record<"public" | "user" | "admin", string> = {
  public: "No credential needed.",
  user: "Any signed-in account.",
  admin: "The admin only; 403 for everyone else, whatever their permissions.",
};

/** Who may call it, in words. */
export function authDescription(auth: ApiAuthLevel): string {
  if (auth === "public" || auth === "user" || auth === "admin") return AUTH_DESCRIPTIONS[auth];
  return `The admin, or an account with the “${permissionLabel(auth, englishT())}” permission (\`${auth}\`); 403 for others.`;
}

const KEY_ACCESS_DESCRIPTIONS = {
  read: "Any API key may call this.",
  full: "Needs a full-access API key (a read-only key gets 403).",
  none: "API keys are refused here (403) — sign in with a device token.",
} as const;

const TAG_DESCRIPTIONS: Record<string, string> = {
  "Dashboard widgets": "Small, cheap endpoints for Homepage, Homarr and other dashboards — see docs/integrations.md.",
  "API keys": "Admin-issued keys for tools and scripts. Managed by a signed-in admin only.",
};

const ERROR_RESPONSE = { $ref: "#/components/responses/Error" };

const SCHEMAS: Record<string, Json> = {
  Error: {
    type: "object",
    required: ["error", "code"],
    properties: {
      error: { type: "string", description: "A message safe to show." },
      code: {
        type: "string",
        enum: ["invalid", "unauthorized", "invalid_credentials", "forbidden", "not_found", "conflict", "expired", "setup_complete", "rate_limited", "internal", "upstream"],
      },
    },
  },
  Ok: { type: "object", required: ["ok"], properties: { ok: { const: true } } },
  RequestPerson: {
    type: "object",
    required: ["userId", "displayName", "username", "label"],
    properties: {
      userId: { type: ["string", "null"], format: "uuid" },
      displayName: { type: ["string", "null"] },
      username: { type: "string" },
      label: { type: "string" },
    },
  },
  ApiKey: {
    type: "object",
    required: ["id", "name", "scope", "actAs", "hint", "createdAt", "lastUsedAt", "expiresAt", "expired"],
    properties: {
      id: { type: "string", format: "uuid" },
      name: { type: "string" },
      scope: { type: "string", enum: ["read", "full"] },
      actAs: { oneOf: [{ $ref: "#/components/schemas/RequestPerson" }, { type: "null" }] },
      hint: { type: "string", description: "The key's first characters, e.g. mq_AbCd." },
      createdAt: { type: "string", format: "date-time" },
      lastUsedAt: { type: ["string", "null"], format: "date-time" },
      expiresAt: { type: ["string", "null"], format: "date-time" },
      expired: { type: "boolean" },
    },
  },
  ApiKeyList: {
    type: "object",
    required: ["results"],
    properties: { results: { type: "array", items: { $ref: "#/components/schemas/ApiKey" } } },
  },
  ApiKeyCreate: {
    type: "object",
    required: ["name", "scope"],
    properties: {
      name: { type: "string", maxLength: 80 },
      scope: { type: "string", enum: ["read", "full"] },
      actAsUserId: { type: ["string", "null"], format: "uuid", description: "Act as this member instead of the admin." },
      expiresInDays: { type: ["integer", "null"], minimum: 1, maximum: 3650, description: "null or absent: never expires." },
    },
  },
  ApiKeyCreated: {
    type: "object",
    required: ["key", "apiKey"],
    properties: {
      key: { type: "string", pattern: "^mq_[A-Za-z0-9_-]{43}$", description: "The secret — shown this once." },
      apiKey: { $ref: "#/components/schemas/ApiKey" },
    },
  },
  StatsSummary: {
    type: "object",
    required: ["pendingRequests", "openIssues", "cantFind", "movies", "series", "downloading"],
    properties: {
      pendingRequests: { type: "integer", description: "Requests waiting for review (0 unless the account reviews requests)." },
      openIssues: { type: "integer", description: "Open problem reports (0 unless the account reviews requests)." },
      cantFind: { type: "integer", description: "Approved requests Sonarr/Radarr can't find (0 unless the account reviews requests)." },
      movies: { type: "integer" },
      series: { type: "integer" },
      downloading: { type: "integer", description: "Titles Sonarr/Radarr are downloading now." },
    },
  },
  TitleRef: {
    type: "object",
    required: ["mediaType", "tmdbId"],
    properties: { mediaType: { type: "string", enum: ["movie", "tv"] }, tmdbId: { type: "integer" } },
  },
  TitleCard: {
    type: "object",
    required: ["mediaType", "tmdbId", "name", "posterPath", "year", "subtitle", "overview", "rating", "status", "favorited", "requested", "canQuickAdd", "canRequest"],
    properties: {
      mediaType: { type: "string", enum: ["movie", "tv"] },
      tmdbId: { type: "integer" },
      name: { type: "string" },
      posterPath: { type: ["string", "null"], description: "A TMDb path, or a full URL (see docs/api-v1.md, deviation 1)." },
      year: { type: ["string", "null"] },
      subtitle: { type: ["string", "null"] },
      overview: { type: ["string", "null"] },
      rating: { type: ["number", "null"] },
      status: { type: ["string", "null"], description: "A LibraryStatus; null when not in the library." },
      favorited: { type: ["boolean", "null"] },
      requested: { type: ["boolean", "null"] },
      canQuickAdd: { type: "boolean" },
      canRequest: { type: "boolean" },
      episodes: {
        oneOf: [
          {
            type: "object",
            required: ["have", "total"],
            properties: {
              have: { type: "integer", description: "Aired episodes with a file on disk." },
              total: { type: "integer", description: "Episodes aired so far." },
            },
          },
          { type: "null" },
        ],
        description:
          "Series in the library only: aired episodes on disk against episodes aired, specials left out (the poster's \"96/96\"). Null for a movie or a show the library doesn't have; left out by older servers.",
      },
    },
  },
  KnownForTitle: {
    type: "object",
    description: "The title a person or studio is best known for: its backdrop goes behind the page's header, with a \"From {name}\" link to it.",
    required: ["mediaType", "tmdbId", "name", "backdropPath"],
    properties: {
      mediaType: { type: "string", enum: ["movie", "tv"] },
      tmdbId: { type: "integer" },
      name: { type: "string" },
      backdropPath: { type: "string" },
    },
  },
  ExternalLink: {
    type: "object",
    description: "An official link, in display order. The label is the brand name, or \"Website\" for homepage.",
    required: ["kind", "url"],
    properties: {
      kind: { type: "string", enum: ["imdb", "instagram", "twitter", "facebook", "tiktok", "youtube", "homepage"] },
      url: { type: "string", format: "uri" },
    },
  },
  PersonDetail: {
    type: "object",
    required: ["tmdbId", "name", "alsoKnownAs", "biography", "birthday", "deathday", "placeOfBirth", "profilePath", "favorited", "credits"],
    properties: {
      tmdbId: { type: "integer" },
      name: { type: "string" },
      alsoKnownAs: { type: "array", items: { type: "string" } },
      biography: { type: ["string", "null"] },
      birthday: { type: ["string", "null"], format: "date" },
      deathday: { type: ["string", "null"], format: "date" },
      placeOfBirth: { type: ["string", "null"] },
      profilePath: { type: ["string", "null"] },
      favorited: { type: "boolean" },
      knownForTitle: {
        oneOf: [{ $ref: "#/components/schemas/KnownForTitle" }, { type: "null" }],
        description: "Null when nothing they're known for has artwork. Missing on older servers.",
      },
      externalLinks: {
        type: "array",
        items: { $ref: "#/components/schemas/ExternalLink" },
        description: "IMDb, socials and their website, only the ones they have. Missing on older servers.",
      },
      credits: { type: "array", items: { $ref: "#/components/schemas/TitleCard" } },
    },
  },
  CompanyDetail: {
    type: "object",
    required: ["tmdbId", "name", "description", "logoPath", "titleCount", "favorited", "titles"],
    properties: {
      tmdbId: { type: "integer" },
      name: { type: "string" },
      description: { type: ["string", "null"] },
      logoPath: { type: ["string", "null"] },
      titleCount: { type: "integer" },
      favorited: { type: "boolean" },
      knownForTitle: {
        oneOf: [{ $ref: "#/components/schemas/KnownForTitle" }, { type: "null" }],
        description: "Its most-voted title with artwork; null when none. Missing on older servers.",
      },
      externalLinks: {
        type: "array",
        items: { $ref: "#/components/schemas/ExternalLink" },
        description: "Only its website (homepage), when TMDb lists one. Missing on older servers.",
      },
      titles: { type: "array", items: { $ref: "#/components/schemas/TitleCard" } },
    },
  },
  LibraryEntry: {
    allOf: [
      { $ref: "#/components/schemas/TitleCard" },
      {
        type: "object",
        required: ["tvdbId", "source", "sizeBytes", "addedAt", "genres", "resolution", "hdr", "videoCodec", "audioCodec", "quality", "filePath", "episodeCount", "upgradeAvailable", "possibleDuplicate", "arrTracking"],
        properties: {
          tvdbId: { type: ["integer", "null"] },
          source: { type: "string", enum: ["plex", "jellyfin", "sonarr", "radarr"] },
          sizeBytes: { type: ["integer", "null"] },
          addedAt: { type: ["string", "null"], format: "date-time" },
          genres: { type: "array", items: { type: "string" } },
          resolution: { type: ["string", "null"], enum: ["4K", "1080p", "720p", "SD", null] },
          hdr: { type: ["string", "null"], description: "HDR10, HDR10+, Dolby Vision…; null for SDR." },
          videoCodec: { type: ["string", "null"] },
          audioCodec: { type: ["string", "null"] },
          quality: { type: ["string", "null"], description: "Radarr's quality profile name for the file." },
          filePath: { type: ["string", "null"], description: "The admin only; null for members." },
          episodeCount: { type: ["integer", "null"], description: "Series: episode files on disk." },
          upgradeAvailable: { type: "boolean" },
          possibleDuplicate: { type: "boolean" },
          arrTracking: {
            oneOf: [
              { type: "object", required: ["arrId", "monitored"], properties: { arrId: { type: "integer" }, monitored: { type: "boolean" } } },
              { type: "null" },
            ],
            description: "The admin only: Radarr/Sonarr has the title.",
          },
        },
      },
    ],
  },
  LibraryPage: {
    type: "object",
    required: ["page", "pageSize", "totalPages", "totalResults", "results", "summary", "filters", "connected"],
    properties: {
      page: { type: "integer" },
      pageSize: { type: "integer" },
      totalPages: { type: "integer" },
      totalResults: { type: "integer" },
      results: { type: "array", items: { $ref: "#/components/schemas/LibraryEntry" } },
      summary: {
        type: "object",
        required: ["movies", "series", "episodes", "totalBytes", "tracked"],
        properties: {
          movies: { type: "integer" },
          series: { type: "integer" },
          episodes: { type: "integer", description: "Episode files on disk." },
          totalBytes: { type: "integer" },
          tracked: { type: "integer", description: "Titles not on disk yet: downloading, missing, coming soon." },
        },
      },
      filters: {
        type: "object",
        required: ["sources", "genres", "codecs", "years", "resolutions", "hasHdr"],
        properties: {
          sources: { type: "array", items: { type: "string" } },
          genres: { type: "array", items: { type: "string" } },
          codecs: { type: "array", items: { type: "string" } },
          years: { type: "array", items: { type: "integer" } },
          resolutions: { type: "array", items: { type: "string" } },
          hasHdr: { type: "boolean" },
        },
      },
      connected: { type: "boolean", description: "Plex, Jellyfin, Sonarr or Radarr is connected." },
    },
  },
  LibraryCollectionList: {
    type: "object",
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          required: ["key", "title", "collectionId", "collectionFavorited", "items", "missingCount", "addAllMissing", "requestAllMissing", "requestAllTarget"],
          properties: {
            key: { type: "string" },
            title: { type: "string" },
            collectionId: { type: ["integer", "null"] },
            collectionFavorited: { type: ["boolean", "null"] },
            items: { type: "array", items: { $ref: "#/components/schemas/TitleCard" } },
            missingCount: { type: "integer" },
            addAllMissing: { type: "array", items: { $ref: "#/components/schemas/TitleRef" } },
            requestAllMissing: { type: "array", items: { $ref: "#/components/schemas/TitleRef" } },
            requestAllTarget: { $ref: "#/components/schemas/TitleRef" },
          },
        },
      },
    },
  },
  LibraryDuplicateList: {
    type: "object",
    required: ["results"],
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          required: ["mediaType", "tmdbId", "name", "posterPath", "year", "reason", "copies"],
          properties: {
            mediaType: { type: "string", enum: ["movie", "tv"] },
            tmdbId: { type: "integer" },
            name: { type: "string" },
            posterPath: { type: ["string", "null"] },
            year: { type: ["string", "null"] },
            reason: { type: "string", enum: ["paths", "servers"] },
            copies: {
              type: "array",
              items: {
                type: "object",
                required: ["source", "server", "filePath", "sizeBytes", "quality"],
                properties: {
                  source: { type: "string", enum: ["plex", "jellyfin", "sonarr", "radarr"] },
                  server: { type: "string" },
                  filePath: { type: ["string", "null"] },
                  sizeBytes: { type: ["integer", "null"] },
                  quality: { type: ["string", "null"] },
                },
              },
            },
          },
        },
      },
    },
  },
  LibraryStorage: {
    type: "object",
    required: ["folders", "totalFreeBytes", "measuredAt", "live", "forecast"],
    properties: {
      folders: {
        type: "array",
        items: {
          type: "object",
          required: ["path", "freeBytes", "servers"],
          properties: {
            path: { type: "string" },
            freeBytes: { type: "integer" },
            servers: { type: "array", items: { type: "string" }, description: "The Sonarr/Radarr servers with this root folder." },
          },
        },
      },
      totalFreeBytes: { type: "integer" },
      measuredAt: { type: ["string", "null"], format: "date-time" },
      live: { type: "boolean", description: "Read from the servers just now, or the newest daily snapshot." },
      forecast: {
        oneOf: [
          {
            type: "object",
            required: ["daysRemaining", "bytesPerDay", "fullOn"],
            properties: {
              daysRemaining: { type: "integer" },
              bytesPerDay: { type: "integer" },
              fullOn: { type: "string", format: "date", description: "The day the disks run out at the current rate." },
            },
          },
          { type: "null" },
        ],
      },
    },
  },
};

function pathParameters(path: string): Json[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

function operationObject(op: ApiOperation): Json {
  const keyAccess = keyAccessFor(op.method, op.path);
  const security =
    op.auth === "public"
      ? []
      : keyAccess === "none"
        ? [{ deviceToken: [] }]
        : [{ deviceToken: [] }, { apiKey: [] }, { apiKeyBearer: [] }];
  const success = op.response
    ? { "application/json": { schema: { $ref: `#/components/schemas/${op.response}` } } }
    : { "application/json": { schema: { type: "object" } } };

  const responses: Json = {
    [op.created ? "201" : "200"]: { description: op.created ? "Created" : "OK", content: success },
    "400": ERROR_RESPONSE,
    "404": ERROR_RESPONSE,
  };
  if (op.auth !== "public") {
    responses["401"] = ERROR_RESPONSE;
    responses["403"] = ERROR_RESPONSE;
    responses["429"] = ERROR_RESPONSE;
  }

  const operation: Json = {
    operationId: `${op.method.toLowerCase()}${op.path.replace(/\{([^}]+)\}/g, "By-$1").replace(/[^A-Za-z0-9]+(.)?/g, (_, c: string | undefined) => (c ? c.toUpperCase() : ""))}`,
    tags: [op.tag],
    summary: op.summary,
    description: `${authDescription(op.auth)}${op.auth === "public" ? "" : ` ${KEY_ACCESS_DESCRIPTIONS[keyAccess]}`}`,
    security,
    "x-marquee-auth": op.auth,
    "x-api-key-access": op.auth === "public" ? "read" : keyAccess,
    responses,
  };
  const parameters = pathParameters(op.path);
  if (parameters.length > 0) operation.parameters = parameters;
  if (op.requestBody) {
    operation.requestBody = {
      required: true,
      content: { "application/json": { schema: { $ref: `#/components/schemas/${op.requestBody}` } } },
    };
  }
  return operation;
}

export function buildOpenApiSpec(version: string): Json {
  const paths: Record<string, Json> = {};
  const tags: string[] = [];
  for (const op of API_OPERATIONS) {
    (paths[op.path] ??= {})[op.method.toLowerCase()] = operationObject(op);
    if (!tags.includes(op.tag)) tags.push(op.tag);
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Marquee API",
      version,
      description:
        "The JSON API behind Marquee's Mac and Windows apps, also open to dashboards, scripts and other tools. " +
        "Sign in with a device token (POST /auth/login) or use an API key an admin created under " +
        "Settings › Integrations › API keys. Full reference: docs/api-v1.md in the Marquee repository.",
    },
    servers: [{ url: "/api/v1" }],
    tags: tags.map((name) => (TAG_DESCRIPTIONS[name] ? { name, description: TAG_DESCRIPTIONS[name] } : { name })),
    paths,
    components: {
      securitySchemes: {
        deviceToken: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "mqt_…",
          description: "A device token from POST /auth/login (or setup, Plex, Jellyfin, single sign-on).",
        },
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "X-Api-Key",
          description: "An admin-issued API key, mq_…. Read-only keys can't change anything.",
        },
        apiKeyBearer: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "mq_…",
          description: "The same API key, sent as Authorization: Bearer mq_….",
        },
      },
      responses: {
        Error: {
          description: "An error: { error, code }.",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
      schemas: SCHEMAS,
    },
  };
}
