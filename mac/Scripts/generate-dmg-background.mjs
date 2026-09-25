// Renders the Marquee disk image's window background (Design/DMG), at 1x and
// 2x: the wordmark, "Drag Marquee into Applications", an arrow between where
// the two icons sit, and the first-launch note. Light, like the website's
// light theme, because Finder draws the icon names in dark text.
// mac/Scripts/dmg-settings.py places the icons to match. Run from mac/:
//   NODE_PATH=../node_modules node Scripts/generate-dmg-background.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH ?? "sharp");

// Keep in step with dmg-settings.py.
const WIDTH = 640;
const HEIGHT = 440;
const APP = { x: 170, y: 212 };
const APPLICATIONS = { x: 470, y: 212 };

const serif = "'New York', 'Iowan Old Style', Georgia, serif";
const sans = "-apple-system, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdfbf7"/>
      <stop offset="1" stop-color="#f1eee6"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0" r="0.9">
      <stop offset="0" stop-color="#e0a63e" stop-opacity="0.20"/>
      <stop offset="0.5" stop-color="#e0a63e" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#e0a63e" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#e0a63e" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#b3791f"/>
    </linearGradient>
  </defs>

  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#glow)"/>

  <!-- The wordmark: serif "Marquee" with the accent dot. -->
  <text x="${WIDTH / 2 - 4}" y="62" text-anchor="middle" font-family="${serif}" font-size="34" font-weight="600" letter-spacing="-0.5" fill="#211f1a">Marquee</text>
  <circle cx="${WIDTH / 2 + 66}" cy="36" r="4.5" fill="#e0a63e"/>
  <text x="${WIDTH / 2}" y="94" text-anchor="middle" font-family="${sans}" font-size="15" fill="#5c574c">Drag Marquee into Applications to install it.</text>

  <!-- The arrow, between the two icons (drawn by Finder over this). -->
  <path d="M ${APP.x + 78} ${APP.y} C ${APP.x + 120} ${APP.y - 26}, ${APPLICATIONS.x - 120} ${APPLICATIONS.y - 26}, ${APPLICATIONS.x - 88} ${APP.y - 3}"
        fill="none" stroke="url(#gold)" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 10"/>
  <path d="M ${APPLICATIONS.x - 98} ${APP.y - 12} L ${APPLICATIONS.x - 82} ${APP.y + 1} L ${APPLICATIONS.x - 101} ${APP.y + 8}"
        fill="none" stroke="#b3791f" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>

  <!-- The first-launch note, over a hairline. -->
  <line x1="48" y1="330" x2="470" y2="330" stroke="#e7e2d5" stroke-width="1"/>
  <text x="48" y="360" font-family="${sans}" font-size="12.5" font-weight="600" fill="#211f1a">Opening it the first time</text>
  <text x="48" y="381" font-family="${sans}" font-size="12" fill="#5c574c">If macOS says it can't check Marquee, choose Done, then open</text>
  <text x="48" y="398" font-family="${sans}" font-size="12" fill="#5c574c">System Settings › Privacy &amp; Security and click Open Anyway.</text>
  <text x="48" y="415" font-family="${sans}" font-size="12" fill="#5c574c">After that, Marquee updates itself.</text>
</svg>`;

const outDir = path.join(process.cwd(), "Design", "DMG");
mkdirSync(outDir, { recursive: true });
for (const [scale, name] of [[1, "background.png"], [2, "background@2x.png"]]) {
  await sharp(Buffer.from(svg), { density: 72 * scale })
    .resize(WIDTH * scale, HEIGHT * scale)
    .png()
    .toFile(path.join(outDir, name));
  console.log(`${name}: ${WIDTH * scale}×${HEIGHT * scale}`);
}

// Both sizes in one TIFF: what dmg-settings.py hands Finder, which picks the
// 2x image on a Retina screen.
const { execFileSync } = await import("node:child_process");
execFileSync("/usr/bin/tiffutil", [
  "-cathidpicheck",
  path.join(outDir, "background.png"),
  path.join(outDir, "background@2x.png"),
  "-out",
  path.join(outDir, "background.tiff"),
]);
console.log("background.tiff");
