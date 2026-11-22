import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  choose, binomialPmf, hypergeometricPmf, diceStatPmf, birthdayShared, moments,
  chiSquareSurvival, chiSquareTest, totalVariation, normalSurvival, proportionZ, logGamma,
} from '../www/js/core/prob.js';
import { createRng } from '../www/js/core/rng.js';

const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, msg || `${a} ≉ ${b}`);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

test('choose', () => {
  assert.equal(choose(5, 2), 10);
  assert.equal(choose(52, 5), 2598960);
  assert.equal(choose(10, 0), 1);
  assert.equal(choose(3, 4), 0);
});

test('binomial pmf sums to 1 and matches known values', () => {
  const p = binomialPmf(4, 0.5);
  assert.deepEqual(p.map((x) => x * 16), [1, 4, 6, 4, 1]);
  close(sum(binomialPmf(16, 0.3)), 1);
});

test('hypergeometric pmf', () => {
  // 5 blue of 10, draw 5 without replacement: P(5 blue) = 1/252
  const p = hypergeometricPmf(10, 5, 5);
  close(p[5], 1 / 252);
  close(sum(p), 1);
});

test('dice sum matches brute-force enumeration', () => {
  for (const [n, s] of [[1, 6], [2, 6], [3, 4], [2, 20]]) {
    const counts = new Map();
    const rec = (left, acc) => {
      if (!left) { counts.set(acc, (counts.get(acc) || 0) + 1); return; }
      for (let f = 1; f <= s; f++) rec(left - 1, acc + f);
    };
    rec(n, 0);
    const { values, probs } = diceStatPmf(new Array(s).fill(1 / s), n, 'sum');
    values.forEach((v, i) => close(probs[i], (counts.get(v) || 0) / s ** n, 1e-12));
  }
});

test('dice max/min via enumeration', () => {
  const s = 6, n = 3;
  const mx = new Array(s + 1).fill(0), mn = new Array(s + 1).fill(0);
  for (let a = 1; a <= s; a++) for (let b = 1; b <= s; b++) for (let c = 1; c <= s; c++) {
    mx[Math.max(a, b, c)]++; mn[Math.min(a, b, c)]++;
  }
  const fair = new Array(s).fill(1 / s);
  diceStatPmf(fair, n, 'max').probs.forEach((p, i) => close(p, mx[i + 1] / 216, 1e-12));
  diceStatPmf(fair, n, 'min').probs.forEach((p, i) => close(p, mn[i + 1] / 216, 1e-12));
});

test('birthday problem classic value', () => {
  close(birthdayShared(23, 365), 0.5072972343239854, 1e-12);
  assert.equal(birthdayShared(366, 365), 1);
});

test('moments of a fair die', () => {
  const m = moments([1, 2, 3, 4, 5, 6], new Array(6).fill(1 / 6));
  close(m.mean, 3.5);
  close(m.sd, Math.sqrt(35 / 12));
});

test('logGamma', () => {
  close(logGamma(5), Math.log(24), 1e-12);
  close(logGamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-12);
});

test('chi-square survival matches tables', () => {
  close(chiSquareSurvival(3.841458820694124, 1), 0.05, 1e-9);
  close(chiSquareSurvival(11.070497693516351, 5), 0.05, 1e-9);
  close(chiSquareSurvival(23.209251158954356, 10), 0.01, 1e-9);
  close(chiSquareSurvival(0, 3), 1);
  close(chiSquareSurvival(124.342, 100), 0.05, 1e-5);
});

test('chi-square test pools small cells and flags impossible outcomes', () => {
  const probs = [0.5, 0.5];
  assert.equal(chiSquareTest([5, 5], probs, 10).ok, true);
  assert.equal(chiSquareTest([2, 1], probs, 3).reason, 'need-more');
  const r = chiSquareTest([50, 50], probs, 100);
  close(r.stat, 0);
  assert.equal(r.df, 1);
  assert.equal(chiSquareTest([5, 0, 5], [0.5, 0, 0.5], 10).p, 1);
  assert.equal(chiSquareTest([5, 1, 4], [0.5, 0, 0.5], 10).p, 0);
  assert.equal(chiSquareTest([0, 9], [0, 1], 9).reason, 'certain');
});

test('normal survival', () => {
  close(normalSurvival(0), 0.5, 1e-7);
  close(normalSurvival(1.959964), 0.025, 1e-6);
  close(normalSurvival(-1), 1 - 0.158655, 1e-6);
  assert.ok(proportionZ(50, 100, 0.5).p > 0.9);
});

test('total variation', () => {
  close(totalVariation([1, 0], [0, 1]), 1);
  close(totalVariation([0.5, 0.5], [0.5, 0.5]), 0);
});

test('rng is deterministic per seed and roughly uniform', () => {
  const a = createRng('class-7b'), b = createRng('class-7b'), c = createRng('other');
  const xs = Array.from({ length: 5 }, () => a.next());
  assert.deepEqual(xs, Array.from({ length: 5 }, () => b.next()));
  assert.notDeepEqual(xs, Array.from({ length: 5 }, () => c.next()));
  const r = createRng(42);
  const k = 7, n = 70000, counts = new Array(k).fill(0);
  for (let i = 0; i < n; i++) counts[r.int(k)]++;
  const t = chiSquareTest(counts, new Array(k).fill(1 / k), n);
  assert.ok(t.p > 0.001, `int() looks non-uniform: p=${t.p}`);
  for (let i = 0; i < 1000; i++) { const x = r.next(); assert.ok(x >= 0 && x < 1); }
});
