/** The mockup's uppercase micro-label — "LOCATION", "CURRENTLY STREAMING ON".
 * Its own module so the client-side file-details card and the server-rendered
 * title hero can both use it without importing each other. */
export function CapsLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-muted">
      {children}
    </p>
  );
}
