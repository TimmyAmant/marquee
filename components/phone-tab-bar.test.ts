import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The badge polls through a server action; nothing to reach in a test.
vi.mock("@/lib/requests/actions", () => ({ getPendingRequestCountAction: () => Promise.resolve(0) }));

const { PhoneTabBar } = await import("@/components/phone-tab-bar");
const { I18nProvider } = await import("@/lib/i18n/client");
const { messagesFor } = await import("@/lib/i18n/catalog");

type Props = Parameters<typeof PhoneTabBar>[0];

const MEMBER: Props = {
  pathname: "/discover",
  isSignedIn: true,
  showRequestsBadge: false,
  pendingRequestCount: 0,
  userLabel: "Sam",
  avatarSrc: null,
  serverLabel: "marquee.local",
  serverVersion: "0.57.1",
};

function render(overrides: Partial<Props> = {}): string {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      // children goes as createElement's third argument.
      { locale: "en", messages: messagesFor("en") } as Parameters<typeof I18nProvider>[0],
      createElement(PhoneTabBar, { ...MEMBER, ...overrides }),
    ),
  );
}

/** The bar's <nav>, apart from the More sheet rendered beside it. */
function bar(html: string): string {
  return html.slice(html.indexOf('<nav aria-label="Main"'));
}

/** The tabs' labels, in order. */
function tabLabels(html: string): string[] {
  return [...bar(html).matchAll(/<span class="max-w-full truncate">([^<]*)<\/span>/g)].map((m) => m[1]);
}

/** The label of the tab marked aria-current="page", if any. */
function currentTab(html: string): string | null {
  const match = bar(html).match(/aria-current="page"[^>]*>(?:(?!<\/a>|<\/button>).)*?<span class="max-w-full truncate">([^<]*)</);
  return match?.[1] ?? null;
}

describe("PhoneTabBar", () => {
  it("shows the five tabs, in the app's order, as a labelled nav", () => {
    const html = render();
    expect(html).toContain('<nav aria-label="Main"');
    expect(tabLabels(html)).toEqual(["Discover", "Search", "Requests", "Calendar", "More"]);
    expect(bar(html)).toContain('href="/search"');
  });

  it("renders nothing signed out, or on the sign-in page", () => {
    expect(render({ isSignedIn: false })).toBe("");
    expect(render({ pathname: "/login" })).toBe("");
  });

  it("lists the other sections, Settings and the help pages under More", () => {
    const html = render();
    const sheet = html.slice(html.indexOf('id="phone-more-sheet"'), html.indexOf('<nav aria-label="Main"'));
    for (const href of ["/movies", "/series", "/library", "/favorites", "/settings", "/changelog", "/help/errors"]) {
      expect(sheet).toContain(`href="${href}"`);
    }
    expect(sheet).toContain("Sam");
    expect(sheet).toContain("marquee.local");
    // Closed until More is tapped.
    expect(sheet).toContain("inert");
  });

  it("marks the page's tab current", () => {
    expect(currentTab(render({ pathname: "/discover" }))).toBe("Discover");
    expect(currentTab(render({ pathname: "/requests" }))).toBe("Requests");
    expect(currentTab(render({ pathname: "/calendar" }))).toBe("Calendar");
    expect(currentTab(render({ pathname: "/movies" }))).toBe("More");
    expect(currentTab(render({ pathname: "/title/movie/603" }))).toBeNull();
  });

  it("marks the current row in More", () => {
    const html = render({ pathname: "/favorites" });
    expect(html).toMatch(/<a aria-current="page"[^>]*href="\/favorites"/);
    expect(html).not.toMatch(/<a aria-current="page"[^>]*href="\/movies"/);
  });

  it("badges Requests with the pending count for reviewers only", () => {
    const reviewer = bar(render({ showRequestsBadge: true, pendingRequestCount: 3 }));
    expect(reviewer).toMatch(/bg-accent[^>]*>3<\/span>/);
    const member = bar(render({ showRequestsBadge: false, pendingRequestCount: 3 }));
    expect(member).not.toMatch(/bg-accent[^>]*>3<\/span>/);
    const nothingWaiting = bar(render({ showRequestsBadge: true, pendingRequestCount: 0 }));
    expect(nothingWaiting).not.toMatch(/bg-accent[^>]*>\d+<\/span>/);
  });

  it("keeps every tab a 44px-plus touch target", () => {
    const html = bar(render());
    expect(html.match(/min-h-\[52px\]/g)?.length).toBe(5);
  });
});
