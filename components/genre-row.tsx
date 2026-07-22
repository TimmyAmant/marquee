import Link from "next/link";

export function GenreRow({
  title,
  genres,
  basePath,
}: {
  title: string;
  genres: { id: number; name: string }[];
  basePath: string;
}) {
  if (genres.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 font-display text-xl text-text-primary">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {genres.map((genre) => (
          <Link
            key={genre.id}
            href={`${basePath}?genre=${genre.id}`}
            className="rounded-full border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-accent hover:text-accent"
          >
            {genre.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
