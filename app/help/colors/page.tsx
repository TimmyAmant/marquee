import Link from "next/link";
import { StatusBadge } from "@/components/status-badge";
import { StatusColorList } from "@/components/status-legend";
import { LIBRARY_STATUSES, STATUS_COLORS_NOTE } from "@/lib/library/status-tone";

export const metadata = { title: "What the colors mean — Marquee" };

/** The color key, for good: every library status with its color, name and
 * meaning — the same list the "Color key" pill beside each poster grid
 * opens (components/status-legend.tsx). */
export default function StatusColorsHelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">What the colors mean</h1>
      <p className="mt-2 text-sm text-text-secondary">
        Posters carry a thin colored strip along their bottom edge and a small badge in the corner
        that say where each title stands in your library. {STATUS_COLORS_NOTE} Titles that
        aren&apos;t in your library get no strip at all.
      </p>

      <div className="mt-8 rounded-2xl border border-border bg-bg-1 p-5">
        <StatusColorList size="md" />
      </div>

      <h2 className="mt-10 font-display text-xl text-text-primary">The badges</h2>
      <p className="mt-2 text-sm text-text-secondary">
        The same colors appear on the badge on a poster, on a title&apos;s own page and next to
        search suggestions.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {LIBRARY_STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </div>

      <p className="mt-10 text-sm text-text-secondary">
        On the Requests page, &ldquo;Can&apos;t find&rdquo; and &ldquo;Couldn&apos;t add&rdquo;
        use the Missing red too: the request was approved, but the title isn&apos;t there yet.
        Look up an error message in the{" "}
        <Link href="/help/errors" className="text-accent hover:underline">
          error reference
        </Link>
        .
      </p>
    </div>
  );
}
