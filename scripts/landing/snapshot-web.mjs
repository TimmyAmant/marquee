#!/usr/bin/env node
/**
 * Refreshes templates/web-title.html from the REAL web app. Only needed when
 * the app's title page changes; render.mjs never talks to a server.
 *
 * It needs the disposable test server, never your own:
 *
 *   ln -s /path/to/your/checkout/.env .env     # TMDb credential for seeding
 *   mac/Scripts/local-server.sh up             # http://127.0.0.1:3100
 *   node scripts/landing/snapshot-web.mjs [tmdbMovieId]
 *   mac/Scripts/local-server.sh down && rm .env
 *
 * It signs in as the seeded admin, opens a movie's title page and rewrites it
 * in the browser: every piece of real content (title, text, people, artwork,
 * providers, links, ids) is replaced, the owned-state capsules and the File
 * details card are added with the exact markup their components render
 * (status-badge, arr-tracking-controls, relink-title-form,
 * file-details-section), and each field is tagged so render.mjs can fill it
 * from lib/slate.mjs. Scripts are stripped and the CSS is inlined.
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchBrowser } from './lib/browser.mjs';
import { emberline as slate, viewer } from './lib/slate.mjs';
import { fillPage, titlePageData } from './lib/fill.mjs';

const BASE = 'http://127.0.0.1:3100';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'templates', 'web-title.html');
const FONTS =
  'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT,WONK@9..144,100..900,0..100,0..1&family=Manrope:wght@200..800&display=block';

async function main() {
  const info = await fetch(`${BASE}/api/v1/server-info`).then((r) => r.json()).catch(() => null);
  if (info?.app !== 'marquee') {
    throw new Error(`No Marquee test server at ${BASE}. Start one with mac/Scripts/local-server.sh up.`);
  }

  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name=username]', 'tester');
  await page.fill('input[name=password]', 'correct-horse-battery');
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.click('button[type=submit]'),
  ]);

  // Any popular movie with the full set of parts will do: all of its content
  // is replaced. Pass an id to pin one.
  let candidates = process.argv[2] ? [process.argv[2]] : [];
  if (!candidates.length) {
    await page.goto(`${BASE}/movies`, { waitUntil: 'networkidle' });
    candidates = await page.$$eval('a[href^="/title/movie/"]', (as) => [
      ...new Set(as.map((a) => a.getAttribute('href').split('/').pop())),
    ]);
  }

  let chosen = null;
  for (const id of candidates.slice(0, 12)) {
    await page.goto(`${BASE}/title/movie/${id}`, { waitUntil: 'networkidle', timeout: 60_000 });
    const complete = await page.evaluate(() => {
      const h1 = document.querySelector('main h1');
      return Boolean(
        h1 &&
          document.querySelector('main .grain-overlay img') &&
          [...document.querySelectorAll('main p')].some((p) => p.classList.contains('italic')) &&
          document.querySelector('main div.mt-5.grid') &&
          document.querySelector('main section div.w-\\[112px\\]') &&
          document.querySelector('main aside img'),
      );
    });
    if (complete) {
      chosen = id;
      break;
    }
  }
  if (!chosen) throw new Error('None of the candidate movies had a backdrop, tagline, credits, cast and providers.');

  // Everything distinctive about the real title, to prove none of it survives.
  const realStrings = await page.evaluate(() => {
    const texts = (sel) => [...document.querySelectorAll(sel)].map((el) => el.textContent.trim());
    return [
      document.querySelector('main h1').textContent.trim(),
      ...texts('main p.italic'),
      ...texts('main div.mt-5.grid p:first-child'),
      ...texts('main section div.w-\\[112px\\] a.block p'),
      ...[...document.querySelectorAll('main aside [title]')].map((el) => el.getAttribute('title')),
      ...[...document.querySelectorAll('main img[alt]')].map((img) => img.alt),
    ].filter((t) => t && t.length > 3);
  });

  await page.evaluate(rewrite, { file: slate.file });
  const blank = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  await page.evaluate(
    fillPage,
    titlePageData(slate, viewer, { backdrop: blank, poster: blank, cast: slate.cast.map(() => blank), providers: slate.providers.map(() => blank) }, 'dark'),
  );

  const cssHref = await page.$eval('link[rel=stylesheet][href*="/_next/"]', (l) => l.href);
  let css = await (await page.request.get(cssHref)).text();
  // next/font ships the woff2 files itself; the template loads the same
  // families (same names, same axes) from Google Fonts instead.
  css = css.replace(/@font-face\{font-family:(?:Fraunces|Manrope);[^}]*\}/g, '');

  let html = await page.evaluate(() => '<!doctype html>\n' + document.documentElement.outerHTML);
  html = html
    .replace(/<link rel="stylesheet" href="[^"]*\/_next\/[^"]*"[^>]*>/, () =>
      `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
      `<link rel="stylesheet" href="${FONTS}"><style>${css}</style>`,
    )
    .replace(/<!-- -->/g, '');

  // Whole words, case-sensitive: names are proper nouns, and "Char" shouldn't match "charset".
  const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const survivors = realStrings.filter((t) => new RegExp(`(^|[^\\p{L}])${escape(t)}([^\\p{L}]|$)`, 'u').test(html));
  if (survivors.length) throw new Error(`Real text survived the rewrite: ${[...new Set(survivors)].slice(0, 8).join(' | ')}`);
  const leftovers = html.match(/image\.tmdb\.org|\/_next\/|\/person\/\d|\/title\/(movie|tv)\/\d|imdb\.com|instagram\.com|facebook\.com|twitter\.com|x\.com\/|youtube/gi);
  if (leftovers) throw new Error(`Real references survived the rewrite: ${[...new Set(leftovers)].join(', ')}`);

  await writeFile(OUT, html);
  console.log(`Wrote ${path.relative(process.cwd(), OUT)} (${(html.length / 1024).toFixed(0)} KB)`);
  await browser.close();
}

/** Runs inside the page. Tags every field render.mjs fills and scrubs the rest. */
function rewrite({ file }) {
  const need = (el, what) => {
    if (!el) throw new Error(`snapshot-web: couldn't find the ${what}`);
    return el;
  };
  const h1 = need(document.querySelector('main h1'), 'title');
  const hero = need(h1.closest('.-mt-\\[52px\\]'), 'title hero');
  const column = h1.parentElement;

  // Only the hero is in frame: drop the sections below it and the footer.
  [...hero.parentElement.children].forEach((el) => el !== hero && el.remove());
  document.querySelectorAll('footer').forEach((el) => el.remove());

  const tagImage = (img, slot) => {
    img.dataset.slot = slot;
    ['srcset', 'sizes', 'loading'].forEach((a) => img.removeAttribute(a));
    img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
  };
  const list = (container, name) => {
    container.dataset.list = name;
    [...container.children].slice(1).forEach((el) => el.remove());
    return container.firstElementChild;
  };

  tagImage(need(hero.querySelector('.grain-overlay img'), 'backdrop'), 'backdrop');
  const poster = need(column.parentElement.querySelector('img'), 'poster');
  tagImage(poster, 'poster');
  poster.dataset.bindAlt = 'title';

  h1.dataset.field = 'title';
  need(column.querySelector('div.mt-2\\.5 > p'), 'meta line').dataset.field = 'meta';
  need([...column.querySelectorAll('p')].find((p) => p.classList.contains('italic')), 'tagline').dataset.field = 'tagline';
  need([...column.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'Overview'), 'overview').nextElementSibling.dataset.field = 'overview';

  // Owned, Radarr-tracked, admin: the capsules title-hero renders in that case.
  const statusRow = need(h1.nextElementSibling.nextElementSibling, 'status row');
  const badge = need(statusRow.querySelector('span.inline-flex'), 'library badge');
  badge.className = badge.className.replace('bg-untracked-bg text-text-secondary border-border', 'bg-owned-bg text-owned border-owned/30');
  badge.lastChild.textContent = 'Already in your library';
  badge.parentElement.querySelectorAll(':scope > :not(span.inline-flex)').forEach((el) => el.remove());
  const pill =
    'flex h-8 items-center rounded-full border border-border-strong px-3.5 text-[13px] text-text-primary transition-colors hover:border-accent hover:text-accent';
  statusRow.insertAdjacentHTML(
    'beforeend',
    `<div class="flex flex-col gap-1.5"><div class="flex flex-wrap items-center gap-2">` +
      `<form><button type="submit" class="${pill} disabled:opacity-60">Search now</button></form>` +
      `<form><button type="submit" class="${pill} disabled:opacity-60">Stop monitoring</button></form>` +
      `</div></div><button type="button" class="${pill}">Fix ID</button>`,
  );

  const credit = list(need(column.querySelector('div.mt-5.grid'), 'credits'), 'credits');
  credit.children[0].dataset.bind = 'name';
  credit.children[1].dataset.bind = 'role';

  const keyword = list(need(column.querySelector('div.mt-\\[18px\\]'), 'keywords'), 'keywords');
  keyword.dataset.bind = 'text';

  // Cast carousel.
  const cast = need([...document.querySelectorAll('main section')].find((s) => s.querySelector('h2')?.textContent.trim() === 'Cast'), 'cast');
  const card = list(need(cast.querySelector('div.w-\\[112px\\]')?.parentElement, 'cast cards'), 'cast');
  tagImage(need(card.querySelector('img'), 'cast portrait'), 'cast');
  card.querySelector('img').dataset.bindAlt = 'name';
  const [castName, castRole] = card.querySelectorAll('a.block p');
  castName.dataset.bind = 'name';
  castRole.dataset.bind = 'character';
  // Six people fit the carousel without scrolling, so both arrows sit dimmed.
  const left = need(cast.querySelector('button[aria-label="Scroll left"]'), 'cast arrows');
  cast.querySelector('button[aria-label="Scroll right"]').className = left.className;

  // Facts card: score, rows, streaming tiles.
  const facts = need(document.querySelector('main aside')?.firstElementChild, 'facts card');
  need(facts.querySelector('span.font-display'), 'score').dataset.field = 'score';
  const row = list(need(facts.children[1], 'fact rows'), 'facts');
  row.children[0].dataset.bind = 'label';
  row.children[1].dataset.bind = 'value';
  const tile = list(need(facts.querySelector('div.mt-2\\.5.flex'), 'streaming tiles'), 'providers');
  tagImage(need(tile.querySelector('img'), 'provider logo'), 'provider');
  tile.dataset.bindTitle = 'name';
  tile.querySelector('img').dataset.bindAlt = 'name';

  // File details, as file-details-section.tsx renders a Radarr-tracked movie.
  const cellHtml = `<div><p class="text-[11px] leading-[14px] text-text-muted" data-bind="label"></p><p class="mt-0.5 whitespace-nowrap text-[13px] font-medium leading-[17px] text-text-primary" data-bind="value"></p></div>`;
  facts.insertAdjacentHTML(
    'afterend',
    `<div class="mt-4"><div class="rounded-2xl border border-border bg-bg-1 px-[18px] pb-[18px] pt-[15px]">` +
      `<h2 class="mb-3 font-display text-[16px] font-semibold leading-[22px] text-text-primary">File details</h2>` +
      `<p class="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-muted">Location</p>` +
      `<div class="mt-1.5 flex h-8 items-center gap-2 rounded-lg border border-border bg-bg-0 pl-2.5 pr-1">` +
      `<input type="text" readonly value="${file.path}" data-field="file-path" class="min-w-0 flex-1 truncate bg-transparent font-mono text-[11px] text-text-secondary outline-none">` +
      `<button type="button" class="flex h-6 shrink-0 items-center gap-1 rounded-md border border-border-strong bg-bg-3 px-2 text-[11px] font-semibold text-text-primary transition-colors hover:border-accent hover:text-accent">Copy</button></div>` +
      `<div class="mt-3.5 grid grid-cols-2 gap-x-3.5 gap-y-3" data-list="file-cells">${cellHtml}</div></div></div>`,
  );

  // Who's signed in, and where (the sidebar footer shows the server's host).
  const account = need(document.querySelector('aside a[href="/settings"]'), 'sidebar account link');
  account.children[0].dataset.field = 'viewer-name';
  account.children[1].dataset.field = 'viewer-host';

  // Scrub: scripts, preloads, React action payloads (they carry ids), links.
  document.querySelectorAll('script, link[rel=preload], link[rel=modulepreload], link[rel=icon], link[rel=apple-touch-icon], meta[name=next-size-adjust], next-route-announcer, template, input[type=hidden]').forEach((el) => el.remove());
  document.querySelectorAll('form').forEach((f) => ['action', 'method', 'enctype'].forEach((a) => f.removeAttribute(a)));
  document.querySelectorAll('a[href]').forEach((a) => {
    a.setAttribute('href', '#');
    a.removeAttribute('target');
  });
  document.querySelectorAll('img:not([data-slot])').forEach((img) => img.remove());
  document.querySelectorAll('[title]').forEach((el) => el.hasAttribute('data-bind-title') || el.removeAttribute('title'));
  document.documentElement.setAttribute('data-theme', 'dark');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
