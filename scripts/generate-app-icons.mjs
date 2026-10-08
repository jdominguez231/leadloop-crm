// Renders the LeadLoop logo SVG into every PNG in public/appIcon/ (same file
// names and sizes as before) and rebuilds public/favicon.ico (PNG-in-ICO).
// Usage: node scripts/generate-app-icons.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const svg = fs.readFileSync(
  path.join(
    root,
    "src/components/atomic-crm/root/logos/logo_leadloop_dark.svg",
  ),
  "utf8",
);
const iconDir = path.join(root, "public/appIcon");

// Maskable icons get a full-bleed ground plus safe-zone padding (inner 80%).
const maskableSvg = svg
  .replace(/<rect[^>]*\/>/, '<rect width="800" height="800" fill="#0E1215"/>')
  .replace(
    /<svg ([^>]*)>/,
    '<svg $1><g transform="translate(80 80) scale(0.8)">',
  )
  .replace(/<\/svg>\s*$/, "</g></svg>");

const sizeOf = (name) => {
  const m = name.match(/(\d+)\.png$/);
  if (!m) throw new Error("Cannot read size from " + name);
  return Number(m[1]);
};

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(markup, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${markup.replace(
      "<svg ",
      `<svg style="display:block;width:${size}px;height:${size}px" `,
    )}</body></html>`,
  );
  return page.screenshot({ omitBackground: true, type: "png" });
}

const files = fs.readdirSync(iconDir).filter((f) => f.endsWith(".png"));
for (const f of files) {
  const maskable = f.startsWith("maskable_icon");
  const size = f === "maskable_icon.png" ? 1024 : sizeOf(f);
  fs.writeFileSync(
    path.join(iconDir, f),
    await render(maskable ? maskableSvg : svg, size),
  );
  process.stdout.write(`wrote ${f} ${size}\n`);
}

// favicon.ico: ICONDIR + entries pointing at embedded PNGs (valid since Vista).
const icoSizes = [16, 24, 32, 48];
const pngs = [];
for (const s of icoSizes) pngs.push(await render(svg, s));
await browser.close();
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(icoSizes.length, 4);
let offset = 6 + 16 * icoSizes.length;
const entries = icoSizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s, 0);
  e.writeUInt8(s, 1);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
fs.writeFileSync(
  path.join(root, "public/favicon.ico"),
  Buffer.concat([header, ...entries, ...pngs]),
);
process.stdout.write(`wrote favicon.ico ${icoSizes.join(",")}\n`);
