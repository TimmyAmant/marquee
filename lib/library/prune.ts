/** Which stored rows a finished sync no longer saw — the titles someone
 * deleted from their media server since the last run. Only call this after a
 * sync that listed the whole server successfully: a partial listing would
 * make everything it skipped look deleted. */
export function rowsMissingFromSync<Row extends { id: string; key: string }>(
  stored: readonly Row[],
  seenKeys: ReadonlySet<string>,
): string[] {
  return stored.filter((row) => !seenKeys.has(row.key)).map((row) => row.id);
}
