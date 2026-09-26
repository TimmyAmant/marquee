// Builds the OpenAPI 3.1 description of /api/v1 from the route registry
// (./registry.ts) and the API-key policy (lib/api/key-policy.ts), so what it
// says a key may call is what the server actually enforces. Pure: no
// database, no request — GET /api/v1/openapi.json serves it as is.
import { keyAccessFor } from "@/lib/api/key-policy";
import { API_OPERATIONS, type ApiAuthLevel, type ApiOperation } from "@/lib/api/openapi/registry";

type Json = Record<string, unknown>;

const AUTH_DESCRIPTIONS: Record<ApiAuthLevel, string> = {
  public: "No credential needed.",
  user: "Any signed-in account.",
  reviewer: "The admin or a trusted member (the review queue); 403 for others.",
  admin: "The admin only; 403 for members.",
};

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
    description: `${AUTH_DESCRIPTIONS[op.auth]}${op.auth === "public" ? "" : ` ${KEY_ACCESS_DESCRIPTIONS[keyAccess]}`}`,
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
