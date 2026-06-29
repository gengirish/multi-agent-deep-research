/**
 * Rasterize the brand SVG icons into PNGs for PWA installability.
 *
 * Why PNG: iOS Safari ignores SVG apple-touch-icons, and several Android
 * launchers render PNG more reliably than SVG manifest icons. We keep the
 * SVGs as the source of truth and generate PNGs from them — re-run after
 * editing the SVGs:  `node scripts/generate-icons.mjs`
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS = join(__dirname, "..", "public", "icons");
const PUBLIC = join(__dirname, "..", "public");

async function render(svgPath, outPath, size, background) {
  const svg = await readFile(svgPath);
  let pipeline = sharp(svg, { density: 384 }).resize(size, size, {
    fit: "contain",
    background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (background) {
    pipeline = pipeline.flatten({ background });
  }
  const png = await pipeline.png().toBuffer();
  await writeFile(outPath, png);
  // eslint-disable-next-line no-console
  console.log(`✓ ${outPath.replace(join(__dirname, ".."), ".")}  (${size}x${size})`);
}

const rounded = join(ICONS, "icon-512.svg");
const maskable = join(ICONS, "icon-maskable-512.svg");

await render(rounded, join(ICONS, "icon-192.png"), 192);
await render(rounded, join(ICONS, "icon-512.png"), 512);
await render(maskable, join(ICONS, "icon-maskable-192.png"), 192);
await render(maskable, join(ICONS, "icon-maskable-512.png"), 512);
// Apple touch icon: opaque, full-bleed (iOS applies its own corner mask).
await render(maskable, join(PUBLIC, "apple-touch-icon.png"), 180, {
  r: 15,
  g: 23,
  b: 42,
});
// Favicon PNG fallback for older browsers.
await render(rounded, join(PUBLIC, "favicon-32.png"), 32);

// eslint-disable-next-line no-console
console.log("All PWA icons generated.");
