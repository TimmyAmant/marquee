// Renders Marquee's app icon (gold serif "M" + accent dot on the dark theme
// background, matching the web app's app/icon.tsx) into every size the macOS
// AppIcon asset catalog needs. Run from the repo root:
//   NODE_PATH=../node_modules node Scripts/generate-app-icon.mjs   (sharp comes from the server app)
import { createRequire } from "node:module";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_PATH ?? "sharp");

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c1b22"/>
      <stop offset="1" stop-color="#0a0a0c"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.0" r="1.0">
      <stop offset="0" stop-color="#e0a63e" stop-opacity="0.26"/><stop offset="0.45" stop-color="#e0a63e" stop-opacity="0.07"/>
      <stop offset="1" stop-color="#e0a63e" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6c969"/>
      <stop offset="0.55" stop-color="#e0a63e"/>
      <stop offset="1" stop-color="#b3791f"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.35"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#bg)"/>
    <rect x="100" y="100" width="824" height="824" rx="185" fill="url(#glow)"/>
    <rect x="101.5" y="101.5" width="821" height="821" rx="184" fill="none" stroke="#3a3745" stroke-width="3"/>
  </g>
  <path fill="url(#gold)" transform="translate(-8 14)" d="
    M300 328 L410 328 L522 600 L632 328 L740 328 L740 352 L704 358 L704 670 L740 676 L740 700
    L604 700 L604 676 L640 670 L640 414 L528 690 L500 690 L384 420 L384 670 L420 676 L420 700
    L300 700 L300 676 L336 670 L336 358 L300 352 Z"/>
  <circle cx="768" cy="262" r="30" fill="#e0a63e"/>
</svg>`;

const outDir = path.resolve("Marquee/Resources/Assets.xcassets/AppIcon.appiconset");
mkdirSync(outDir, { recursive: true });
writeFileSync(path.resolve("Scripts/app-icon.svg"), svg.trim() + "\n");

const specs = [
  [16, 1], [16, 2], [32, 1], [32, 2], [128, 1], [128, 2], [256, 1], [256, 2], [512, 1], [512, 2],
];
const images = [];
for (const [pt, scale] of specs) {
  const px = pt * scale;
  const filename = `icon_${pt}x${pt}${scale === 2 ? "@2x" : ""}.png`;
  await sharp(Buffer.from(svg)).resize(px, px).png().toFile(path.join(outDir, filename));
  images.push({ filename, idiom: "mac", scale: `${scale}x`, size: `${pt}x${pt}` });
}
writeFileSync(
  path.join(outDir, "Contents.json"),
  JSON.stringify({ images, info: { author: "xcode", version: 1 } }, null, 2) + "\n",
);
console.log(`Wrote ${images.length} icon sizes to ${outDir}`);
