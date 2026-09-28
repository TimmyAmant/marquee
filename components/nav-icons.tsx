/**
 * The navigation's line icons, shared by the rail (components/nav-menu.tsx)
 * and the phone tab bar (components/phone-tab-bar.tsx): 24-unit strokes in
 * the current text color.
 */
export const NAV_ICONS = {
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" strokeLinecap="round" />
    </>
  ),
  discover: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5 4.5-1.9Z" strokeLinejoin="round" />
    </>
  ),
  movies: (
    <path
      d="M4 6h16v12H4V6ZM4 6l2.5 4M8 6l2.5 4M12 6l2.5 4M16 6l2.5 4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  series: (
    <path d="M4 5h16v11H4V5ZM9 20h6M4 16l3-3M20 16l-3-3" strokeLinecap="round" strokeLinejoin="round" />
  ),
  library: (
    <path
      d="M4 5.5A1.5 1.5 0 0 1 5.5 4h2A1.5 1.5 0 0 1 9 5.5v13A1.5 1.5 0 0 1 7.5 20h-2A1.5 1.5 0 0 1 4 18.5v-13ZM10.5 5.5A1.5 1.5 0 0 1 12 4h2a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 14 20h-2a1.5 1.5 0 0 1-1.5-1.5v-13ZM16.6 7.2l1.9-.5a1.5 1.5 0 0 1 1.8 1.1l2.6 10a1.5 1.5 0 0 1-1.1 1.8l-1.9.5a1.5 1.5 0 0 1-1.8-1.1l-2.6-10a1.5 1.5 0 0 1 1.1-1.8Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  favorites: (
    <path
      d="m12 19-7-6.1C2.5 10.5 3 6.5 6.5 5.5c2-.6 3.8.2 5.5 2.3 1.7-2.1 3.5-2.9 5.5-2.3 3.5 1 4 5 1.5 7.4L12 19Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  calendar: (
    <path
      d="M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM4 10h16M8 3v4M16 3v4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  requests: (
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeLinecap="round" strokeLinejoin="round" />
  ),
  person: (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 19.5c1.2-3.3 3.8-5 7-5s5.8 1.7 7 5" strokeLinecap="round" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />,
  more: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" strokeLinecap="round" strokeWidth="2.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="2.8" />
      <path
        d="M10.3 3.6a1.8 1.8 0 0 1 3.4 0l.3.9a1.8 1.8 0 0 0 2.5 1l.8-.4a1.8 1.8 0 0 1 2.4 2.4l-.4.8a1.8 1.8 0 0 0 1 2.5l.9.3a1.8 1.8 0 0 1 0 3.4l-.9.3a1.8 1.8 0 0 0-1 2.5l.4.8a1.8 1.8 0 0 1-2.4 2.4l-.8-.4a1.8 1.8 0 0 0-2.5 1l-.3.9a1.8 1.8 0 0 1-3.4 0l-.3-.9a1.8 1.8 0 0 0-2.5-1l-.8.4a1.8 1.8 0 0 1-2.4-2.4l.4-.8a1.8 1.8 0 0 0-1-2.5l-.9-.3a1.8 1.8 0 0 1 0-3.4l.9-.3a1.8 1.8 0 0 0 1-2.5l-.4-.8a1.8 1.8 0 0 1 2.4-2.4l.8.4a1.8 1.8 0 0 0 2.5-1l.3-.9Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  releases: (
    <path
      d="M12 3.5 13.9 9l5.6.1-4.5 3.4 1.6 5.5-4.6-3.3-4.6 3.3 1.6-5.5-4.5-3.4L10.1 9 12 3.5Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  errors: (
    <path
      d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM12 8v3.5M12 13.8h.01"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
} as const;

export type NavIconName = keyof typeof NAV_ICONS;

export function NavIcon({ name, className = "h-5 w-5" }: { name: NavIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden className={`shrink-0 ${className}`}>
      {NAV_ICONS[name]}
    </svg>
  );
}
