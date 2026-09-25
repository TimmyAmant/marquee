#!/usr/bin/env node
/**
 * Renders the landing page's product screenshots and poster art.
 *
 *   node scripts/landing/render.mjs [--art <dir>] [--out <dir>]
 *
 * Artwork is read from ~/Desktop/Marquee Artwork (override with --art or
 * MARQUEE_ARTWORK_DIR), one file per slot, .png/.jpg/.webp:
 *   emberline-backdrop, emberline-poster, paper-harbor-poster,
 *   holloway-poster, cast-1 … cast-6
 * Any slot without a file is drawn by lib/placeholders.mjs instead; the run
 * ends with a table saying which. Posters are text-free art: their titles
 * are lettered on here (lib/lettering.mjs).
 *
 * Writes, by default into site/assets/img (and site/assets/og.jpg):
 *   title-{dark,light}-{1600,1100,720}.webp      web title page (hero)
 *   title-{dark,light}-crop-{920,620}.webp       the same, cropped for phones
 *   menu-{dark,light}-1520.webp                  its top left, rail hidden, under the menu mocks
 *   mac-{dark,light}-{1600,1000}.webp            Marquee for Mac window
 *   poster-{paper-harbor,holloway}.webp          request-ticket thumbnails
 *   og.jpg                                       social card
 * With --out, everything (og.jpg included) goes to that directory instead.
 */
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { launchBrowser } from './lib/browser.mjs';
import * as placeholders from './lib/placeholders.mjs';
import * as lettering from './lib/lettering.mjs';
import { emberline, viewer } from './lib/slate.mjs';
import { fillPage, titlePageData } from './lib/fill.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const sharp = createRequire(path.join(REPO, 'package.json'))('sharp');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const ART_DIR = arg('--art') ?? process.env.MARQUEE_ARTWORK_DIR ?? path.join(os.homedir(), 'Desktop', 'Marquee Artwork');
const OUT = path.resolve(arg('--out') ?? path.join(REPO, 'site', 'assets', 'img'));
const OG = arg('--out') ? path.join(OUT, 'og.jpg') : path.join(REPO, 'site', 'assets', 'og.jpg');
const CACHE = path.join(HERE, '.cache');
const url = (file) => pathToFileURL(file).href;

const SLOTS = [
  ['emberline-backdrop', 1920, 1080, placeholders.emberlineBackdrop],
  ['emberline-poster', 1000, 1500, placeholders.emberlinePoster],
  ['paper-harbor-poster', 1000, 1500, placeholders.paperHarborPoster],
  ['holloway-poster', 1000, 1500, placeholders.hollowayPoster],
  ...[0, 1, 2, 3, 4, 5].map((i) => [`cast-${i + 1}`, 800, 1200, () => placeholders.castPortrait(i)]),
];

/** A poster whose art already carries its own title (Gemini tends to letter
 * them whether asked or not) goes in as `<slot>-lettered.<ext>` and skips
 * lib/lettering.mjs, so it never gets a second title on top. */
function findArtwork(name) {
  for (const suffix of ['-lettered', '']) {
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
      const file = path.join(ART_DIR, name + suffix + ext);
      if (existsSync(file)) return { file, lettered: suffix !== '' };
    }
  }
  return null;
}

/** Loads HTML from a file (so file:// art resolves), screenshots the viewport. */
async function renderHtml(browser, html, { width, height, scale = 1 }, name) {
  const file = path.join(CACHE, `${name}.html`);
  await writeFile(file, html);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
  await page.goto(url(file), { waitUntil: 'networkidle' });
  await settle(page);
  const png = await page.screenshot({ type: 'png' });
  await page.close();
  return png;
}

/** Fonts in, images decoded, nothing mid-transition. */
async function settle(page) {
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
  });
  const broken = await page.evaluate(() =>
    [...document.images].filter((img) => img.getAttribute('src') && !(img.naturalWidth > 1)).map((img) => img.dataset.slot || img.src.slice(0, 60)),
  );
  if (broken.length) throw new Error(`Images didn't load: ${broken.join(', ')}`);
}

/** Renders a title-page template with the slate filled in, plus any extra CSS. */
async function renderTemplate(browser, template, data, crop, css) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(url(path.join(HERE, 'templates', template)), { waitUntil: 'networkidle' });
  await page.evaluate(fillPage, data);
  if (css) await page.addStyleTag({ content: css });
  await settle(page);
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
  const needed = template.startsWith('web') ? ['Fraunces', 'Manrope'] : ['NY', 'SF'];
  const missing = needed.filter((family) => !fonts.includes(family));
  if (missing.length) throw new Error(`${template}: fonts didn't load (${missing.join(', ')})`);
  const png = await page.screenshot({ type: 'png' });
  const box = crop ? await page.evaluate(crop) : null;
  await page.close();
  return { png, box };
}

/** Phone crop for the hero: the poster through the end of the main column. */
function heroCrop() {
  const poster = document.querySelector('img[data-slot="poster"]').parentElement.getBoundingClientRect();
  const column = document.querySelector('[data-field="title"]').parentElement.getBoundingClientRect();
  const x = poster.left - 18, y = poster.top - 12, w = column.right + 18 - x;
  return { x, y, w, h: (w * 620) / 920 };
}

async function webp(input, name, widths, extract) {
  const written = [];
  for (const width of widths) {
    let img = sharp(input);
    if (extract) img = img.extract(extract);
    const file = path.join(OUT, `${name}-${width}.webp`);
    await img.resize({ width }).webp({ quality: 82, effort: 6, smartSubsample: true }).toFile(file);
    written.push(path.basename(file));
  }
  return written;
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  await mkdir(OUT, { recursive: true });
  const browser = await launchBrowser();
  const written = [];
  try {
    // 1. Artwork, or a placeholder for each missing slot.
    const art = {};
    const sources = [];
    const prelettered = new Set();
    for (const [name, width, height, draw] of SLOTS) {
      const found = findArtwork(name);
      if (found) {
        art[name] = found.file;
        if (found.lettered) prelettered.add(name);
        sources.push([name, 'artwork', path.basename(found.file)]);
        continue;
      }
      const png = await renderHtml(browser, `<!doctype html><html><body style="margin:0">${draw()}</body></html>`, { width, height }, `placeholder-${name}`);
      art[name] = path.join(CACHE, `placeholder-${name}.png`);
      await writeFile(art[name], png);
      sources.push([name, 'placeholder', 'lib/placeholders.mjs']);
    }

    // 2. Posters with their titles lettered on.
    const posters = {};
    for (const [key, slot, letter] of [
      ['emberline', 'emberline-poster', lettering.emberline],
      ['paper-harbor', 'paper-harbor-poster', lettering.paperHarbor],
      ['holloway', 'holloway-poster', lettering.holloway],
    ]) {
      const html = prelettered.has(slot)
        ? `<!doctype html><html><body style="margin:0"><img src="${url(art[slot])}" style="display:block;width:1000px;height:1500px;object-fit:cover"></body></html>`
        : letter(url(art[slot]));
      const png = await renderHtml(browser, html, { width: 1000, height: 1500 }, `poster-${key}`);
      posters[key] = path.join(CACHE, `poster-${key}.png`);
      await writeFile(posters[key], png);
    }

    // 3. The streaming services' marks.
    const providers = [];
    for (const [i, name] of emberline.providers.entries()) {
      const png = await renderHtml(browser, `<!doctype html><html><body style="margin:0">${placeholders.providerMark(name)}</body></html>`, { width: 144, height: 144 }, `provider-${i + 1}`);
      providers.push(path.join(CACHE, `provider-${i + 1}.png`));
      await writeFile(providers[i], png);
    }

    const images = {
      backdrop: url(art['emberline-backdrop']),
      poster: url(posters.emberline),
      cast: emberline.cast.map((_, i) => url(art[`cast-${i + 1}`])),
      providers: providers.map(url),
    };

    // 4. The web title page (from the real app, templates/web-title.html) and
    //    the Mac window, in both themes, at 2x for crisp downscaling.
    let ogShot = null;
    for (const theme of ['dark', 'light']) {
      const data = titlePageData(emberline, viewer, images, theme);
      const web = await renderTemplate(browser, 'web-title.html', data, heroCrop);
      written.push(...(await webp(web.png, `title-${theme}`, [1600, 1100, 720])));
      const extract = {
        left: Math.round(web.box.x * 2),
        top: Math.round(web.box.y * 2),
        width: Math.round(web.box.w * 2),
        height: Math.round(web.box.h * 2),
      };
      written.push(...(await webp(web.png, `title-${theme}-crop`, [920, 620], extract)));
      if (theme === 'dark') {
        ogShot = path.join(CACHE, 'og-shot.png');
        await sharp(web.png).extract(extract).png().toFile(ogShot);
      }

      // Under the site's menu mocks, which draw the rail themselves (and the
      // real one fades out while the menu is open): the page without its
      // rail, its top-left 760x680.
      const bare = await renderTemplate(browser, 'web-title.html', data, null, 'nav[aria-label="Main"]{visibility:hidden!important}');
      written.push(...(await webp(bare.png, `menu-${theme}`, [1520], { left: 0, top: 0, width: 1520, height: 1360 })));

      // Cropped to 1440x846, the frame the site's Mac section was laid out for.
      const mac = await renderTemplate(browser, 'mac-title.html', data);
      written.push(...(await webp(mac.png, `mac-${theme}`, [1600, 1000], { left: 0, top: 0, width: 2880, height: 1692 })));
    }

    // 5. Request-ticket thumbnails.
    for (const key of ['paper-harbor', 'holloway']) {
      const file = path.join(OUT, `poster-${key}.webp`);
      await sharp(posters[key]).resize(192, 288).webp({ quality: 84, effort: 6 }).toFile(file);
      written.push(path.basename(file));
    }

    // 6. The social card.
    const ogPage = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
    await ogPage.goto(url(path.join(HERE, 'templates', 'og.html')), { waitUntil: 'networkidle' });
    await ogPage.evaluate(fillPage, { slots: { shot: url(ogShot) } });
    await settle(ogPage);
    const og = await ogPage.screenshot({ type: 'png' });
    await ogPage.close();
    await sharp(og).resize(1200, 630).jpeg({ quality: 86, mozjpeg: true }).toFile(OG);
    written.push(path.relative(REPO, OG));

    console.log(`\nArtwork (${ART_DIR}):`);
    for (const [name, source, detail] of sources) console.log(`  ${name.padEnd(22)} ${source.padEnd(12)} ${detail}`);
    const pending = sources.filter(([, source]) => source === 'placeholder').length;
    console.log(pending ? `  ${pending} of ${sources.length} slots are placeholders; drop the files in and run this again.` : '  All slots use the real artwork.');
    console.log(`\nWrote ${written.length} files to ${path.relative(REPO, OUT) || '.'}:`);
    console.log('  ' + written.join('\n  '));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
