/**
 * Discover's inline edit mode (components/discover-edit-mode.tsx, the admin
 * only): the rows in a working order, each shown or hidden, saved in one go
 * through the same call as Settings › Discover (saveDiscoverLayout).
 */
export type EditableShelf = { id: string; title: string; hidden: boolean };

export function toggleShelfHidden(order: readonly EditableShelf[], id: string): EditableShelf[] {
  return order.map((shelf) => (shelf.id === id ? { ...shelf, hidden: !shelf.hidden } : shelf));
}

/** Whether the working order differs from what's saved (Save is off
 * otherwise). */
export function layoutChanged(saved: readonly EditableShelf[], working: readonly EditableShelf[]): boolean {
  if (saved.length !== working.length) return true;
  return saved.some((shelf, i) => shelf.id !== working[i].id || shelf.hidden !== working[i].hidden);
}

/** What saveDiscoverLayout takes. */
export function layoutOrder(working: readonly EditableShelf[]): { id: string; hidden: boolean }[] {
  return working.map(({ id, hidden }) => ({ id, hidden }));
}
