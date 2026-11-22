// Renders www/icons/icon.svg to the PNG sizes the PWA manifest, iOS and
// Android need. Uses Playwright's Chromium:  node scripts/make-icons.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const svg = readFileSync(fileURLToPath(new URL('../www/icons/icon.svg', import.meta.url)), 'utf8');
const out = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

// [path, size, inset (fraction of size kept as plain background), rounded?]
const TARGETS = [
  ['www/icons/icon-192.png', 192, 0, true],
  ['www/icons/icon-512.png', 512, 0, true],
  ['www/icons/apple-touch-icon.png', 180, 0, false],
  ['www/icons/icon-maskable-512.png', 512, 0.1, false],
];
const ANDROID = [['mdpi', 48, 108], ['hdpi', 72, 162], ['xhdpi', 96, 216], ['xxhdpi', 144, 324], ['xxxhdpi', 192, 432]];
const withAndroid = process.argv.includes('--android');
if (withAndroid) {
  for (const [d, legacy, fg] of ANDROID) {
    TARGETS.push([`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, legacy, 0, true]);
    TARGETS.push([`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, legacy, 0, 'circle']);
    TARGETS.push([`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, fg, 0.18, 'fg']);
  }
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const [path, size, inset, shape] of TARGETS) {
  // Full-bleed square art: strip the rounded corners so the OS can mask it.
  let art = svg.replace(/rx="116"/g, shape === true ? 'rx="116"' : 'rx="0"');
  let bg = 'transparent';
  if (shape === 'fg') {
    // Adaptive-icon foreground: just the chart, the background layer is a colour.
    art = art.replace(/<rect width="512" height="512"[^>]*\/>/g, '');
  } else if (inset > 0 || shape === false) {
    bg = '#2a6fc7';
  }
  const radius = shape === 'circle' ? '50%' : '0';
  const pad = Math.round(size * inset);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:${bg}">
    <div style="width:${size}px;height:${size}px;display:grid;place-items:center;overflow:hidden;border-radius:${radius};background:${shape === false || inset ? 'linear-gradient(135deg,#3b8cf0,#1a4f9e)' : 'transparent'}">
      <div style="width:${size - 2 * pad}px;height:${size - 2 * pad}px">${art.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
    </div></body></html>`);
  mkdirSync(out(path).replace(/\/[^/]+$/, ''), { recursive: true });
  await page.screenshot({ path: out(path), omitBackground: bg === 'transparent', clip: { x: 0, y: 0, width: size, height: size } });
  console.log('wrote', path);
}
await browser.close();
