import type { Translator } from "@/lib/i18n/translator";

/** "Chrome on macOS", "Safari on iPhone": enough for Settings to tell a
 * household's devices apart, from the browser's own User-Agent. Stored as
 * it is (in English); localizeDeviceLabel words it for the reader. */
export function deviceLabel(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Windows/.test(ua)
            ? "Windows"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os;
}

/** A stored deviceLabel in the reader's language: "Chrome on macOS" →
 * "Chrome sur macOS". Browser and system names are never translated; a
 * label of any other shape is shown as it is. */
export function localizeDeviceLabel(t: Translator, label: string): string {
  const match = /^(\S+) on (\S+)$/.exec(label);
  return match ? t("settings.deviceBrowserOnOs", { browser: match[1], os: match[2] }) : label;
}
