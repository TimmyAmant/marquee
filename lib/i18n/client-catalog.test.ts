import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { CLIENT_EXTRA_KEYS, CLIENT_NAMESPACES, clientMessagesFor, messagesFor } from "@/lib/i18n/catalog";
import { LOCALES } from "@/lib/i18n/locales";
import { NAMESPACES } from "@/lib/i18n/messages";

// The browser only gets part of the catalog (clientMessagesFor). This walks
// every Client Component ("use client") and everything it imports at
// runtime — stopping at server actions ("use server"), which stay on the
// server — and checks that each message key written there is one the
// browser gets: a whole namespace in CLIENT_NAMESPACES, or one of
// CLIENT_EXTRA_KEYS. A key built at runtime (`notify.${kind}`) needs its
// whole namespace.

const ROOT = path.resolve(__dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) && !name.endsWith(".test.ts") ? [full] : [];
  });
}

/** "use client" / "use server" at the top of a file, after any comments. */
function directive(text: string): string | null {
  let rest = text.trimStart();
  for (;;) {
    if (rest.startsWith("//")) {
      const end = rest.indexOf("\n");
      rest = end < 0 ? "" : rest.slice(end + 1).trimStart();
    } else if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/");
      rest = end < 0 ? "" : rest.slice(end + 2).trimStart();
    } else {
      break;
    }
  }
  const match = /^["'](use client|use server)["']/.exec(rest);
  return match ? match[1] : null;
}

function resolveImport(spec: string, from: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(from), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile() && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

/** What a file imports at runtime (type-only imports left out). */
function runtimeImports(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const specs: string[] = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings;
      if (clause && !clause.name && named && ts.isNamedImports(named) && named.elements.length > 0 && named.elements.every((e) => e.isTypeOnly)) continue;
      specs.push((statement.moduleSpecifier as ts.StringLiteral).text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier && !statement.isTypeOnly) {
      specs.push((statement.moduleSpecifier as ts.StringLiteral).text);
    }
  }
  for (const match of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) specs.push(match[1]);
  return specs;
}

function clientModuleGraph(): Map<string, string> {
  const files = ["app", "components", "lib"].flatMap((dir) => sourceFiles(path.join(ROOT, dir)));
  const texts = new Map<string, string>();
  const read = (file: string) => {
    let text = texts.get(file);
    if (text === undefined) {
      text = readFileSync(file, "utf8");
      texts.set(file, text);
    }
    return text;
  };
  const stack = files.filter((file) => directive(read(file)) === "use client");
  const graph = new Map<string, string>();
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (graph.has(file)) continue;
    const text = read(file);
    graph.set(file, text);
    if (directive(text) === "use server") continue;
    for (const spec of runtimeImports(file, text)) {
      const resolved = resolveImport(spec, file);
      // The catalog itself lists every key; it's what's being checked.
      if (resolved && !resolved.includes(`${path.sep}i18n${path.sep}`)) stack.push(resolved);
    }
  }
  return graph;
}

describe("the browser's share of the catalog", () => {
  const whole = new Set<string>(CLIENT_NAMESPACES);
  const extra = new Set<string>(CLIENT_EXTRA_KEYS);
  const keyPattern = new RegExp(`["'\`](${NAMESPACES.join("|")})\\.([A-Za-z0-9_]*)(["'\`$])`, "g");

  it("has every key a Client Component (or what it imports) uses", () => {
    const missing: string[] = [];
    const graph = clientModuleGraph();
    // The walk found the Client Components (and what they import).
    expect(graph.has(path.join(ROOT, "components/search-bar.tsx"))).toBe(true);
    expect(graph.has(path.join(ROOT, "lib/push/browser.ts"))).toBe(true);
    for (const [file, text] of graph) {
      if (directive(text) === "use server") continue;
      for (const match of text.matchAll(keyPattern)) {
        const [, namespace, key, end] = match;
        if (whole.has(namespace)) continue;
        const where = path.relative(ROOT, file);
        // A key put together at runtime: only a whole namespace covers it.
        if (end === "$" || end === "`" || !key) missing.push(`${where}: ${namespace}.${key}… (built at runtime)`);
        else if (!extra.has(`${namespace}.${key}`)) missing.push(`${where}: ${namespace}.${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("leaves the server's own namespaces out", () => {
    const messages = clientMessagesFor("en");
    const all = messagesFor("en");
    for (const namespace of ["help", "server", "notify"]) {
      const keys = Object.keys(all).filter((key) => key.startsWith(`${namespace}.`));
      const sent = keys.filter((key) => key in messages);
      expect(sent.length).toBeLessThan(keys.length / 4);
    }
    expect(Object.keys(messages).length).toBeLessThan(Object.keys(all).length * 0.75);
  });

  it("is the same messages as the full catalog for every key it has, in every language", () => {
    for (const locale of LOCALES) {
      const all = messagesFor(locale);
      for (const [key, value] of Object.entries(clientMessagesFor(locale))) expect(value).toBe(all[key]);
      for (const key of CLIENT_EXTRA_KEYS) expect(clientMessagesFor(locale)[key]).toBeTruthy();
    }
  });
});
