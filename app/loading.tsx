/** Shown while a page's server render waits on TMDb or the database — most
 * pages here do, so without it a click looked like nothing had happened. A
 * neutral poster-grid skeleton fits nearly every page closely enough. */
export default function Loading() {
  return (
    <div className="px-4 py-6 sm:pl-7 sm:pr-7 sm:py-7" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="mb-6 h-7 w-48 animate-pulse rounded-md bg-bg-2" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(136px,1fr))] gap-x-5 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))]">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i}>
            <div className="aspect-[2/3] animate-pulse rounded-lg bg-bg-2" />
            <div className="mt-2 h-3.5 w-3/4 animate-pulse rounded bg-bg-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
