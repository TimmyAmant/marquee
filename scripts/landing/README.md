# Landing page renders

Everything in `site/assets/img/` (plus `site/assets/og.jpg`) is rendered here:
the web title page, the same page without its rail (under the site's HTML
mocks of the rail and the menu), the Marquee for Mac window, the
request-ticket posters and the social card; only `mac-connect-560.webp`, the
Mac app's first-run screen, is a capture. The renders all show a made-up film,
**Emberline** (see
`lib/slate.mjs`); no real title, person or streaming service appears.

## Render

Once, to install the renderer (Playwright 1.58.2, using its cached Chromium):

```bash
npm install --prefix scripts/landing
npx --prefix scripts/landing playwright install chromium   # only if Chromium is missing
```

Then, from the repo root:

```bash
node scripts/landing/render.mjs
```

It takes about half a minute, overwrites the images in place, and ends with a
table of which art slots used a real file and which fell back to a placeholder.

## Artwork

Drop the generated art into `~/Desktop/Marquee Artwork/` (prompts in
`PROMPTS.md` there) and render again. Any `.png`, `.jpg` or `.webp` with
these names is picked up; anything missing is drawn by `lib/placeholders.mjs`:

| File | Used for |
|---|---|
| `emberline-backdrop` (16:9) | title page backdrop, web and Mac |
| `emberline-poster` (2:3) | title page poster |
| `paper-harbor-poster`, `holloway-poster` (2:3) | request tickets |
| `cast-1` … `cast-6` (2:3) | cast carousel, in slate order |

Keep the art text-free; `lib/lettering.mjs` letters each poster's title on.
A poster that already has its title in the art goes in as
`<name>-lettered.png` (e.g. `emberline-poster-lettered.png`) and is used as
is. Crop any billing block, festival laurels or logos off first — they tend
to name real people and brands.
Use `--art <dir>` (or `MARQUEE_ARTWORK_DIR`) for another folder and
`--out <dir>` to render somewhere other than the site.

## What's here

- `render.mjs` builds everything. It never talks to a Marquee server.
- `templates/web-title.html` is a snapshot of the real web app's title page,
  with the app's own CSS inlined and every field tagged for the slate.
- `templates/mac-title.html` is the Mac window, rebuilt from
  `mac/Design/Mockups/mockup.html` and matched against captures of the app,
  with the floating navigation rail from `mac/Docs/DESIGN_TARGET.md` ›
  Navigation (no sidebar; pages start 72pt in). It uses the Mac's system
  fonts (New York, SF Pro), so render on a Mac.
- `templates/og.html` is the 1200×630 social card.
- `lib/` holds the slate, the placeholders, the lettering, the template filler
  and the browser launcher.
- `snapshot-web.mjs` refreshes `templates/web-title.html` after the app's title
  page changes. It needs the disposable test server, never your own:

  ```bash
  ln -s /path/to/your/marquee/.env .env      # TMDb credential for seeding
  mac/Scripts/local-server.sh up             # 127.0.0.1:3100
  node scripts/landing/snapshot-web.mjs
  mac/Scripts/local-server.sh down && rm .env
  ```

  It signs in as the seeded admin, rewrites a real movie page in the browser
  (every title, person, image, provider, link and id is replaced), and refuses
  to save if any of the original page's text survives. A `next dev` server on
  the same port works too: its overlay is stripped and its CSS folded onto
  one line.

## README screenshots

`docs/screenshots` are real captures of a test server, not renders:

1. `mac/Scripts/local-server.sh up`, then give it a library: a `plex_servers`
   row for the `tester` admin and a few `plex_library_items` (TMDb ids, an
   `added_at`, a size and resolution), then open each title once through
   the API so it's cached; otherwise Recently Added stays empty.
2. Website: `node scripts/landing/readme-screens.mjs` writes `web-*.jpg`
   (Discover and a title page, dark and light).
3. Mac: run a Debug build pinned to the test server with the screenshot
   switch, which hides the "TEST RUN" badge (Debug builds only):
   `MARQUEE_SCREENSHOTS=1 MARQUEE_PINNED_SERVER=http://127.0.0.1:3100
   MARQUEE_PINNED_TOKEN=<token> …/Marquee.app/Contents/MacOS/Marquee
   -marquee-theme dark` (or `light`), and capture the window with
   `screencapture -o -l <window id>`.
