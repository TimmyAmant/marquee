import { ERROR_REFERENCE } from "@/lib/help/error-reference";

export const metadata = { title: "Error reference — Marquee" };

export default function ErrorReferencePage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-display text-3xl text-text-primary">Error reference</h1>
      <p className="mt-2 text-sm text-text-secondary">
        What every error message in Marquee actually means, and what to do about it. If the exact
        wording you saw isn&apos;t below, it&apos;s most likely a message passed straight through
        from Sonarr, Radarr, Plex, or Jellyfin themselves — check that service&apos;s own logs.
      </p>

      <div className="mt-10 flex flex-col gap-10">
        {ERROR_REFERENCE.map((category) => (
          <div key={category.title}>
            <h2 className="font-display text-xl text-text-primary">{category.title}</h2>
            <div className="mt-4 flex flex-col gap-3">
              {category.entries.map((entry) => (
                <div
                  key={entry.message}
                  className="rounded-2xl border border-border bg-bg-1 p-4"
                >
                  <p className="font-mono text-sm text-red-400">&ldquo;{entry.message}&rdquo;</p>
                  <p className="mt-2 text-sm text-text-primary">{entry.meaning}</p>
                  <p className="mt-1.5 text-sm text-text-secondary">
                    <span className="text-text-muted">What to do: </span>
                    {entry.whatToDo}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
