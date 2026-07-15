import Link from "next/link";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">Account</h1>
      <div className="mt-8 flex flex-col gap-8 sm:flex-row">
        <nav className="flex shrink-0 gap-2 sm:w-44 sm:flex-col">
          <Link
            href="/settings"
            className="rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-1 hover:text-text-primary"
          >
            Account
          </Link>
          <Link
            href="/settings/integrations"
            className="rounded-lg px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-1 hover:text-text-primary"
          >
            Integrations
          </Link>
        </nav>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
