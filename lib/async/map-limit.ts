/** Like `Promise.all(items.map(fn))`, but never runs more than `limit` calls
 * at once — for fan-outs against a user's own server (Plex, Sonarr), where a
 * thousand simultaneous requests would hammer a home box for no gain.
 * Results keep the input order. */
export async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
  return results;
}
