import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { cookies } from "next/headers";
import Script from "next/script";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { ThemeSync } from "@/components/theme-sync";
import { parseRailPosition, RAIL_COOKIE } from "@/lib/rail-position";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Marquee",
  description:
    "Search any actor, studio, or catalog — see the full story, and know instantly what's already in your library.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Which edge the nav rail sits on, this device's choice (Settings ›
  // Account › Appearance). Rendered here so the first paint already has it;
  // the rail and everything that makes room for it follow data-rail in CSS.
  const railPosition = parseRailPosition((await cookies()).get(RAIL_COOKIE)?.value);

  return (
    // The theme-init script below sets data-theme on <html> before React
    // hydrates, so the attribute never matches the server's HTML by design.
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}
      data-rail={railPosition}
      suppressHydrationWarning
    >
      <body className="min-h-full flex bg-bg-0 text-text-primary">
        {/* Sets data-theme before first paint so there's no flash of the
            wrong theme. Plain <script dangerouslySetInnerHTML> only
            executes when the browser's own HTML parser encounters it in the
            initial response — React re-renders (including client-side
            navigations) create DOM nodes via innerHTML/createElement
            instead, which per spec does NOT auto-execute scripts, silently
            breaking this on every navigation after the first. next/script's
            beforeInteractive strategy is Next's own supported mechanism for
            exactly this, guaranteeing it actually runs pre-hydration on
            every load, not just the first. */}
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeSync />
        <Sidebar />
        {/* .rail-inset (app/globals.css) makes room for the floating nav
            rail on whichever edge it sits; full-bleed artwork like a
            title's backdrop pulls itself back under it (.rail-under). */}
        <div className="rail-inset flex min-h-full min-w-0 flex-1 flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
