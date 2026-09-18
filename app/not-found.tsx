import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3 px-4 py-16 sm:pl-7 sm:pr-7">
      <h1 className="font-display text-2xl text-text-primary">Nothing here</h1>
      <p className="max-w-lg text-sm text-text-secondary">
        That page doesn&apos;t exist — the link may be wrong, or TMDb no longer has this title.
      </p>
      <Link
        href="/discover"
        className="mt-1 rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
      >
        Back to Discover
      </Link>
    </div>
  );
}
