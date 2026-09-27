import type { Metadata } from "next";
import { ChangelogList } from "@/components/changelog-list";
import { CHANGELOG } from "@/lib/changelog";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("nav.changelogMetaTitle") };
}

// The release notes themselves are written in English only; the page
// around them follows the reader's language.
export default async function ChangelogPage() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">{t("nav.releasesTitle")}</h1>
      <p className="mt-2 text-sm text-text-secondary">{t("nav.releasesIntro")}</p>

      <div className="mt-8">
        <ChangelogList entries={CHANGELOG} />
      </div>
    </div>
  );
}
