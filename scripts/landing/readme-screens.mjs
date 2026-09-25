#!/usr/bin/env node
/**
 * Captures the website screenshots in docs/screenshots (the README's), from
 * the disposable test server, never your own:
 *
 *   mac/Scripts/local-server.sh up            # http://127.0.0.1:3100, seeded admin
 *   node scripts/landing/readme-screens.mjs
 *
 * It signs in as the seeded admin and shoots Discover and a title page, dark
 * and light, at 1600×1000 (a 1280×800 window at 1.25×). Give the server a
 * library first (a Plex server row and a few plex_library_items, then open
 * each title once so it's cached) or Recently Added stays empty.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { launchBrowser } from './lib/browser.mjs';

const BASE = 'http://127.0.0.1:3100';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const OUT = path.join(REPO, 'docs', 'screenshots');
const sharp = createRequire(path.join(REPO, 'package.json'))('sharp');

/** The title page shown: a movie in the seeded library, so it reads as owned. */
const TITLE = process.argv[2] ?? '/title/movie/693134';

const SHOTS = [
  { file: 'web-discover-rail.jpg', path: '/discover', theme: 'dark' },
  { file: 'web-title-rail.jpg', path: TITLE, theme: 'dark' },
  { file: 'web-light-discover-rail.jpg', path: '/discover', theme: 'light' },
  { file: 'web-light-title-rail.jpg', path: TITLE, theme: 'light' },
];

async function main() {
  const info = await fetch(`${BASE}/api/v1/server-info`).then((r) => r.json()).catch(() => null);
  if (info?.app !== 'marquee') {
    throw new Error(`No Marquee test server at ${BASE}. Start one with mac/Scripts/local-server.sh up.`);
  }
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.25 });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[name=username]', 'tester');
  await page.fill('input[name=password]', 'correct-horse-battery');
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 }),
    page.click('button[type=submit]'),
  ]);

  for (const shot of SHOTS) {
    // The site keeps the theme in localStorage (lib/theme.ts); set it, then
    // load the page so the pre-paint script picks it up.
    await page.evaluate((theme) => localStorage.setItem('marquee-theme', theme), shot.theme);
    await page.emulateMedia({ colorScheme: shot.theme });
    await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle', timeout: 60_000 });
    // Posters and backdrops load lazily: scroll through once and back, then
    // let the images settle.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForLoadState('networkidle');
    await page.mouse.move(1270, 790);
    await page.waitForTimeout(1200);
    const png = await page.screenshot({ type: 'png' });
    await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(path.join(OUT, shot.file));
    console.log(`${shot.file}  ${shot.theme}  ${shot.path}`);
  }
  await browser.close();
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
