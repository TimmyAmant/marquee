import { MENU_ITEM, PILL_OUTLINE } from "@/components/pill-styles";
import { arrLinkNames, type ArrLink } from "@/lib/arr/links";
import { getT } from "@/lib/i18n/server";

// "Open in Radarr" / "Open in Sonarr" on a title page (lib/arr/links.ts):
// the title's own page in each server that has it, in a new tab. Pills in
// the action row from 640px; on a phone, where that row is already full,
// rows of the "…" menu instead (title-hero.tsx renders both, each hidden at
// the other width).

/** Radarr's yellow and Sonarr's blue, from their own logos. */
const BRAND: Record<ArrLink["kind"], string> = { radarr: "#FFC230", sonarr: "#35C5F4" };

function BrandDot({ kind }: { kind: ArrLink["kind"] }) {
  return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: BRAND[kind] }} />;
}

function OutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden className="h-3 w-3 shrink-0 opacity-70">
      <path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export async function OpenInArrLinks({ links, variant }: { links: ArrLink[]; variant: "pills" | "menu" }) {
  if (links.length === 0) return null;
  const t = await getT();
  const names = arrLinkNames(links);
  return links.map((link, i) => (
    <a
      key={link.url + i}
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="open-in-arr"
      title={link.url}
      className={variant === "pills" ? `${PILL_OUTLINE} hidden sm:inline-flex` : `${MENU_ITEM} sm:hidden`}
    >
      <BrandDot kind={link.kind} />
      {t("title.openIn", { name: names[i] })}
      <OutIcon />
    </a>
  ));
}
