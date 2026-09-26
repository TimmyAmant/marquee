import { API_OPERATIONS, type ApiAuthLevel, type ApiOperation } from "@/lib/api/openapi/registry";
import { keyAccessFor } from "@/lib/api/key-policy";

export const metadata = { title: "API reference — Marquee" };

// Public, like /api/v1/openapi.json it's built from the same registry: it
// describes the endpoints and holds nothing secret. A plain table rather than
// a hosted viewer, so there's no outside script to load.

const AUTH_LABELS: Record<ApiAuthLevel, string> = {
  public: "Public",
  user: "Any account",
  reviewer: "Admin or trusted",
  admin: "Admin",
};

const KEY_LABELS = {
  read: "Any key",
  full: "Full key",
  none: "No keys",
} as const;

const METHOD_COLORS: Record<ApiOperation["method"], string> = {
  GET: "text-owned",
  POST: "text-accent",
  PUT: "text-accent",
  PATCH: "text-accent",
  DELETE: "text-red-400",
};

function groups(): [string, ApiOperation[]][] {
  const byTag = new Map<string, ApiOperation[]>();
  for (const op of API_OPERATIONS) byTag.set(op.tag, [...(byTag.get(op.tag) ?? []), op]);
  return [...byTag.entries()];
}

export default function ApiDocsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">API reference</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Everything Marquee&apos;s Mac and Windows apps do goes through this JSON API, and dashboards, scripts and other
        tools can use it too. The machine-readable description is{" "}
        <a href="/api/v1/openapi.json" className="text-accent hover:underline">
          /api/v1/openapi.json
        </a>{" "}
        (OpenAPI 3.1) — import it into Postman, Insomnia or any OpenAPI viewer.
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-bg-1 p-5 text-sm text-text-secondary">
        <h2 className="font-display text-lg text-text-primary">Signing in</h2>
        <p className="mt-2">
          Every path below starts with <code className="font-mono text-text-primary">/api/v1</code>. Tools use an API key
          the admin creates under Settings › Integrations › API keys, sent as{" "}
          <code className="font-mono text-text-primary">X-Api-Key: mq_…</code> or{" "}
          <code className="font-mono text-text-primary">Authorization: Bearer mq_…</code> — never in the URL. A read-only
          key can call the endpoints marked &ldquo;Any key&rdquo;; a full key also those marked &ldquo;Full key&rdquo;.
          No key can reach the ones marked &ldquo;No keys&rdquo;. A key does what the account it acts as may do: the
          admin&apos;s, or a household member&apos;s.
        </p>
        <p className="mt-2">
          Errors are <code className="font-mono text-text-primary">{`{"error": "…", "code": "…"}`}</code> with the
          matching status: 401 for a missing, expired or revoked key, 403 outside its scope, 429 after too many wrong
          keys.
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-10">
        {groups().map(([tag, ops]) => (
          <section key={tag}>
            <h2 className="font-display text-xl text-text-primary">{tag}</h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-bg-1">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-text-muted">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 font-medium">Endpoint</th>
                    <th className="px-4 py-2.5 font-medium">What it does</th>
                    <th className="px-4 py-2.5 font-medium">Who</th>
                    <th className="px-4 py-2.5 font-medium">API keys</th>
                  </tr>
                </thead>
                <tbody>
                  {ops.map((op) => (
                    <tr key={`${op.method} ${op.path}`} className="border-b border-border last:border-0 align-top">
                      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">
                        <span className={`inline-block w-14 font-semibold ${METHOD_COLORS[op.method]}`}>{op.method}</span>
                        <span className="text-text-primary">{op.path}</span>
                      </td>
                      <td className="px-4 py-2.5 text-text-secondary">{op.summary}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{AUTH_LABELS[op.auth]}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                        {op.auth === "public" ? "—" : KEY_LABELS[keyAccessFor(op.method, op.path)]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
