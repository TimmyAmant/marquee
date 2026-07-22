import { ChangelogList } from "@/components/changelog-list";
import { CHANGELOG } from "@/lib/changelog";

export const metadata = { title: "Changelog — Marquee" };

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">Releases</h1>
      <p className="mt-2 text-sm text-text-secondary">What&apos;s changed, release by release.</p>

      <div className="mt-8">
        <ChangelogList entries={CHANGELOG} />
      </div>
    </div>
  );
}
