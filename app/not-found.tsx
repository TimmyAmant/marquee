import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-16 sm:pl-7 sm:pr-7">
      <h1 className="font-display text-2xl text-text-primary">{t("nav.notFoundTitle")}</h1>
      <p className="max-w-lg text-sm text-text-secondary">{t("nav.notFoundBody")}</p>
      <Link
        href="/discover"
        className="mt-1 rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
      >
        {t("nav.backToDiscover")}
      </Link>
    </div>
  );
}
