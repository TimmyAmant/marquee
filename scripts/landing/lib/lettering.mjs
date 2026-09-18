// Key-art lettering over each poster's (text-free) artwork, so titles are
// always spelled right. Each returns a full HTML page rendered at 1000x1500.

const FONTS =
  'https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400;600&family=Cormorant+Garamond:ital,wght@0,600;1,500&family=Limelight&display=block';

const page = (art, css, body) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FONTS}">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1000px;height:1500px;overflow:hidden;background:#000}
.art{position:absolute;inset:0;background:url("${art}") center/cover no-repeat}
.billing{position:absolute;left:0;right:0;bottom:64px;display:grid;justify-items:center;gap:9px;opacity:.55}
.billing i{display:block;height:3px;border-radius:2px;background:currentColor}
${css}
</style></head><body><div class="art"></div>${body}
<div class="billing"><i style="width:560px"></i><i style="width:500px"></i><i style="width:330px"></i></div>
</body></html>`;

/** Emberline: wide-tracked light caps, cold white with a warm glow. */
export const emberline = (art) =>
  page(
    art,
    `.tag{position:absolute;top:118px;left:0;right:0;text-align:center;font:400 21px/1 'Josefin Sans';letter-spacing:.5em;padding-left:.5em;color:#cfdcf0;opacity:.85;text-transform:uppercase}
     .title{position:absolute;top:176px;left:0;right:0;text-align:center;font:300 98px/1 'Josefin Sans';letter-spacing:.3em;padding-left:.3em;color:#f3f7ff;
       text-shadow:0 0 34px rgba(247,166,74,.38),0 2px 10px rgba(0,0,0,.4)}
     .billing{color:#c9d6ea}`,
    `<div class="tag">Follow the light</div><div class="title">EMBERLINE</div>`,
  );

/** Paper Harbor: an old-style italic, plum on the pastel sky. */
export const paperHarbor = (art) =>
  page(
    art,
    `.title{position:absolute;top:196px;left:0;right:0;text-align:center;font:italic 500 138px/1 'Cormorant Garamond';letter-spacing:-.005em;color:#3b2748}
     .tag{position:absolute;top:366px;left:0;right:0;text-align:center;font:600 19px/1 'Cormorant Garamond';letter-spacing:.34em;padding-left:.34em;color:#4f3a5c;text-transform:uppercase}
     .billing{color:#fbf6ef}`,
    `<div class="title">Paper Harbor</div><div class="tag">Some letters take thirty years to arrive</div>`,
  );

/** Holloway Picture House: deco display lettering, warm under the rain. */
export const holloway = (art) =>
  page(
    art,
    `.title{position:absolute;top:184px;left:0;right:0;text-align:center;font:400 128px/1 'Limelight';letter-spacing:.04em;padding-left:.04em;color:#f6e3bd;
       text-shadow:0 0 26px rgba(255,196,110,.45),0 3px 12px rgba(0,0,0,.5)}
     .sub{position:absolute;top:336px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:22px;font:400 30px/1 'Josefin Sans';letter-spacing:.56em;padding-left:.56em;color:#cfe7e6}
     .sub::before,.sub::after{content:"";width:64px;height:2px;background:#cfe7e6;opacity:.7}
     .billing{color:#cfe7e6}`,
    `<div class="title">HOLLOWAY</div><div class="sub">PICTURE HOUSE</div>`,
  );
