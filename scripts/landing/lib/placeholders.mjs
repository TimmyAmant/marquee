// Stand-in artwork for every slot the Gemini files fill (see
// ~/Desktop/Marquee Artwork/PROMPTS.md): same composition and palette as the
// prompts, drawn as SVG so the page looks finished before the real art lands.
// All text-free; posters get their lettering from lettering.mjs.

/** Deterministic PRNG so every render draws the same snow and stars. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const f = (n) => n.toFixed(1);
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
const grain = (id, opacity = 0.09, freq = 0.85) =>
  `<filter id="${id}" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="2" stitchTiles="stitch" result="n"/><feColorMatrix in="n" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 ${opacity} 0"/></filter>`;

function dots(rand, n, { x0, x1, y0, y1, r0, r1, o0, o1, fill }) {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += `<circle cx="${f(x0 + rand() * (x1 - x0))}" cy="${f(y0 + rand() * (y1 - y0))}" r="${(r0 + rand() * (r1 - r0)).toFixed(2)}" fill="${fill}" opacity="${(o0 + rand() * (o1 - o0)).toFixed(2)}"/>`;
  }
  return out;
}

/** A broken orbital mirror: a faceted disc with a jagged bite out of one
 * edge, shards drifting away from it, cracks, and a rim catching the light. */
function mirror(id, cx, cy, r, { breakAt = 0.7, rimAt = 2.3, glow = '#f2a257', seed = 1, shards = 4 } = {}) {
  const rand = rng(seed);
  const pt = (a, k) => [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k];
  const rings = [0.3, 0.55, 0.8].map((k) => `<circle cx="${cx}" cy="${cy}" r="${f(r * k)}" fill="none" stroke="#a9c0da" stroke-opacity=".13" stroke-width="${f(r * 0.01)}"/>`).join('');
  let spokes = '';
  for (let i = 0; i < 14; i++) {
    const [x, y] = pt((i / 14) * Math.PI * 2 + seed, 1);
    spokes += `<line x1="${cx}" y1="${cy}" x2="${f(x)}" y2="${f(y)}" stroke="#a9c0da" stroke-opacity=".1" stroke-width="${f(r * 0.008)}"/>`;
  }
  // jagged bite: a zig-zag polygon reaching in from the edge around breakAt
  const span = 0.55;
  let bite = '';
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const a = breakAt - span / 2 + (i / steps) * span;
    const k = i === 0 || i === steps ? 1.02 : 0.62 + rand() * 0.28;
    const [x, y] = pt(a, k);
    bite += `${i ? 'L' : 'M'}${f(x)} ${f(y)} `;
  }
  const [ox, oy] = pt(breakAt, 1.6);
  bite += `L${f(ox)} ${f(oy)} Z`;
  // shards drifting outward from the break
  let shardSvg = '';
  for (let i = 0; i < shards; i++) {
    const a = breakAt + (rand() - 0.5) * span;
    const [sx, sy] = pt(a, 1.12 + rand() * 0.35);
    const size = r * (0.05 + rand() * 0.09);
    const rot = rand() * 360;
    shardSvg += `<path transform="translate(${f(sx)} ${f(sy)}) rotate(${f(rot)})" d="M0 ${f(-size)} L${f(size * 0.8)} ${f(size * 0.3)} L${f(-size * 0.5)} ${f(size * 0.7)} Z" fill="url(#${id}f)" stroke="${glow}" stroke-opacity=".5" stroke-width="${f(r * 0.006)}"/>`;
  }
  let cracks = '';
  for (let c = 0; c < 5; c++) {
    let [x, y] = pt(breakAt + (rand() - 0.5) * span * 0.8, 0.7);
    let d = `M${f(x)} ${f(y)}`;
    const dir = breakAt + Math.PI + (rand() - 0.5) * 1.6;
    for (let s2 = 0; s2 < 5; s2++) {
      x += Math.cos(dir + (rand() - 0.5) * 0.9) * r * 0.14;
      y += Math.sin(dir + (rand() - 0.5) * 0.9) * r * 0.14;
      d += ` L${f(x)} ${f(y)}`;
    }
    cracks += `<path d="${d}" fill="none" stroke="#dce8f6" stroke-opacity=".3" stroke-width="${f(r * 0.007)}"/>`;
  }
  const [rx1, ry1] = pt(rimAt - 0.9, 1), [rx2, ry2] = pt(rimAt + 0.9, 1);
  return `<defs>
      <radialGradient id="${id}f" cx=".4" cy=".35" r=".85"><stop offset="0" stop-color="#58738f"/><stop offset=".55" stop-color="#2a3f56"/><stop offset="1" stop-color="#131d2b"/></radialGradient>
      <mask id="${id}m"><rect x="${f(cx - r * 1.3)}" y="${f(cy - r * 1.3)}" width="${f(r * 2.6)}" height="${f(r * 2.6)}" fill="#fff"/><path d="${bite}" fill="#000"/></mask>
    </defs>
    <g mask="url(#${id}m)">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}f)"/>
      ${rings}${spokes}${cracks}
      <path d="M${f(rx1)} ${f(ry1)} A${r} ${r} 0 0 1 ${f(rx2)} ${f(ry2)}" fill="none" stroke="${glow}" stroke-opacity=".85" stroke-width="${f(r * 0.022)}" stroke-linecap="round"/>
    </g>
    ${shardSvg}`;
}

// ---------------------------------------------------------------- Emberline

export function emberlineBackdrop() {
  const W = 1920, H = 1080, rand = rng(11);
  let flecks = '';
  for (let i = 0; i < 160; i++) {
    const x = rand() * W, y = rand() * H, l = 5 + rand() * 12;
    flecks += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x - l)}" y2="${f(y + l * 0.45)}" stroke="#eef4ff" stroke-width="${(1 + rand() * 1.4).toFixed(2)}" stroke-opacity="${(0.25 + rand() * 0.45).toFixed(2)}" stroke-linecap="round"/>`;
  }
  let ice = '';
  for (let i = 0; i < 30; i++) {
    const y = 724 + i * i * 0.4 + rand() * 6, x = rand() * W * 0.75;
    ice += `<rect x="${f(x)}" y="${f(y)}" width="${f(140 + rand() * 520)}" height="${(1 + rand() * 2).toFixed(1)}" rx="1" fill="#a3bcd8" opacity="${(0.04 + rand() * 0.09).toFixed(2)}"/>`;
  }
  const body = 'M1000 1080 C1010 930 1090 830 1188 790 C1160 720 1150 610 1182 520 C1214 420 1292 344 1374 342 C1466 340 1536 416 1556 520 C1574 612 1560 716 1528 784 C1640 824 1726 930 1748 1080 Z';
  const opening = 'M1262 548 C1258 486 1296 440 1352 432 C1414 424 1452 470 1456 540 C1460 610 1432 676 1370 694 C1312 710 1266 640 1262 548 Z';
  return svg(W, H, `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#050a16"/><stop offset=".3" stop-color="#0e1f39"/><stop offset=".52" stop-color="#25415d"/>
        <stop offset=".62" stop-color="#58697b"/><stop offset=".655" stop-color="#a98062"/><stop offset=".675" stop-color="#27374b"/>
        <stop offset="1" stop-color="#04070d"/>
      </linearGradient>
      <radialGradient id="dusk" cx=".84" cy=".64" r=".42"><stop offset="0" stop-color="#ee8a3e" stop-opacity=".5"/><stop offset="1" stop-color="#ee8a3e" stop-opacity="0"/></radialGradient>
      <radialGradient id="lamp" cx="1128" cy="826" r="560" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#ffe4ae" stop-opacity=".9"/><stop offset=".1" stop-color="#f7a64a" stop-opacity=".55"/>
        <stop offset=".42" stop-color="#d36c22" stop-opacity=".14"/><stop offset="1" stop-color="#d36c22" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="lit" cx="1128" cy="826" r="520" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#e79a52" stop-opacity=".9"/><stop offset=".35" stop-color="#8a5328" stop-opacity=".55"/><stop offset=".8" stop-color="#20242c" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="face" cx="1270" cy="600" r="220" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#e7a372"/><stop offset=".28" stop-color="#9c5a34"/><stop offset=".6" stop-color="#2b1a14"/><stop offset="1" stop-color="#0a090b"/>
      </radialGradient>
      <linearGradient id="skyrim" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#9fc2e8" stop-opacity=".7"/><stop offset=".08" stop-color="#9fc2e8" stop-opacity="0"/></linearGradient>
      <radialGradient id="vig" cx=".56" cy=".46" r=".8"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>
      <clipPath id="fig"><path d="${body}"/></clipPath>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.4"/></filter>
      <filter id="bokeh" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
      <filter id="haze" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="26"/></filter>
      <filter id="far" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.6"/></filter>
      <filter id="fur" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency=".08" numOctaves="3" seed="4"/><feDisplacementMap in="SourceGraphic" scale="22"/><feGaussianBlur stdDeviation="1.2"/></filter>
      ${grain('g', 0.1)}
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    ${dots(rand, 90, { x0: 0, x1: W, y0: 0, y1: 520, r0: 0.5, r1: 1.3, o0: 0.15, o1: 0.65, fill: '#dfe9ff' })}
    <g opacity=".85" filter="url(#far)">${mirror('m1', 1660, 150, 290, { breakAt: 2.2, rimAt: 0.9, seed: 3, shards: 5 })}</g>
    <g opacity=".6" filter="url(#far)">${mirror('m2', 900, 130, 108, { breakAt: 5.6, rimAt: 1.1, seed: 7 })}</g>
    <g opacity=".38" filter="url(#far)">${mirror('m3', 420, 260, 60, { breakAt: 3.8, rimAt: 0.8, seed: 9, shards: 2 })}</g>
    <rect width="${W}" height="${H}" fill="url(#dusk)"/>
    <ellipse cx="960" cy="712" rx="1200" ry="40" fill="#8a97a8" opacity=".32" filter="url(#haze)"/>
    ${ice}
    <rect width="${W}" height="${H}" fill="url(#lamp)"/>

    <!-- the pilot: hood up, face half-lit by the lantern -->
    <path d="${body}" fill="#14161b"/>
    <g clip-path="url(#fig)">
      <rect x="900" y="300" width="900" height="800" fill="url(#lit)"/>
    </g>
    <path d="${body}" fill="none" stroke="url(#skyrim)" stroke-width="7"/>
    <path d="${opening}" fill="none" stroke="#cbb18f" stroke-width="30" opacity=".85" filter="url(#fur)"/>
    <path d="${opening}" fill="none" stroke="#1b1c20" stroke-width="30" opacity=".55" filter="url(#fur)" clip-path="url(#fig)" transform="translate(10 0)"/>
    <path d="${opening}" fill="url(#face)"/>
    <path d="${opening}" fill="#07070a" opacity=".45" transform="translate(28 18) scale(.96)" style="transform-origin:1360px 560px"/>
    <!-- the lantern, held up in a gloved hand -->
    <circle cx="1128" cy="812" r="130" fill="#ffc46e" opacity=".3" filter="url(#haze)"/>
    <path d="M1252 1010 C1222 934 1192 856 1172 792 C1166 772 1150 760 1134 764 C1116 769 1110 788 1116 804 C1134 864 1160 952 1192 1026 Z" fill="#17181d"/>
    <path d="M1252 1010 C1222 934 1192 856 1172 792 C1166 772 1150 760 1134 764 C1116 769 1110 788 1116 804 C1134 864 1160 952 1192 1026 Z" fill="url(#lit)" opacity=".8"/>
    <ellipse cx="1136" cy="772" rx="22" ry="17" fill="#221c18"/>
    <path d="M1114 796 C1114 776 1142 776 1142 796" fill="none" stroke="#2a2016" stroke-width="4"/>
    <rect x="1106" y="796" width="44" height="60" rx="9" fill="#ffdc98"/>
    <rect x="1114" y="804" width="28" height="44" rx="6" fill="#fff4d6"/>
    <rect x="1106" y="796" width="44" height="60" rx="9" fill="none" stroke="#3b2a16" stroke-width="4"/>
    <rect x="1102" y="790" width="52" height="9" rx="3" fill="#3b2a16"/><rect x="1102" y="853" width="52" height="9" rx="3" fill="#3b2a16"/>
    ${flecks}
    ${dots(rand, 220, { x0: 0, x1: W, y0: 0, y1: H, r0: 0.8, r1: 2.4, o0: 0.25, o1: 0.85, fill: '#f4f8ff' })}
    <g filter="url(#bokeh)">${dots(rand, 36, { x0: 0, x1: W, y0: 0, y1: H, r0: 4, r1: 9, o0: 0.12, o1: 0.4, fill: '#ffffff' })}</g>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>
    <rect width="${W}" height="${H}" filter="url(#g)" opacity=".55"/>`);
}

export function emberlinePoster() {
  const W = 1000, H = 1500, rand = rng(21);
  return svg(W, H, `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#03060f"/><stop offset=".38" stop-color="#0b1a38"/><stop offset=".6" stop-color="#1f3a66"/>
        <stop offset=".665" stop-color="#6f8db3"/><stop offset=".675" stop-color="#1a2a45"/><stop offset="1" stop-color="#03050a"/>
      </linearGradient>
      <linearGradient id="path" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffd58e" stop-opacity=".9"/><stop offset=".6" stop-color="#e9f2ff" stop-opacity=".55"/><stop offset="1" stop-color="#e9f2ff" stop-opacity="0"/></linearGradient>
      <radialGradient id="beacon" cx="676" cy="928" r="60" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff0c8"/><stop offset=".3" stop-color="#f7a64a" stop-opacity=".6"/><stop offset="1" stop-color="#f7a64a" stop-opacity="0"/></radialGradient>
      <radialGradient id="lamp" cx="468" cy="1242" r="150" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe6b0"/><stop offset=".18" stop-color="#f7a64a" stop-opacity=".7"/><stop offset="1" stop-color="#f7a64a" stop-opacity="0"/></radialGradient>
      <radialGradient id="vig" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
      <filter id="haze" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
      ${grain('g', 0.12)}
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    ${dots(rand, 150, { x0: 0, x1: W, y0: 0, y1: 900, r0: 0.6, r1: 1.8, o0: 0.2, o1: 0.85, fill: '#e3ecff' })}
    <g opacity=".95">${mirror('pm', 500, 640, 262, { breakAt: 5.5, rimAt: 2.2, seed: 5, shards: 5 })}</g>
    <ellipse cx="500" cy="1000" rx="700" ry="26" fill="#9fb3cc" opacity=".35" filter="url(#haze)"/>
    <!-- the relay tower on the horizon -->
    <g fill="#060a14">
      <path d="M668 1004 L672 900 L680 900 L684 1004 Z"/><rect x="664" y="896" width="24" height="8" rx="2"/>
      <path d="M676 870 L682 896 L670 896 Z"/>
    </g>
    <circle cx="676" cy="928" r="60" fill="url(#beacon)"/>
    <!-- frozen sea and the thin line of light -->
    <path d="M0 1004 L1000 1004 L1000 1500 L0 1500 Z" fill="#050a14"/>
    ${Array.from({ length: 18 }, (_, i) => `<rect x="${f(rand() * 700)}" y="${f(1016 + i * i * 1.3)}" width="${f(120 + rand() * 360)}" height="1.6" fill="#9db7d4" opacity="${(0.06 + rand() * 0.1).toFixed(2)}"/>`).join('')}
    <path d="M676 1006 L688 1006 L560 1500 L380 1500 Z" fill="url(#path)" opacity=".5"/>
    <path d="M677 1006 L684 1006 L520 1500 L430 1500 Z" fill="url(#path)" opacity=".8" filter="url(#glow)"/>
    <!-- the traveller -->
    <circle cx="468" cy="1242" r="150" fill="url(#lamp)"/>
    <g fill="#04060b">
      <path d="M444 1296 L448 1248 C448 1232 456 1224 464 1222 C458 1216 456 1206 462 1200 C470 1194 480 1198 482 1208 C484 1216 480 1222 474 1224 C482 1228 488 1236 488 1250 L490 1296 Z"/>
    </g>
    <circle cx="496" cy="1256" r="6" fill="#ffe2a0"/><circle cx="496" cy="1256" r="16" fill="#ffc46e" opacity=".5" filter="url(#glow)"/>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>
    <rect width="${W}" height="${H}" filter="url(#g)" opacity=".5"/>`);
}

// ------------------------------------------------------------- Paper Harbor

export function paperHarborPoster() {
  const W = 1000, H = 1500, rand = rng(31);
  const boat = (x, y, s, rot, o = 1) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" opacity="${o}">
      <path d="M-60 0 L60 0 L40 22 L-40 22 Z" fill="#fbf6ef"/><path d="M-40 0 L0 -58 L0 0 Z" fill="#f1e8dc"/><path d="M0 -58 L40 0 L0 0 Z" fill="#fffaf3"/>
      <path d="M-30 10 L28 10 M-24 15 L20 15" stroke="#8a7fa0" stroke-width="1.4" opacity=".45"/>
      <path d="M-60 26 L60 26" stroke="#ffffff" stroke-width="3" opacity=".35"/>
    </g>`;
  let ripples = '';
  for (let i = 0; i < 40; i++) {
    const y = 960 + i * 13 + rand() * 6;
    ripples += `<rect x="${f(rand() * 900)}" y="${f(y)}" width="${f(60 + rand() * 260)}" height="${(1.2 + rand() * 1.6).toFixed(1)}" rx="1" fill="#fff4f1" opacity="${(0.08 + rand() * 0.18).toFixed(2)}"/>`;
  }
  return svg(W, H, `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#b9a7d6"/><stop offset=".3" stop-color="#d9b4cf"/><stop offset=".52" stop-color="#f4c7c3"/><stop offset=".62" stop-color="#fbd9bd"/>
      </linearGradient>
      <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3bdc9"/><stop offset=".35" stop-color="#a99bc5"/><stop offset="1" stop-color="#5d5b8c"/></linearGradient>
      <radialGradient id="sun" cx="330" cy="905" r="220" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff3e0"/><stop offset=".2" stop-color="#ffe0c2" stop-opacity=".85"/><stop offset="1" stop-color="#ffd3bb" stop-opacity="0"/></radialGradient>
      <radialGradient id="lh" cx="846" cy="846" r="70" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff6de"/><stop offset=".3" stop-color="#ffe6a8" stop-opacity=".6"/><stop offset="1" stop-color="#ffe6a8" stop-opacity="0"/></radialGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>
      ${grain('g', 0.14, 0.9)}
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <circle cx="330" cy="905" r="220" fill="url(#sun)"/>
    <circle cx="330" cy="905" r="46" fill="#fff4e4" opacity=".9"/>
    <path d="M0 880 C120 870 200 880 300 884 C420 890 520 876 640 880 C760 884 860 872 1000 876 L1000 930 L0 930 Z" fill="#b89fbf" opacity=".55" filter="url(#soft)"/>
    <!-- headland and lighthouse -->
    <path d="M760 930 C790 880 830 866 880 868 C930 870 970 890 1000 900 L1000 930 Z" fill="#7a6a94"/>
    <rect x="838" y="820" width="16" height="52" fill="#f7eee6"/><rect x="838" y="832" width="16" height="7" fill="#c98f9b"/><rect x="838" y="850" width="16" height="7" fill="#c98f9b"/>
    <rect x="834" y="812" width="24" height="10" rx="2" fill="#7a6a94"/>
    <circle cx="846" cy="846" r="70" fill="url(#lh)"/>
    <rect x="0" y="928" width="${W}" height="${H - 928}" fill="url(#sea)"/>
    ${ripples}
    <!-- the pier, and two people at either end of it -->
    <g>
      <path d="M90 1032 L910 1004 L910 1016 L90 1046 Z" fill="#6b5070"/>
      ${Array.from({ length: 16 }, (_, i) => { const x = 110 + i * 52; const y = 1040 - i * 1.7; return `<rect x="${x}" y="${f(y)}" width="7" height="${f(46 - i * 0.8)}" fill="#5a4262"/>`; }).join('')}
      <g fill="#3e2c48">
        <path d="M152 1034 L154 996 C154 988 158 984 163 983 C159 979 158 973 162 969 C167 965 173 968 174 974 C175 979 172 982 168 984 C173 986 176 990 176 998 L178 1033 Z"/>
        <path d="M842 1008 L844 972 C844 965 848 961 852 960 C849 956 848 951 851 948 C855 945 860 947 861 952 C862 956 860 959 856 960 C861 962 864 966 864 973 L866 1008 Z"/>
      </g>
    </g>
    ${boat(250, 1330, 1.05, -6)}${boat(620, 1400, 1.25, 5)}${boat(820, 1250, 0.7, -3, 0.9)}${boat(430, 1200, 0.55, 8, 0.85)}
    <rect width="${W}" height="${H}" filter="url(#g)" opacity=".6"/>`);
}

// -------------------------------------------------------- Holloway Picture House

export function hollowayPoster() {
  const W = 1000, H = 1500, rand = rng(41);
  let rain = '';
  for (let i = 0; i < 220; i++) {
    const x = rand() * W, y = rand() * H, l = 24 + rand() * 46;
    rain += `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x - l * 0.18)}" y2="${f(y + l)}" stroke="#bfe3e6" stroke-width="${(0.8 + rand()).toFixed(2)}" stroke-opacity="${(0.12 + rand() * 0.3).toFixed(2)}" stroke-linecap="round"/>`;
  }
  let bulbs = '';
  const bulbRow = (x0, x1, y) => { for (let x = x0; x <= x1; x += 22) bulbs += `<circle cx="${x}" cy="${y}" r="4.2" fill="#ffe3a4"/><circle cx="${x}" cy="${y}" r="10" fill="#ffc768" opacity=".35"/>`; };
  bulbRow(186, 814, 846); bulbRow(186, 814, 1006);
  for (let y = 868; y <= 986; y += 22) { bulbs += `<circle cx="176" cy="${y}" r="4.2" fill="#ffe3a4"/><circle cx="824" cy="${y}" r="4.2" fill="#ffe3a4"/>`; }
  let reflections = '';
  for (let i = 0; i < 26; i++) {
    const x = 180 + rand() * 640;
    reflections += `<rect x="${f(x)}" y="${f(1200 + rand() * 40)}" width="${(2 + rand() * 5).toFixed(1)}" height="${f(120 + rand() * 180)}" fill="#ffc46e" opacity="${(0.06 + rand() * 0.16).toFixed(2)}"/>`;
  }
  const sibling = (x, lean, look = false) => `
    <g transform="translate(${x} 0)">
      <path d="M-22 1196 L-20 1112 C-20 1096 -12 1088 -2 1086 C-10 1080 -12 1068 -6 1060 C2 1052 14 1056 16 1068 C18 1078 12 1084 6 1088 C16 1090 22 1098 22 1112 L24 1196 Z" fill="#081418"/>
      ${look ? '' : `<path d="M${-66 + lean} 1062 Q${0 + lean} 1000 ${66 + lean} 1062 Z" fill="#12343b"/><line x1="${lean}" y1="1028" x2="0" y2="1110" stroke="#081418" stroke-width="4"/>`}
    </g>`;
  return svg(W, H, `
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04121a"/><stop offset=".5" stop-color="#0c2a33"/><stop offset="1" stop-color="#07161c"/></linearGradient>
      <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b3b41"/><stop offset="1" stop-color="#0c2127"/></linearGradient>
      <linearGradient id="board" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6de"/><stop offset="1" stop-color="#f1dcb0"/></linearGradient>
      <radialGradient id="spill" cx="500" cy="1060" r="420" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffc46e" stop-opacity=".5"/><stop offset="1" stop-color="#ffc46e" stop-opacity="0"/></radialGradient>
      <linearGradient id="street" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0d2429"/><stop offset="1" stop-color="#050d10"/></linearGradient>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
      ${grain('g', 0.12)}
    </defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <!-- 1930s facade with a stepped deco top -->
    <path d="M130 1200 L130 640 L260 640 L260 590 L380 590 L380 540 L620 540 L620 590 L740 590 L740 640 L870 640 L870 1200 Z" fill="url(#face)"/>
    ${[300, 360, 420, 480, 540, 600, 660].map((x) => `<rect x="${x}" y="600" width="26" height="160" rx="13" fill="#0a1b20" opacity=".8"/>`).join('')}
    <rect x="130" y="780" width="740" height="6" fill="#2f5a60" opacity=".7"/>
    <!-- the marquee canopy: lit bulbs, blank letter board -->
    <rect x="160" y="832" width="680" height="190" rx="10" fill="#1d1a14"/>
    <rect x="200" y="866" width="600" height="122" rx="6" fill="url(#board)"/>
    ${bulbs}
    <rect x="150" y="1018" width="700" height="18" fill="#140f0a"/>
    <circle cx="500" cy="1060" r="420" fill="url(#spill)"/>
    <!-- doors and box office -->
    <rect x="410" y="1060" width="180" height="140" fill="#2a1d10" opacity=".9"/><rect x="420" y="1070" width="160" height="126" fill="#ffcf85" opacity=".45"/>
    <path d="M0 1196 L1000 1196 L1000 1500 L0 1500 Z" fill="url(#street)"/>
    ${reflections}
    <g filter="url(#soft)"><rect x="200" y="1210" width="600" height="60" fill="#ffc46e" opacity=".12"/></g>
    ${sibling(372, -8)}${sibling(500, 0, true)}${sibling(628, 10)}
    ${rain}
    <rect width="${W}" height="${H}" filter="url(#g)" opacity=".55"/>`);
}

// ------------------------------------------------------------------- cast

const CAST_TONES = [
  ['#1c2a3d', '#6f8fb3', '#f0b36a'], // slate blue, amber rim
  ['#2a1a2e', '#9b6f8f', '#f2c1a4'], // plum, rose
  ['#1d2226', '#8f9ca6', '#dfe8ef'], // steel, ice
  ['#24231a', '#8c8660', '#e8cf95'], // olive, brass
  ['#12272a', '#5f9a96', '#bfe9df'], // teal, mint
  ['#2c1717', '#a8665a', '#f4c29e'], // oxblood, peach
];

/** A tasteful duotone head-and-shoulders silhouette, not a face. */
export function castPortrait(i) {
  const W = 800, H = 1200;
  const [dark, mid, rim] = CAST_TONES[i % CAST_TONES.length];
  // Hair and features extend the outline of `person` below (head top at y 372,
  // widest around y 560, x 288..512), so they read in pure silhouette.
  const curls = Array.from({ length: 9 }, (_, k) => {
    const a = Math.PI * (0.04 + (0.92 * k) / 8);
    return `<circle cx="${f(400 - Math.cos(a) * 112)}" cy="${f(528 - Math.sin(a) * 150)}" r="38"/>`;
  }).join('');
  const braid = Array.from({ length: 7 }, (_, k) => `<ellipse cx="${f(512 + k * 9)}" cy="${f(600 + k * 58)}" rx="30" ry="36"/>`).join('');
  const hair = [
    `<g fill="${dark}">${curls}</g>`,
    `<ellipse cx="400" cy="462" rx="120" ry="96" fill="${dark}"/><circle cx="292" cy="622" r="9" fill="${rim}"/><circle cx="508" cy="622" r="9" fill="${rim}"/>`,
    `<circle cx="400" cy="352" r="44" fill="${dark}"/>`,
    `<path d="M300 590 C302 690 346 770 400 772 C454 770 498 690 500 590 C478 650 446 676 400 676 C354 676 322 650 300 590 Z" fill="${dark}"/><path d="M296 470 C300 400 346 362 400 362 C454 362 500 400 504 470 Z" fill="${dark}"/>`,
    `<path d="M294 480 C290 420 312 380 340 362 L352 330 L372 356 L398 318 L414 354 L446 326 L452 362 C488 380 510 420 506 480 Z" fill="${dark}"/>`,
    `<path d="M292 520 C286 430 334 370 400 368 C466 370 514 430 508 520 C486 470 450 446 400 444 C350 446 314 470 292 520 Z" fill="${dark}"/><g fill="${dark}">${braid}</g>`,
  ][i % 6];
  const person =
    'M120 1200 C124 1010 214 900 330 872 C352 866 360 846 360 820 L360 736 C318 706 290 648 288 572 C284 470 330 372 400 372 C470 372 516 470 512 572 C510 648 482 706 440 736 L440 820 C440 846 448 866 470 872 C586 900 676 1010 680 1200 Z';
  return svg(W, H, `
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
      <radialGradient id="key" cx=".26" cy=".2" r=".75"><stop offset="0" stop-color="${rim}" stop-opacity=".5"/><stop offset="1" stop-color="${rim}" stop-opacity="0"/></radialGradient>
      <linearGradient id="rim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${rim}" stop-opacity=".95"/><stop offset=".14" stop-color="${rim}" stop-opacity="0"/></linearGradient>
      <radialGradient id="vig" cx=".5" cy=".4" r=".8"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></radialGradient>
      ${grain('g', 0.1)}
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect width="${W}" height="${H}" fill="url(#key)"/>
    <g transform="translate(0 -40)">
      <path d="${person}" fill="${dark}"/>
      ${hair}
      <path d="${person}" fill="none" stroke="url(#rim)" stroke-width="12"/>
    </g>
    <rect width="${W}" height="${H}" fill="url(#vig)"/>
    <rect width="${W}" height="${H}" filter="url(#g)" opacity=".5"/>`);
}

// -------------------------------------------------------- streaming marks

/** Original marks for the fictional services on the facts card. */
export function providerMark(name) {
  const S = 144;
  if (name === 'Lumen+') {
    return svg(S, S, `<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5b4bd6"/><stop offset="1" stop-color="#2b1f7a"/></linearGradient></defs>
      <rect width="${S}" height="${S}" fill="url(#b)"/>
      <circle cx="64" cy="80" r="30" fill="none" stroke="#fff" stroke-width="9"/><circle cx="64" cy="80" r="11" fill="#ffd66e"/>
      <path d="M104 34 V60 M91 47 H117" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`);
  }
  if (name === 'Reelhouse') {
    return svg(S, S, `<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f08a5d"/><stop offset="1" stop-color="#c2452f"/></linearGradient></defs>
      <rect width="${S}" height="${S}" fill="url(#b)"/>
      <circle cx="72" cy="72" r="40" fill="#fff"/>
      ${[0, 1, 2, 3, 4].map((k) => { const a = (k / 5) * Math.PI * 2 - Math.PI / 2; return `<circle cx="${f(72 + Math.cos(a) * 22)}" cy="${f(72 + Math.sin(a) * 22)}" r="8" fill="#d95c3f"/>`; }).join('')}
      <circle cx="72" cy="72" r="5" fill="#d95c3f"/>`);
  }
  // Northlight
  return svg(S, S, `<defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f3b46"/><stop offset="1" stop-color="#0a2027"/></linearGradient><linearGradient id="a" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5fe0b8"/><stop offset="1" stop-color="#6fa8ff"/></linearGradient></defs>
    <rect width="${S}" height="${S}" fill="url(#b)"/>
    <path d="M18 104 C46 86 98 86 126 104" fill="none" stroke="url(#a)" stroke-width="7" stroke-linecap="round"/>
    <path d="M72 30 L78 58 L104 64 L78 70 L72 96 L66 70 L40 64 L66 58 Z" fill="#fff"/>`);
}
