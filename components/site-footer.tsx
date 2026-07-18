import Link from "next/link";

const REPO_URL = "https://github.com/TimmyAmant/marquee";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-text-muted sm:px-6 lg:px-8">
        <span>Marquee — self-hosted media dashboard</span>
        <div className="flex items-center gap-5">
          <Link href="/help/errors" className="transition-colors hover:text-text-primary">
            Error reference
          </Link>
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-text-primary"
          >
            GitHub
          </a>
          <a
            href={`${REPO_URL}/issues`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-text-primary"
          >
            Support
          </a>
        </div>
      </div>
    </footer>
  );
}
