import Link from "next/link";
import packageJson from "@/package.json";
import { getT } from "@/lib/i18n/server";

const REPO_URL = "https://github.com/TimmyAmant/marquee";

export async function SiteFooter() {
  const t = await getT();
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-text-muted sm:px-6 lg:px-8">
        <span>{t("nav.footerTagline")}</span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/changelog" className="transition-colors hover:text-text-primary">
            v{packageJson.version}
          </Link>
          <Link href="/help/colors" className="transition-colors hover:text-text-primary">
            {t("nav.colors")}
          </Link>
          <Link href="/help/errors" className="transition-colors hover:text-text-primary">
            {t("nav.errorReference")}
          </Link>
          <a
            href={`${REPO_URL}/blob/main/docs/features.md`}
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-text-primary"
          >
            {t("nav.allFeatures")}
          </a>
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
            {t("nav.support")}
          </a>
        </div>
      </div>
    </footer>
  );
}
