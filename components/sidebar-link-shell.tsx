"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** The nav row itself, split out of Sidebar (a server component) purely so
 * the current page can carry the mockup's selected treatment: a bg-3 pill,
 * primary-colored label and an accent icon. */
export function SidebarLinkShell({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const current = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`group relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition-colors ${
        current
          ? "bg-bg-3 font-medium text-text-primary"
          : "text-text-secondary hover:bg-bg-3 hover:text-text-primary"
      }`}
    >
      {children}
    </Link>
  );
}
