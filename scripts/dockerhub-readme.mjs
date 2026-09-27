// Docker Hub shows the README without GitHub's context, so relative links and
// images (docs/…, ./public/…) would break there. This writes a copy with every
// relative URL made absolute: images to raw.githubusercontent.com, links to
// the file on github.com. Used by .github/workflows/dockerhub-readme.yml.
import { readFileSync, writeFileSync } from "node:fs";

const repo = "TimmyAmant/marquee";
const branch = "main";
const raw = `https://raw.githubusercontent.com/${repo}/${branch}/`;
const blob = `https://github.com/${repo}/blob/${branch}/`;

const isRelative = (url) => !/^([a-z]+:|#|\/\/)/i.test(url);
const clean = (url) => url.replace(/^\.\//, "").replace(/^\//, "");

let text = readFileSync("README.md", "utf8");
// Markdown images first, then links (images start with "!").
text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => (isRelative(url) ? `![${alt}](${raw}${clean(url)})` : m));
text = text.replace(/(^|[^!])\[([^\]]*)\]\(([^)\s]+)\)/g, (m, pre, label, url) =>
  isRelative(url) ? `${pre}[${label}](${blob}${clean(url)})` : m,
);
// HTML <img src> and <a href>.
text = text.replace(/(<img[^>]*\ssrc=")([^"]+)(")/g, (m, a, url, b) => (isRelative(url) ? `${a}${raw}${clean(url)}${b}` : m));
text = text.replace(/(<a[^>]*\shref=")([^"]+)(")/g, (m, a, url, b) => (isRelative(url) ? `${a}${blob}${clean(url)}${b}` : m));

writeFileSync(process.argv[2] ?? "README.dockerhub.md", text);
