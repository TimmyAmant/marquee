import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import Script from "next/script";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { ThemeSync } from "@/components/theme-sync";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable} h-full antialiased`}
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
        <div className="flex min-h-full min-w-0 flex-1 flex-col md:pl-60">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
