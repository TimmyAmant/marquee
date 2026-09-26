import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// Nothing a person reads is left in English in the website's pages and
// components: every piece of text there goes through t() (lib/i18n). This
// looks for what slips through — text written straight into JSX, and
// string literals in the attributes people read (placeholder, title, alt,
// aria-label) — in every .tsx file under app/ and components/.
//
// Not everything with letters is prose: brand and product names stay as
// they are in every language (docs/i18n-glossary.md), and so do symbols
// and units. A line that genuinely needs to stay as written (a code
// sample, say) can say so with an `i18n-ignore` comment on it or the line
// above it; a whole file with `i18n-ignore-file` at the top.

const ROOT = path.resolve(__dirname, "../..");
const DIRECTORIES = ["app", "components"];

/** Names that are never translated. Text made only of these (and
 * punctuation, numbers, symbols) passes. */
const BRAND_WORDS = new Set(
  [
    "Marquee",
    "Plex",
    "Jellyfin",
    "Emby",
    "Sonarr",
    "Radarr",
    "TMDb",
    "TheTVDB",
    "TVDB",
    "IMDb",
    "Trakt",
    "Discord",
    "Telegram",
    "Pushover",
    "ntfy",
    "Gotify",
    "Slack",
    "Unraid",
    "GitHub",
    "OpenAPI",
    "API",
    "URL",
    "JSON",
    "OIDC",
    "SSO",
    "HDR",
    "HDR10",
    "SDR",
    "DV",
    "4K",
    "HD",
    "UHD",
    "Web",
    "Push",
    "Homarr",
    "Organizr",
    "Homepage",
    "macOS",
    "Windows",
    "Mac",
    "iOS",
    "Android",
    "Tautulli",
    "Seerr",
    "Overseerr",
    "Jellyseerr",
    "Watchlist",
  ].map((word) => word.toLowerCase()),
);

/** Attributes whose value is read by people (or screen readers). */
const READ_ATTRIBUTES = new Set(["placeholder", "title", "alt", "aria-label", "aria-description", "aria-valuetext", "label"]);

function tsxFiles(directory: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) {
      out.push(...tsxFiles(full));
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** Looks like words someone reads: letters, and not just brand names. */
function isProse(text: string): boolean {
  const words = text.match(/[\p{L}][\p{L}'’.-]*/gu) ?? [];
  const real = words.filter((word) => {
    const bare = word.replace(/[.'’-]+$/, "").toLowerCase();
    return bare.length > 1 && !BRAND_WORDS.has(bare);
  });
  return real.length > 0;
}

type Finding = { file: string; line: number; text: string };

function findHardcoded(file: string): Finding[] {
  const source = readFileSync(file, "utf8");
  if (source.includes("i18n-ignore-file")) return [];
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lines = source.split("\n");
  const findings: Finding[] = [];

  function ignored(node: ts.Node): boolean {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
    return lines[line]?.includes("i18n-ignore") || (line > 0 && lines[line - 1]?.includes("i18n-ignore"));
  }

  function report(node: ts.Node, text: string) {
    if (!isProse(text) || ignored(node)) return;
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    findings.push({ file: path.relative(ROOT, file), line, text: text.trim().replace(/\s+/g, " ").slice(0, 80) });
  }

  /** String literals an expression can evaluate to directly: `"a"`,
   * `x ? "a" : "b"`, `x || "a"`, `` `a ${b}` `` — not arguments to calls. */
  function checkExpression(node: ts.Expression | undefined) {
    if (!node) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      report(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      report(node, [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" "));
    } else if (ts.isParenthesizedExpression(node)) {
      checkExpression(node.expression);
    } else if (ts.isConditionalExpression(node)) {
      checkExpression(node.whenTrue);
      checkExpression(node.whenFalse);
    } else if (ts.isBinaryExpression(node)) {
      const kind = node.operatorToken.kind;
      if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken || kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        checkExpression(node.right);
        if (kind !== ts.SyntaxKind.AmpersandAmpersandToken) checkExpression(node.left);
      } else if (kind === ts.SyntaxKind.PlusToken) {
        checkExpression(node.left);
        checkExpression(node.right);
      }
    }
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      report(node, node.text);
    } else if (ts.isJsxExpression(node) && node.parent && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      checkExpression(node.expression);
    } else if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (READ_ATTRIBUTES.has(name) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) report(node.initializer, node.initializer.text);
        else if (ts.isJsxExpression(node.initializer)) checkExpression(node.initializer.expression);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return findings;
}

describe("hard-coded text in the website", () => {
  const files = DIRECTORIES.flatMap((directory) => tsxFiles(path.join(ROOT, directory)));

  it("finds the pages and components", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("has none: every string people read goes through t()", () => {
    const findings = files.flatMap(findHardcoded);
    const report = findings.map((finding) => `${finding.file}:${finding.line}  ${finding.text}`);
    expect(report).toEqual([]);
  });
});

describe("the checker itself", () => {
  it("counts prose, not brands, symbols or numbers", () => {
    expect(isProse("Request")).toBe(true);
    expect(isProse("Open in Plex")).toBe(true);
    expect(isProse("Plex")).toBe(false);
    expect(isProse("Sonarr / Radarr")).toBe(false);
    expect(isProse(" · ")).toBe(false);
    expect(isProse("4K")).toBe(false);
    expect(isProse("×")).toBe(false);
    expect(isProse("(")).toBe(false);
  });
});
