// Exact (theoretical) probability distributions and the statistics used to
// compare a simulation against them. Everything here is pure and unit-tested.

/** n choose k as a float (exact for the sizes this app uses). */
export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  // Every partial product is itself a binomial coefficient, so this stays an
  // exact integer as long as the result is below 2^53.
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** Normalise non-negative weights so they sum to 1. */
export function normalize(weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return weights.map(() => 1 / weights.length);
  return weights.map((w) => w / total);
}

/** P(X = k) for X ~ Binomial(n, p), k = 0..n. */
export function binomialPmf(n, p) {
  const out = [];
  for (let k = 0; k <= n; k++) out.push(choose(n, k) * p ** k * (1 - p) ** (n - k));
  return out;
}

/**
 * Hypergeometric: drawing `draws` items without replacement from a population of
 * `total` that contains `successes` marked items. Returns P(k marked), k = 0..draws.
 */
export function hypergeometricPmf(total, successes, draws) {
  const denom = choose(total, draws);
  const out = [];
  for (let k = 0; k <= draws; k++) {
    out.push(denom === 0 ? 0 : (choose(successes, k) * choose(total - successes, draws - k)) / denom);
  }
  return out;
}

/** Discrete convolution of two pmfs indexed from 0. */
export function convolve(a, b) {
  const out = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0) continue;
    for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
  }
  return out;
}

/**
 * Distribution of a statistic of `count` independent dice, each with face
 * probabilities `faceProbs` (index 0 = face 1).
 * @param {'sum'|'max'|'min'} stat
 * @returns {{ values: number[], probs: number[] }}
 */
export function diceStatPmf(faceProbs, count, stat) {
  const sides = faceProbs.length;
  if (stat === 'sum') {
    let pmf = faceProbs.slice();
    for (let i = 1; i < count; i++) pmf = convolve(pmf, faceProbs);
    // pmf[i] is P(sum = count + i)
    return { values: pmf.map((_, i) => count + i), probs: pmf };
  }
  const cdf = [];
  let acc = 0;
  for (const p of faceProbs) { acc += p; cdf.push(Math.min(1, acc)); }
  const values = [], probs = [];
  for (let f = 1; f <= sides; f++) {
    values.push(f);
    if (stat === 'max') {
      const hi = cdf[f - 1] ** count;
      const lo = f > 1 ? cdf[f - 2] ** count : 0;
      probs.push(hi - lo);
    } else {
      // P(min >= f) = (1 - F(f-1))^count
      const atLeast = (f > 1 ? 1 - cdf[f - 2] : 1) ** count;
      const atLeastNext = (1 - cdf[f - 1]) ** count;
      probs.push(Math.max(0, atLeast - atLeastNext));
    }
  }
  return { values, probs };
}

/** Probability that at least two of `people` share a day among `days` equally likely days. */
export function birthdayShared(people, days) {
  if (people > days) return 1;
  let allDifferent = 1;
  for (let i = 0; i < people; i++) allDifferent *= (days - i) / days;
  return 1 - allDifferent;
}

/** Expected value and standard deviation of a discrete distribution. */
export function moments(values, probs) {
  let mean = 0;
  for (let i = 0; i < values.length; i++) mean += values[i] * probs[i];
  let v = 0;
  for (let i = 0; i < values.length; i++) v += (values[i] - mean) ** 2 * probs[i];
  return { mean, sd: Math.sqrt(Math.max(0, v)) };
}

/** Observed mean and standard deviation from counts. */
export function observedMoments(values, counts, n) {
  if (n === 0) return { mean: NaN, sd: NaN };
  let mean = 0;
  for (let i = 0; i < values.length; i++) mean += values[i] * counts[i];
  mean /= n;
  let v = 0;
  for (let i = 0; i < values.length; i++) v += (values[i] - mean) ** 2 * counts[i];
  return { mean, sd: Math.sqrt(v / n) };
}

/** Total variation distance between two probability vectors (0 = identical, 1 = disjoint). */
export function totalVariation(p, q) {
  let s = 0;
  for (let i = 0; i < p.length; i++) s += Math.abs(p[i] - q[i]);
  return s / 2;
}

// ---------------------------------------------------------------------------
// Chi-square goodness of fit
// ---------------------------------------------------------------------------

/** ln Γ(x) via the Lanczos approximation (|error| < 1e-14 for x > 0). */
export function logGamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised upper incomplete gamma Q(a, x) = Γ(a, x) / Γ(a). */
export function gammaQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) {
    // Series for P(a, x), then Q = 1 - P.
    let sum = 1 / a, term = sum, ap = a;
    for (let n = 0; n < 1000; n++) {
      ap += 1; term *= x / ap; sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - logGamma(a)));
  }
  // Continued fraction (modified Lentz) for Q(a, x).
  const tiny = 1e-300;
  let b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.min(1, Math.exp(-x + a * Math.log(x) - logGamma(a)) * h);
}

/** P(χ²_df ≥ stat). */
export function chiSquareSurvival(stat, df) {
  if (df <= 0) return NaN;
  return gammaQ(df / 2, stat / 2);
}

/**
 * Pearson chi-square goodness-of-fit test with automatic pooling: neighbouring
 * outcomes are merged until every pooled cell expects at least `minExpected`
 * observations (the usual rule of thumb for the test to be trustworthy).
 * Outcomes the model says are impossible are ignored unless they were observed.
 *
 * @returns {{ ok: boolean, reason?: string, stat?: number, df?: number, p?: number, cells?: number }}
 */
export function chiSquareTest(counts, probs, n, minExpected = 5) {
  if (n <= 0) return { ok: false, reason: 'no-data' };
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] === 0 && counts[i] > 0) {
      return { ok: true, stat: Infinity, df: Math.max(1, probs.length - 1), p: 0, cells: probs.length };
    }
  }
  if (probs.filter((p) => p > 0).length === 1) {
    // Only one outcome is possible: nothing to test.
    return { ok: false, reason: 'certain' };
  }
  const cells = [];
  let accO = 0, accE = 0;
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] === 0) continue;
    accO += counts[i];
    accE += probs[i] * n;
    if (accE >= minExpected) { cells.push([accO, accE]); accO = 0; accE = 0; }
  }
  if (accE > 0) {
    if (cells.length) { cells[cells.length - 1][0] += accO; cells[cells.length - 1][1] += accE; }
    else cells.push([accO, accE]);
  }
  if (cells.length < 2) return { ok: false, reason: 'need-more' };
  let stat = 0;
  for (const [o, e] of cells) stat += (o - e) ** 2 / e;
  const df = cells.length - 1;
  return { ok: true, stat, df, p: chiSquareSurvival(stat, df), cells: cells.length };
}

/**
 * How surprising is an observed proportion? Returns the z-score and a two-sided
 * p-value using the normal approximation to the binomial (with continuity
 * correction), which is fine for teaching purposes.
 */
export function proportionZ(successes, n, p) {
  if (n === 0 || p <= 0 || p >= 1) return { z: 0, p: 1 };
  const sd = Math.sqrt(n * p * (1 - p));
  const diff = Math.max(0, Math.abs(successes - n * p) - 0.5);
  const z = diff / sd;
  return { z, p: 2 * normalSurvival(z) };
}

/** P(Z ≥ z) for a standard normal. */
export function normalSurvival(z) {
  // Abramowitz & Stegun 7.1.26 via erfc; accurate to ~1e-7.
  const x = z / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erfc = y * Math.exp(-x * x);
  return x >= 0 ? erfc / 2 : 1 - erfc / 2;
}
