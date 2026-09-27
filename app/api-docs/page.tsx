import type { Metadata } from "next";
import { API_OPERATIONS, type ApiAuthLevel, type ApiOperation } from "@/lib/api/openapi/registry";
import { keyAccessFor } from "@/lib/api/key-policy";
import { permissionLabel } from "@/lib/users/permissions";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";
import type { MessageKey, Translator } from "@/lib/i18n/translator";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("help.apiMetaTitle") };
}

// Public, like /api/v1/openapi.json it's built from the same registry: it
// describes the endpoints and holds nothing secret. A plain table rather than
// a hosted viewer, so there's no outside script to load. The endpoint
// summaries come from the registry, which (like the OpenAPI document) is
// written in English.

const AUTH_LABELS: Record<"public" | "user" | "admin", MessageKey> = {
  public: "help.apiAuthPublic",
  user: "help.apiAuthUser",
  admin: "help.apiAuthAdmin",
};

/** A permission's label ("Review requests") for the rest (lib/users/permissions.ts). */
function authLabel(auth: ApiAuthLevel, t: Translator): string {
  return auth === "public" || auth === "user" || auth === "admin" ? t(AUTH_LABELS[auth]) : permissionLabel(auth, t);
}

const KEY_LABELS: Record<"read" | "full" | "none", MessageKey> = {
  read: "help.apiKeyRead",
  full: "help.apiKeyFull",
  none: "help.apiKeyNone",
};

const METHOD_COLORS: Record<ApiOperation["method"], string> = {
  GET: "text-owned",
  POST: "text-accent",
  PUT: "text-accent",
  PATCH: "text-accent",
  DELETE: "text-red-400",
};

const ERROR_SHAPE = `{"error": "…", "code": "…"}`;

function groups(): [string, ApiOperation[]][] {
  const byTag = new Map<string, ApiOperation[]>();
  for (const op of API_OPERATIONS) byTag.set(op.tag, [...(byTag.get(op.tag) ?? []), op]);
  return [...byTag.entries()];
}

const code = (chunks: React.ReactNode) => <code className="font-mono text-text-primary">{chunks}</code>;

export default async function ApiDocsPage() {
  const t = await getT();
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">{t("help.apiTitle")}</h1>
      <p className="mt-2 text-sm text-text-secondary">
        {rich(t("help.apiIntro"), {
          link: (chunks) => (
            <a href="/api/v1/openapi.json" className="text-accent hover:underline">
              {chunks}
            </a>
          ),
        })}
      </p>

      <div className="mt-6 rounded-2xl border border-border bg-bg-1 p-5 text-sm text-text-secondary">
        <h2 className="font-display text-lg text-text-primary">{t("help.apiSigningInTitle")}</h2>
        <p className="mt-2">{rich(t("help.apiSigningInBody"), { code })}</p>
        <p className="mt-2">{rich(t("help.apiErrorsBody", { shape: ERROR_SHAPE }), { code })}</p>
      </div>

      <div className="mt-10 flex flex-col gap-10">
        {groups().map(([tag, ops]) => (
          <section key={tag}>
            <h2 className="font-display text-xl text-text-primary">{tag}</h2>
            <div className="mt-3 overflow-x-auto rounded-2xl border border-border bg-bg-1">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-text-muted">
                  <tr className="border-b border-border">
                    <th className="px-4 py-2.5 font-medium">{t("help.apiColEndpoint")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("help.apiColWhat")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("help.apiColWho")}</th>
                    <th className="px-4 py-2.5 font-medium">{t("help.apiColKeys")}</th>
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
                      <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">{authLabel(op.auth, t)}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-text-secondary">
                        {op.auth === "public" ? "—" : t(KEY_LABELS[keyAccessFor(op.method, op.path)])}
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
