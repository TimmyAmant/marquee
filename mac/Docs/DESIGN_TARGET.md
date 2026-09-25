# Design target: the mockup, on both the Mac app and the website

`Design/Mockups/mockup.html` (in the MarqueeMac repo) is the source of truth,
rendered as `discover.png` and `title.png`. Both platforms must match it and
therefore each other. Values below are taken from that file; when anything is
unclear, read the CSS there rather than guessing.

Reference frame: a 1440×900 window, 52px top bar and the floating navigation
rail (see Navigation below), which leaves a 72px left margin, so the content
area is 1368×848. (The mockup predates the rail and was drawn with a 230px
sidebar; its content-area coordinates still apply unchanged.) Every coordinate below is relative to the content area's
top-left corner (below the top bar). The content is **left-aligned** with a
48px gutter on the title page and 28px on shelf pages — not centered — so the
two platforms agree at any window width.

Palette and type are already shared: bg0 #0a0a0c, bg1 #131217, bg2 #1c1b22,
bg3 #26242e, border #2c2a35, borderStrong #3a3745, text #f3f1ea / #a8a4b3 /
#6f6c7d, accent #e0a63e, owned #4caf7d on #14251c, tracked #4f8fd1 on #10202f.
Serif = New York (web: the existing `font-display`), sans = SF Pro Text,
mono = SF Mono.

## Navigation (all three platforms)

After the Plex app's Apple TV menu. There is no fixed sidebar column: a small
frosted **rail** floats over the page, and it opens into a frosted **menu
panel** over the content. The web's `components/nav-menu.tsx` is the
reference implementation.

- **Rail**: pinned 16 from the window's left edge, vertically centered in the
  content area. A capsule (radius 30, padding 7) of frosted glass, items
  stacked with 4 gaps:
  1. Profile avatar, 36 round: initials (up to two, uppercased) in bg0 on a
     140° gradient accentHover → accent (45%) → #c2583a, with a 2px
     white-15% ring. Opens Settings (the account).
  2. Search, 40×40 round, magnifier icon (19).
  3. Discover, compass icon.
  4. Only when the current page is another section (Movies, Series,
     Favorites, Calendar, Requests): that section's icon, so the rail always
     shows where you are.
  5. Menu button, three-line icon: opens the panel.
  The current item is a solid pill: textPrimary fill with bg0 icon (white
  with a dark icon in dark mode, the reverse in light). Others are
  textSecondary, with a textPrimary-10% round hover. An admin with pending
  requests gets an 8px accent dot on the Requests icon.
- **Opening**: resting the pointer on the rail for 220ms, clicking the menu
  button, or (narrow windows/phones) the header's menu button. It closes
  when the pointer has been off the panel for 260ms, on Escape, on a click
  outside, and after any navigation. Opening with a click or the keyboard
  moves focus to the current item; opening on hover doesn't move focus.
  Rail fades out (200ms) as the panel fades and slides in from 12 to the
  left, scale 0.98 → 1, 200ms ease-out.
- **Panel**: 288 wide, inset 12 from the top, bottom and left of the window,
  radius 24, frosted glass, overlaying the content (nothing reflows).
  - Profile row: 38 avatar, name 15/600 over the server address 11.5 muted,
    a chevron at the right. Pill hover. Opens Settings.
  - Search and Discover: rows 44 high, 16/600, 20 icons, 14 gap.
  - Section header "Browse", then Movies and Series; section header
    "Library", then Favorites, Calendar and Requests (with the pending-count
    badge). Section rows are 40 high, 15/500, 19 icons. A section header is
    11.5/600 muted text followed by a 1px hairline in the glass border color
    running to the right edge, 16 above, 6 below.
  - Rows are fully rounded pills, 14 horizontal padding. Current row: solid
    textPrimary fill, bg0 text and icon, shadow 0 6 18 black 25%. Hover:
    textPrimary 10%.
  - Footer, separated by a hairline: the Marquee wordmark (17 serif) and the
    light/dark toggle.
- **Glass**: dark: fill rgb(30 29 37 / .68), 1px border white 9%, shadow
  0 24 64 black 50%. Light: fill white 74%, border rgb(33 31 26 / .10),
  shadow 0 20 50 rgb(60 45 20 / .16). Background blur 28 with saturation
  1.6. Use the platform's own material where it looks the same (NSVisualEffect
  / `.ultraThinMaterial` on the Mac, Acrylic on Windows), tinted to these fills.
- **Content**: starts 72 from the window's left edge; full-bleed artwork (the
  title page's backdrop) runs under the rail to the edge.

## Title page

- **Backdrop**: full-bleed behind the top of the page, film grain over it, a
  gradient fading to bg0 at the bottom. Nothing but the poster and the title
  sits on the artwork — no metadata text over it.
- **Poster**: 224×336, radius 12, 1px borderStrong ring, large shadow. Left 48,
  top 170.
- **Main column**: left 304, top 246, width 546.
  - Title: serif 48/54, weight 700, tracking −0.015em, shadow `0 2px 20px rgba(0,0,0,.4)`.
  - Meta line: 14px secondary text, items joined with 14px gaps: runtime ·
    genres · year, then the Favorite pill (height 26, radius 13, 12px).
  - Action row: the library badge (height 32, radius 16, owned green on ownBg,
    8px dot, 13px semibold) then action pills (height 32, radius 16, 13px):
    Search now, Stop monitoring, Fix ID.
  - "Overview": serif 18/24, 26px above it; body 14/22 secondary, 6px below the
    heading.
  - Credits: 3 equal columns, gap 16, 20px above. Name 13.5/18 semibold, role
    12/16 muted.
  - Keywords: chips height 22, radius 11, 11px secondary, 1px border, 6px gaps.
    **One row only, never wrapping** — drop the overflow rather than stacking
    rows (the mockup shows 7).
  - Links: pills height 30, radius 15, 12.5px — Trailer, IMDb, then whichever of
    Instagram / X (Twitter) / Facebook / homepage the title actually has.
- **Right rail**: left 882, width 288, top 246.
  - **Facts card**: bg rgba(19,18,23,.94), 1px border, radius 16, padding
    4/18/16, shadow `0 18px 40px rgba(0,0,0,.35)`, 20px backdrop blur.
    - Rating row, height 50: ★ + serif 22 accent bold on the left, 11px muted
      "TMDb user score" on the right.
    - Fact rows, height 38 each, 1px top border (none on the first), 12.5px:
      label secondary left, value primary 500 right. Status, Release Date (or
      Next Episode), Original Language, Production Country (flag + name).
    - Streaming block: 1px top border, 14px padding above, caps label
      10.5px/600/0.08em muted "CURRENTLY STREAMING ON", then 36×36 radius-9
      white logo tiles, 8px gaps, 10px below the label.
  - **File details card** (only when the title is in the library): 16px below
    the facts card, bg bg1, 1px border, radius 16, padding 15/18/18.
    - Heading: serif 16/22, "File details", 12px below.
    - LOCATION: caps label, then a field of height 32, radius 8, bg0, 1px
      border, mono 11 truncated path, and a Copy button (height 24, radius 6,
      bg3, borderStrong, 11px semibold).
    - Then a **2-column grid**, gap 12×14, 14px below the path: label 11px muted
      over value 13px/500. Pairs, in order, skipping whatever the server
      doesn't provide: Size / Runtime, Added / Resolution, Quality profile /
      Video, Dynamic range / Audio.
- **Cast**: left 48, width 802, 706 from the top. A **horizontal carousel**, not
  a grid and not a "show more" link: shelf heading serif 20 with a 20px
  see-all circle, 28px round arrows at the right end, then cards 112 wide —
  portrait 112×124 radius 12, name 12.5/500 truncated, character 11px muted
  truncated.

## Shelf pages (Discover, Movies, Series, search, person, studio)

- Page padding: 28 top and bottom, 28 left, 0 right so cards bleed off the right
  edge.
- Shelf head: height 28, serif 20/600 title, 20px see-all circle beside it,
  28px round prev/next arrows at the right (28px right padding), 12px below.
- **Poster card**: art 156×234, radius 8, 1px border. Type badge top-left (9px
  bold, 0.05em, radius 4, 3px/5px padding). Status pill top-right (height 17,
  radius 9, 10px semibold, 5px dot). Below the art: title 13/17 primary
  truncated, then a row with year 11.5 muted and the favorite star at the right.
- **Hover overlay** on a card: overview 11/15 clamped to 5 lines, then an accent
  "Add to Radarr/Sonarr" button, height 26, radius 13, 11.5px semibold.
- **Genre cards**: 288×160, radius 12, serif 34/800 white centered over the
  artwork.
- Shelves scroll horizontally, one row, cards flush left.

## What to check when you're done

Render both platforms at 1440×900, open `Design/Mockups/title.png` and
`discover.png` beside them, and compare: column positions, card sizes, type
sizes, and the order of every block. Differences that come from real data
(fewer streaming logos, no file card when a title isn't in the library) are
fine; layout differences are not.
