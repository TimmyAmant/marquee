"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TAB_ICONS = {
  account: (
    <path
      d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4 20c1.5-4 5-6 8-6s6.5 2 8 6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  integrations: (
    <path
      d="M9 3v4M15 3v4M6 7h12l-1 5a5 5 0 0 1-10 0L6 7ZM12 16v5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  activity: (
    <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" strokeLinecap="round" strokeLinejoin="round" />
  ),
} as const;

function TabIcon({ name }: { name: keyof typeof TAB_ICONS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-[18px] w-[18px] shrink-0">
      {TAB_ICONS[name]}
    </svg>
  );
}

const ALL_TABS = [
  { href: "/settings", label: "Account", icon: "account" as const, adminOnly: false },
  { href: "/settings/integrations", label: "Integrations", icon: "integrations" as const, adminOnly: true },
  { href: "/settings/activity", label: "Activity", icon: "activity" as const, adminOnly: true },
];

/**
 * Owns the whole settings shell (title, tab nav, content slot) as one
 * client component since both the <h1> and the nav's active-state
 * highlighting depend on the same usePathname() read — splitting them
 * across the server layout would mean deriving "current tab" twice.
 * `children` is server-rendered content from SettingsLayout, passed
 * through a client boundary, which Next.js supports natively.
 */
export function SettingsNav({ isAdmin, children }: { isAdmin: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const tabs = ALL_TABS.filter((tab) => isAdmin || !tab.adminOnly);
  const activeTab = tabs.find((tab) => tab.href === pathname);

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">{activeTab?.label ?? "Account"}</h1>
      <div className="mt-8 flex flex-col gap-8 sm:flex-row">
        <nav className="flex shrink-0 gap-2 sm:w-44 sm:flex-col">
          {tabs.map((tab) => {
            const active = tab.href === pathname;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-bg-2 text-text-primary"
                    : "text-text-secondary hover:bg-bg-1 hover:text-text-primary"
                }`}
              >
                <TabIcon name={tab.icon} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
