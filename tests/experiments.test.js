import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXPERIMENTS, getExperiment, resolveConfig } from '../www/js/experiments/index.js';
import { classifyHand, HAND_CATEGORIES } from '../www/js/experiments/cards.js';
import { createRng } from '../www/js/core/rng.js';
import { chiSquareTest } from '../www/js/core/prob.js';
import { eventMask, sanitizeEvent, describeEvent, tapEvent, eventProbability } from '../www/js/core/events.js';
import { Results } from '../www/js/core/results.js';

// Configurations to exercise; each is checked for a valid theory and a
// simulation that agrees with it.
const CASES = {
  coins: [{}, { coins: 1, pHeads: 0.7 }, { coins: 5, pHeads: 0.5 }, { coins: 12, pHeads: 0.25 }],
  dice: [{}, { dice: 1, sides: 6 }, { dice: 3, sides: 6, stat: 'max' }, { dice: 2, sides: 20, stat: 'min' },
    { dice: 2, sides: 6, die: 'loaded' }, { dice: 4, sides: 8 }],
  spinner: [{}, { weights: [1, 2, 3] }, { weights: [7, 1] }, { weights: [1, 1, 1, 1, 1, 1, 1, 1] }],
  marbles: [{}, { draws: 4, replace: true }, { blue: 5, orange: 5, teal: 0, draws: 5, replace: false },
    { blue: 2, orange: 1, teal: 1, draws: 3, replace: false }],
  cards: [{}, { measure: 'color' }, { measure: 'rank' }, { measure: 'kind' }, { measure: 'hand' }],
  galton: [{}, { rows: 2 }, { rows: 16, p: 0.7 }],
  monty: [{}, { doors: 5, host: 'all' }, { doors: 5, host: 'one' }, { doors: 8, host: 'one' }],
  birthday: [{}, { people: 5, days: 12 }, { people: 40, days: 365 }, { people: 4, days: 7 }, { people: 8, days: 7 }],
};

test('every experiment has the parts the app relies on', () => {
  assert.equal(EXPERIMENTS.length, 8);
  for (const e of EXPERIMENTS) {
    for (const key of ['id', 'name', 'icon', 'blurb', 'defaults', 'controls', 'build', 'learn']) {
      assert.ok(e[key] !== undefined, `${e.id} missing ${key}`);
    }
    assert.ok(e.learn.tryThis.length >= 3, `${e.id} needs try-this ideas`);
    assert.ok(Array.isArray(e.controls(e.defaults)));
    assert.ok(CASES[e.id], `no test cases for ${e.id}`);
  }
});

for (const exp of EXPERIMENTS) {
  for (const patch of CASES[exp.id]) {
    test(`${exp.id} ${JSON.stringify(patch)}: theory is a distribution and simulation matches it`, () => {
      const cfg = resolveConfig(exp, { ...exp.defaults, ...patch });
      const model = exp.build(cfg);
      const k = model.outcomes.length;
      assert.equal(model.probs.length, k);
      const total = model.probs.reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(total - 1) < 1e-9, `probs sum to ${total}`);
      assert.ok(model.probs.every((p) => p >= 0 && p <= 1));
      if (model.numeric) assert.ok(model.outcomes.every((o) => typeof o.value === 'number'));

      // Sampling path (used for fast runs).
      const rng = createRng(`test-${exp.id}-${JSON.stringify(patch)}`);
      const n = exp.id === 'cards' && cfg.measure === 'hand' ? 400000 : 60000;
      const counts = new Array(k).fill(0);
      for (let i = 0; i < n; i++) {
        const idx = model.sample(rng);
        assert.ok(Number.isInteger(idx) && idx >= 0 && idx < k, `bad index ${idx}`);
        counts[idx]++;
      }
      const t = chiSquareTest(counts, model.probs, n);
      if (t.reason === 'certain') {
        assert.equal(counts[model.probs.findIndex((p) => p === 1)], n);
        return;
      }
      assert.ok(t.ok && t.p > 1e-4, `sample() disagrees with theory: χ²=${t.stat?.toFixed(1)} df=${t.df} p=${t.p}`);

      // Animated-trial path must agree too.
      const counts2 = new Array(k).fill(0);
      const m = 20000;
      for (let i = 0; i < m; i++) counts2[model.trial(rng).index]++;
      const t2 = chiSquareTest(counts2, model.probs, m);
      assert.ok(t2.ok && t2.p > 1e-4, `trial() disagrees with theory: p=${t2.p}`);
    });
  }
}

test('trial details are consistent with the recorded outcome', () => {
  const rng = createRng('details');
  const coins = getExperiment('coins').build({ coins: 6, pHeads: 0.5 });
  for (let i = 0; i < 200; i++) {
    const t = coins.trial(rng);
    assert.equal(t.faces.filter(Boolean).length, t.index);
  }
  const dice = getExperiment('dice').build({ ...getExperiment('dice').defaults, dice: 3, sides: 6, stat: 'sum' });
  for (let i = 0; i < 200; i++) {
    const t = dice.trial(rng);
    assert.equal(dice.outcomes[t.index].value, t.faces.reduce((a, b) => a + b, 0));
  }
  const spin = getExperiment('spinner').build({ weights: [1, 2, 3] });
  for (let i = 0; i < 200; i++) {
    const t = spin.trial(rng);
    const lo = t.index === 0 ? 0 : spin.bounds[t.index - 1];
    assert.ok(t.angle >= lo && t.angle < spin.bounds[t.index]);
  }
  const monty = getExperiment('monty').build({ doors: 6, host: 'one' });
  for (let i = 0; i < 500; i++) {
    const t = monty.trial(rng);
    assert.ok(!t.opened.includes(t.car), 'host never opens the car');
    assert.ok(!t.opened.includes(t.pick), 'host never opens your door');
    assert.notEqual(t.switchTo, t.pick);
    assert.ok(!t.opened.includes(t.switchTo));
  }
  const bag = getExperiment('marbles').build({ blue: 2, orange: 2, teal: 1, draws: 5, replace: false });
  for (let i = 0; i < 100; i++) {
    const t = bag.trial(rng);
    assert.equal(new Set(t.ids).size, 5, 'without replacement never repeats a marble');
    assert.equal(t.index, 2);
  }
  const bday = getExperiment('birthday').build({ people: 30, days: 365 });
  for (let i = 0; i < 200; i++) {
    const t = bday.trial(rng);
    assert.equal(t.index, new Set(t.list).size < t.list.length ? 1 : 0);
  }
});

test('poker hand classifier reproduces exact counts over all 2,598,960 hands', () => {
  const counts = new Array(9).fill(0);
  const h = [0, 0, 0, 0, 0];
  for (let a = 0; a < 48; a++) for (let b = a + 1; b < 49; b++) for (let c = b + 1; c < 50; c++)
    for (let d = c + 1; d < 51; d++) for (let e = d + 1; e < 52; e++) {
      h[0] = a; h[1] = b; h[2] = c; h[3] = d; h[4] = e;
      counts[classifyHand(h)]++;
    }
  assert.deepEqual(counts, HAND_CATEGORIES.map((x) => x.ways));
});

test('events: masks, descriptions and tapping', () => {
  const model = getExperiment('dice').build({ ...getExperiment('dice').defaults });
  const ev = sanitizeEvent(model, model.defaultEvent);
  assert.equal(describeEvent(model, ev), 'Sum = 7');
  const ge = { type: 'cmp', op: 'ge', anchor: model.outcomes.findIndex((o) => o.value === 10) };
  assert.ok(Math.abs(eventProbability(model, eventMask(model, ge)) - 6 / 36) < 1e-12);
  assert.equal(describeEvent(model, ge), 'Sum ≥ 10');
  assert.equal(tapEvent(model, ge, 3).anchor, 3);

  const cards = getExperiment('cards').build({ measure: 'suit' });
  let e2 = sanitizeEvent(cards, cards.defaultEvent);
  e2 = tapEvent(cards, e2, 1, true);
  assert.equal(describeEvent(cards, e2), '♠ Spades or ♥ Hearts');
  assert.equal(eventProbability(cards, eventMask(cards, e2)), 0.5);
  assert.deepEqual(tapEvent(cards, e2, 3).items, [3]);
  // Out-of-range anchors are clamped when the model shrinks.
  assert.equal(sanitizeEvent(model, { type: 'cmp', op: 'ge', anchor: 99 }).anchor, model.outcomes.length - 1);
});

test('results: snapshots let any event be replayed', () => {
  const r = new Results(3);
  const seq = [0, 1, 2, 2, 1, 0, 0, 2, 2, 2];
  seq.forEach((i) => r.add(i));
  assert.equal(r.n, 10);
  assert.deepEqual(Array.from(r.counts), [3, 2, 5]);
  assert.deepEqual(r.recent(3), [2, 2, 2]);
  const conv = r.convergence([false, false, true]);
  assert.equal(conv.n.length, 10);
  assert.equal(conv.f[2], 1 / 3);
  assert.equal(conv.f[9], 0.5);
  const big = new Results(2);
  for (let i = 0; i < 1e6; i++) big.add(i & 1);
  assert.ok(big.snapN.length < 1000, `too many snapshots: ${big.snapN.length}`);
  const c = big.clone();
  big.reset();
  assert.equal(c.n, 1e6);
  assert.equal(big.n, 0);
});

test('saved configs are validated against defaults', () => {
  const exp = getExperiment('marbles');
  const c = resolveConfig(exp, { blue: 0, orange: 0, teal: 0, draws: 9, replace: false, evil: 1 });
  assert.equal(c.blue, 1); // empty bag fixed up
  assert.equal(c.draws, 1); // can't draw more than the bag holds without replacement
  assert.ok(!('evil' in c));
  assert.equal(resolveConfig(exp, { blue: 'lots' }).blue, exp.defaults.blue);
  const sp = resolveConfig(getExperiment('spinner'), { weights: { 0: 1 } });
  assert.ok(Array.isArray(sp.weights));
});
