import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { StatusColorList } from "@/components/status-legend";
import { LIBRARY_STATUSES, statusColorsNote } from "@/lib/library/status-tone";
import { getT } from "@/lib/i18n/server";
import { rich } from "@/lib/i18n/rich";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("help.colorsMetaTitle") };
}

/** The color key, for good: every library status with its color, name and
 * meaning — the same list the "Color key" pill beside each poster grid
 * opens (components/status-legend.tsx). */
export default async function StatusColorsHelpPage() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">{t("help.colorsTitle")}</h1>
      <p className="mt-2 text-sm text-text-secondary">
        {t("help.colorsIntro", { note: statusColorsNote(t) })}
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-bg-1 p-5">
        <StatusColorList size="md" />
      </div>

      <h2 className="mt-10 font-display text-xl text-text-primary">{t("help.badgesTitle")}</h2>
      <p className="mt-2 text-sm text-text-secondary">{t("help.badgesBody")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {LIBRARY_STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </div>

      <p className="mt-10 text-sm text-text-secondary">
        {rich(t("help.colorsRequestsNote"), {
          link: (chunks) => (
            <Link href="/help/errors" className="text-accent hover:underline">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </div>
  );
}
