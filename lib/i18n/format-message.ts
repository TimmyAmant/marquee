/**
 * Fills in a translated message. A small, dependency-free subset of ICU
 * MessageFormat — the syntax Weblate, Crowdin and the like already know:
 *
 *   {name}                                   a value
 *   {count, plural, one {# title} other {# titles}}
 *                                            by the language's plural rules;
 *                                            =0, =1 … match exact numbers,
 *                                            # is the count, formatted
 *   {kind, select, movie {…} tv {…} other {…}}
 *                                            by a value, `other` if nothing
 *                                            else matches
 *
 * Branches can hold their own placeholders. A value that's missing is left
 * as written ({name}), so a mistake shows instead of vanishing. Literal
 * braces aren't supported — no message needs one.
 */

export type MessageValues = Record<string, string | number | null | undefined>;

type Branches = Map<string, string>;

/** The text between the brace at `open` and its partner, or null. */
function matching(text: string, open: number): number | null {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    const char = text[index];
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return index;
    }
  }
  return null;
}

/** "one {# title} other {# titles}" → one → "# title", other → "# titles". */
function parseBranches(text: string): Branches | null {
  const branches: Branches = new Map();
  let index = 0;
  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index])) index++;
    if (index >= text.length) break;
    const open = text.indexOf("{", index);
    if (open < 0) return null;
    const key = text.slice(index, open).trim();
    const close = matching(text, open);
    if (!key || close === null) return null;
    branches.set(key, text.slice(open + 1, close));
    index = close + 1;
  }
  return branches;
}

const pluralRulesCache = new Map<string, Intl.PluralRules>();
const numberFormatCache = new Map<string, Intl.NumberFormat>();

function pluralCategory(tag: string, count: number): string {
  let rules = pluralRulesCache.get(tag);
  if (!rules) {
    rules = new Intl.PluralRules(tag);
    pluralRulesCache.set(tag, rules);
  }
  return rules.select(count);
}

function formatNumber(tag: string, value: number): string {
  let format = numberFormatCache.get(tag);
  if (!format) {
    format = new Intl.NumberFormat(tag);
    numberFormatCache.set(tag, format);
  }
  return format.format(value);
}

function formatArgument(inner: string, values: MessageValues, tag: string): string | null {
  const parts = inner.split(",");
  const name = parts[0].trim();
  if (parts.length === 1) {
    const value = values[name];
    if (value === undefined || value === null) return null;
    return typeof value === "number" ? formatNumber(tag, value) : value;
  }
  const kind = parts[1].trim();
  const rest = parts.slice(2).join(",");
  const branches = parseBranches(rest);
  if (!branches) return null;
  const value = values[name];
  if (kind === "plural") {
    const count = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(count)) return null;
    const branch = branches.get(`=${count}`) ?? branches.get(pluralCategory(tag, count)) ?? branches.get("other");
    if (branch === undefined) return null;
    // # is this plural's count; a nested plural's # is its own, so only the
    // top level of the branch is replaced.
    return formatMessage(replaceHash(branch, formatNumber(tag, count)), values, tag);
  }
  if (kind === "select") {
    const branch = branches.get(String(value ?? "")) ?? branches.get("other");
    return branch === undefined ? null : formatMessage(branch, values, tag);
  }
  return null;
}

/** Replaces # outside any nested braces. */
function replaceHash(text: string, count: string): string {
  let depth = 0;
  let out = "";
  for (const char of text) {
    if (char === "{") depth++;
    if (char === "}") depth--;
    out += char === "#" && depth === 0 ? count : char;
  }
  return out;
}

/** `tag` is the Intl language tag numbers and plural rules follow. */
export function formatMessage(message: string, values: MessageValues | undefined, tag: string): string {
  if (!message.includes("{")) return message;
  let out = "";
  let index = 0;
  while (index < message.length) {
    const open = message.indexOf("{", index);
    if (open < 0) {
      out += message.slice(index);
      break;
    }
    out += message.slice(index, open);
    const close = matching(message, open);
    if (close === null) {
      out += message.slice(open);
      break;
    }
    const whole = message.slice(open, close + 1);
    const formatted = formatArgument(message.slice(open + 1, close), values ?? {}, tag);
    out += formatted ?? whole;
    index = close + 1;
  }
  return out;
}

/** The placeholder and argument names a message uses, for the tests that
 * check every translation keeps the English message's placeholders. */
export function placeholderNames(message: string): string[] {
  const names = new Set<string>();
  let index = 0;
  while (index < message.length) {
    const open = message.indexOf("{", index);
    if (open < 0) break;
    const close = matching(message, open);
    if (close === null) break;
    const inner = message.slice(open + 1, close);
    const parts = inner.split(",");
    names.add(parts[0].trim());
    if (parts.length > 2) {
      const branches = parseBranches(parts.slice(2).join(","));
      for (const branch of branches?.values() ?? []) {
        for (const name of placeholderNames(branch)) names.add(name);
      }
    }
    index = close + 1;
  }
  return [...names].sort();
}

/** The rich-text tag names (<link>…</link>) a message uses. */
export function tagNames(message: string): string[] {
  return [...new Set([...message.matchAll(/<([a-zA-Z][\w-]*)>/g)].map((match) => match[1]))].sort();
}
