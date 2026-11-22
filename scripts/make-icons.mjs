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
// Android splash screens: the icon centred on the app's light background.
if (withAndroid) {
  const res = 'android/app/src/main/res';
  const SPLASH = [
    ['drawable', 480, 320], ['drawable-land-mdpi', 480, 320], ['drawable-land-hdpi', 800, 480], ['drawable-land-xhdpi', 1280, 720],
    ['drawable-land-xxhdpi', 1600, 960], ['drawable-land-xxxhdpi', 1920, 1280], ['drawable-port-mdpi', 320, 480],
    ['drawable-port-hdpi', 480, 800], ['drawable-port-xhdpi', 720, 1280], ['drawable-port-xxhdpi', 960, 1600], ['drawable-port-xxxhdpi', 1280, 1920],
  ];
  for (const [dir, w, hgt] of SPLASH) {
    const s = Math.round(Math.min(w, hgt) * 0.28);
    await page.setViewportSize({ width: w, height: hgt });
    await page.setContent(`<html><body style="margin:0;width:${w}px;height:${hgt}px;display:grid;place-items:center;background:#f4f3ef;font-family:system-ui,sans-serif">
      <div style="display:grid;justify-items:center;gap:${Math.round(s * 0.12)}px">
        <div style="width:${s}px;height:${s}px;filter:drop-shadow(0 ${s * 0.04}px ${s * 0.1}px rgba(29,85,168,.3))">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div>
        <div style="font-weight:750;font-size:${Math.round(s * 0.17)}px;color:#0b0b0b;letter-spacing:-0.01em">Probability Lab</div>
      </div></body></html>`);
    await page.screenshot({ path: out(`${res}/${dir}/splash.png`), clip: { x: 0, y: 0, width: w, height: hgt } });
  }
  console.log('wrote Android splash screens');
}
await browser.close();
