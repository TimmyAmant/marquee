#!/usr/bin/env node
/**
 * Builds windows/Marquee.Windows/Assets/Marquee.ico (the exe's, the window's
 * and the installer's icon) from the Mac app icon's artwork,
 * mac/Scripts/app-icon.svg, so both apps wear the same mark. Run from the
 * repo root after changing the artwork:
 *
 *   node windows/Scripts/make-icon.mjs
 *
 * The Mac artwork sits inside macOS's icon grid (a 100px margin on a 1024
 * canvas); Windows icons fill their square, so this crops to the tile.
 * Every size is a PNG entry, which Windows reads from Vista on.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sharp = createRequire(path.join(REPO, 'package.json'))('sharp');
const SIZES = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256];

const svg = (await readFile(path.join(REPO, 'mac/Scripts/app-icon.svg'), 'utf8')).replace(
  /viewBox="[^"]*"/,
  'viewBox="92 92 840 840"',
);

const images = await Promise.all(
  SIZES.map((size) => sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toBuffer()),
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(images.length, 4);

let offset = 6 + 16 * images.length;
const entries = images.map((png, i) => {
  const size = SIZES[i];
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // no palette
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});

const out = path.join(REPO, 'windows/Marquee.Windows/Assets/Marquee.ico');
await writeFile(out, Buffer.concat([header, ...entries, ...images]));
console.log(`Wrote ${path.relative(REPO, out)} (${SIZES.join(', ')} px)`);
