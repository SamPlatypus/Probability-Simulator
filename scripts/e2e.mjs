// End-to-end checks in headless Chromium at phone size.
//   node scripts/e2e.mjs [--screenshots]
// Requires Playwright (`npm i -D playwright` if it isn't installed globally).
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { serve } from './serve.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SHOTS = process.argv.includes('--screenshots');
const shotDir = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
if (SHOTS) mkdirSync(shotDir, { recursive: true });

const PORT = 8900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}/`;
const server = await serve(PORT);
const browser = await chromium.launch();
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures++;
    console.log(`  ✗ ${name}\n    ${e.message.split('\n').join('\n    ')}`);
  }
}

async function newPage(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: true, hasTouch: true, ...opts,
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  return { ctx, page };
}

const idle = (page, timeout = 30000) => page.waitForFunction(() => window.probLab.runner.state === 'idle' && window.probLab.runner.inFlight === 0, null, { timeout });
const n = (page) => page.evaluate(() => window.probLab.session.results.n);

console.log('Probability Lab e2e');
const { ctx, page } = await newPage();
await page.goto(BASE);

await check('welcome sheet appears on first launch and closes', async () => {
  await page.waitForSelector('#sheet:not([hidden])');
  await page.click('text=Start experimenting');
  await page.waitForSelector('#sheet', { state: 'hidden' });
});

for (const id of ['coins', 'dice', 'spinner', 'marbles', 'cards', 'galton', 'monty', 'birthday']) {
  await check(`${id}: animated trial lands and counts exactly once`, async () => {
    await page.click(`.mode-tab[data-mode="${id}"]`);
    await page.click('#resetBtn');
    await page.fill('#speed', '3'); // "Fast"
    await page.dispatchEvent('#speed', 'input');
    await page.click('#trialChips .chip[data-v="1"]');
    await page.click('#runBtn');
    await idle(page);
    assert.equal(await n(page), 1);
    const cap = await page.textContent('#capMain');
    assert.ok(cap && cap.length > 0, 'caption shows the result');
  });
  await check(`${id}: 10,000 trials at Max, stats agree with the counts`, async () => {
    await page.fill('#speed', '7');
    await page.dispatchEvent('#speed', 'input');
    await page.click('#trialChips .chip[data-v="10000"]');
    await page.click('#runBtn');
    await idle(page);
    assert.equal(await n(page), 10001);
    await page.waitForTimeout(200);
    const tiles = await page.textContent('#tiles');
    assert.match(tiles, /10,001/);
    const sum = await page.evaluate(() => Array.from(window.probLab.session.results.counts).reduce((a, b) => a + b, 0));
    assert.equal(sum, 10001);
    if (SHOTS && ['dice', 'galton', 'cards', 'monty'].includes(id)) {
      await page.screenshot({ path: `${shotDir}phone-${id}.png` });
    }
  });
}

await check('tapping a bar changes the watched event', async () => {
  await page.click('.mode-tab[data-mode="dice"]');
  await page.locator('#hist').scrollIntoViewIfNeeded();
  const box = await page.locator('#hist').boundingBox();
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.6);
  await page.waitForTimeout(150);
  const ev = await page.textContent('#readout');
  assert.match(ev, /Sum = (10|11|12)/);
  await page.click('#eventOps .seg-btn:has-text("≥")');
  await page.waitForFunction(() => document.querySelector('#readout').textContent.includes('Sum ≥'), null, { timeout: 3000 });
});

await check('prediction: sketch, done, scored against theory', async () => {
  await page.click('#predictBtn');
  await page.waitForSelector('#predictBar:not([hidden])');
  await page.locator('#hist').scrollIntoViewIfNeeded();
  const box = await page.locator('#hist').boundingBox();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6);
  await page.mouse.down();
  for (let i = 0; i <= 20; i++) await page.mouse.move(box.x + box.width * (0.2 + i * 0.035), box.y + box.height * (0.6 - 0.25 * Math.sin((i / 20) * Math.PI)));
  await page.mouse.up();
  assert.match(await page.textContent('#predictTotal'), /Adds up to [1-9]/);
  await page.click('#predictDone');
  await page.waitForTimeout(150);
  assert.match(await page.textContent('#checks'), /Your prediction/);
  assert.match(await page.textContent('#legend'), /Your guess/);
});

await check('reset clears results and Undo restores them', async () => {
  const before = await n(page);
  assert.ok(before > 0);
  await page.click('#resetBtn');
  assert.equal(await n(page), 0);
  await page.click('#toastAction');
  assert.equal(await n(page), before);
});

await check('changing setup starts a fresh run with a new theory', async () => {
  await page.click('.mode-tab[data-mode="coins"]');
  await page.click('.ctl-stepper button[aria-label^="More"]');
  const k = await page.evaluate(() => window.probLab.session.model.outcomes.length);
  assert.equal(k, 3);
  assert.equal(await n(page), 0);
  assert.match(await page.textContent('#theoryLabel'), /Binomial/);
});

await check('pause and resume a long run', async () => {
  await page.fill('#speed', '4');
  await page.dispatchEvent('#speed', 'input');
  await page.click('#trialChips .chip[data-v="1000"]');
  await page.click('#runBtn');
  await page.waitForTimeout(400);
  await page.click('#runBtn');
  assert.equal(await page.evaluate(() => window.probLab.runner.state), 'paused');
  const mid = await n(page);
  assert.ok(mid > 0 && mid < 1000, `mid-run count ${mid}`);
  assert.match(await page.textContent('#runLabel'), /Resume/);
  await page.fill('#speed', '7');
  await page.dispatchEvent('#speed', 'input');
  await page.click('#runBtn');
  await idle(page);
  assert.equal(await n(page), 1000);
});

await check('mystery dice: reveal tells the truth', async () => {
  await page.click('.mode-tab[data-mode="dice"]');
  await page.click('.seg-btn:has-text("Mystery")');
  await page.click('button:has-text("Reveal the dice")');
  assert.match(await page.textContent('#toastText'), /They were (loaded|fair)/);
});

await check('Learn sheet: lesson, basics and a Try-this preset', async () => {
  await page.click('#learnBtn');
  await page.waitForSelector('#sheet:not([hidden])');
  assert.match(await page.textContent('#sheetBody'), /The big idea/);
  await page.click('#sheetBody .seg-btn:has-text("Basics")');
  assert.match(await page.textContent('#sheetBody'), /Law of Large Numbers/);
  await page.click('#sheetBody .seg-btn:has-text("This experiment")');
  await page.click('.try >> nth=1');
  await page.waitForSelector('#sheet', { state: 'hidden' });
  const cfg = await page.evaluate(() => window.probLab.session.config);
  assert.equal(cfg.dice, 5);
});

await check('settings: fixed seed makes runs repeatable', async () => {
  await page.click('#settingsBtn');
  await page.click('#sheetBody .seg-btn:has-text("Fixed")');
  await page.click('#sheetClose');
  await page.click('.mode-tab[data-mode="coins"]');
  const run = async () => {
    await page.click('#resetBtn');
    await page.click('#trialChips .chip[data-v="1000"]');
    await page.click('#runBtn');
    await idle(page);
    return page.evaluate(() => Array.from(window.probLab.session.results.counts));
  };
  const a = await run();
  const b = await run();
  assert.deepEqual(a, b);
  await page.click('#settingsBtn');
  await page.click('#sheetBody .seg-btn:has-text("Random")');
  await page.click('#sheetClose');
});

await check('no console errors', async () => { assert.deepEqual(page.errors, []); });
await ctx.close();

// Offline: load once, let the service worker cache everything, then cut the network.
await check('works offline after the first visit (service worker)', async () => {
  const { ctx: c2, page: p2 } = await newPage();
  await p2.goto(BASE);
  await p2.evaluate(() => navigator.serviceWorker.ready);
  await p2.waitForFunction(async () => {
    const keys = await caches.keys();
    if (!keys.length) return false;
    const cache = await caches.open(keys[0]);
    return (await cache.keys()).length > 40;
  }, null, { timeout: 15000 });
  await c2.setOffline(true);
  await p2.reload();
  await p2.waitForSelector('.mode-tab');
  await p2.click('#sheetClose').catch(() => {});
  await p2.click('.mode-tab[data-mode="galton"]');
  await p2.evaluate(() => { window.probLab.runner.setSpeed(7); window.probLab.runner.start(2000); });
  await idle(p2);
  assert.equal(await n(p2), 2000);
  assert.deepEqual(p2.errors, []);
  await c2.close();
});

if (SHOTS) {
  await check('screenshots (light, dark, tablet)', async () => {
    const { ctx: c3, page: p3 } = await newPage({ colorScheme: 'dark' });
    await p3.goto(BASE);
    await p3.click('text=Start experimenting');
    await p3.click('.mode-tab[data-mode="spinner"]');
    await p3.evaluate(() => { window.probLab.applyConfig({ weights: [1, 2, 3] }); });
    await p3.evaluate(() => { window.probLab.runner.setSpeed(7); window.probLab.runner.start(1200); });
    await idle(p3);
    await p3.waitForTimeout(500);
    await p3.screenshot({ path: `${shotDir}phone-dark-spinner.png` });
    await p3.evaluate(() => window.scrollTo(0, 820));
    await p3.waitForTimeout(300);
    await p3.screenshot({ path: `${shotDir}phone-dark-stats.png` });
    await c3.close();
    const { ctx: c4, page: p4 } = await newPage({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });
    await p4.goto(BASE);
    await p4.click('text=Start experimenting');
    await p4.click('.mode-tab[data-mode="galton"]');
    await p4.evaluate(() => { window.probLab.runner.setSpeed(7); window.probLab.runner.start(4000); });
    await idle(p4);
    await p4.waitForTimeout(600);
    await p4.screenshot({ path: `${shotDir}desktop-galton.png` });
    await c4.close();
  });
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll e2e checks passed');
process.exit(failures ? 1 : 0);
