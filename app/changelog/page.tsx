import { CHANGELOG } from "@/lib/changelog";

export const metadata = { title: "Changelog — Marquee" };

export default function ChangelogPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">Changelog</h1>
      <p className="mt-2 text-sm text-text-secondary">What&apos;s changed, release by release.</p>

      <div className="mt-8 flex flex-col gap-8">
        {CHANGELOG.map((entry) => (
          <div key={entry.version} className="rounded-2xl border border-border bg-bg-1 p-6">
            <div className="flex items-baseline gap-3">
              <h2 className="font-display text-xl text-text-primary">v{entry.version}</h2>
              <span className="text-xs text-text-muted">{entry.date}</span>
            </div>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm text-text-secondary">
              {entry.changes.map((change, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-text-muted">–</span>
                  <span>{change}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
