/** The fixed 156px-wide slot every shelf card sits in, matching the design
 * mockup's card width. Scrolling and the prev/next arrows live in Shelf
 * (components/shelf.tsx), which every row now uses for its head. */
export function PosterRowItem({ children }: { children: React.ReactNode }) {
  return <div className="w-[156px] shrink-0">{children}</div>;
}
