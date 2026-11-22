import { binomialPmf } from '../core/prob.js';
import { pct } from '../ui/format.js';

/** Longest/current streak tracker for single-coin runs (gambler's fallacy fodder). */
function streakTracker(p) {
  const t = {
    reset() { t.cur = -1; t.len = 0; t.best = 0; t.bestFace = -1; t.n = 0; },
    add(i) {
      t.n++;
      if (i === t.cur) t.len++; else { t.cur = i; t.len = 1; }
      if (t.len > t.best) { t.best = t.len; t.bestFace = i; }
    },
    clone() { const c = streakTracker(p); Object.assign(c, { cur: t.cur, len: t.len, best: t.best, bestFace: t.bestFace, n: t.n }); return c; },
    items() {
      if (!t.n) return [];
      const face = (i) => (i === 0 ? 'Heads' : 'Tails');
      const items = [
        { label: 'Longest streak', value: `${t.best} ${face(t.bestFace)}` },
        { label: 'Current streak', value: `${t.len} ${face(t.cur)}` },
      ];
      if (p === 0.5 && t.n >= 20) {
        // Expected longest run of either face in n fair flips ≈ log2(n) + 1/3.
        items.push({ label: `Typical longest in ${t.n.toLocaleString()} flips`, value: `≈ ${Math.round(Math.log2(t.n) + 1 / 3)}` });
      }
      return items;
    },
  };
  t.reset();
  return t;
}

export default {
  id: 'coins',
  name: 'Coins',
  icon: 'coin',
  blurb: 'Flip coins and count heads',
  defaults: { coins: 1, pHeads: 0.5 },

  controls() {
    return [
      { type: 'stepper', key: 'coins', label: 'Coins per trial', min: 1, max: 12 },
      {
        type: 'slider', key: 'pHeads', label: 'Chance of heads', min: 0.05, max: 0.95, step: 0.05,
        format: (v) => pct(v), hint: (c) => (c.pHeads === 0.5 ? 'A fair coin.' : 'A biased (unfair) coin.'),
      },
    ];
  },

  build(c) {
    const n = c.coins, p = c.pHeads;
    if (n === 1) {
      return {
        outcomes: [
          { label: 'Heads', short: 'H' },
          { label: 'Tails', short: 'T' },
        ],
        probs: [p, 1 - p],
        numeric: false,
        xTitle: 'Face',
        defaultEvent: { type: 'set', items: [0] },
        theoryLabel: `P(Heads) = ${pct(p)}`,
        sample: (rng) => (rng.next() < p ? 0 : 1),
        trial(rng) {
          const h = rng.next() < p;
          return { index: h ? 0 : 1, faces: [h] };
        },
        tracker: () => streakTracker(p),
        stage: 'coins',
      };
    }
    const outcomes = [];
    for (let k = 0; k <= n; k++) outcomes.push({ label: String(k), short: String(k), value: k });
    return {
      outcomes,
      probs: binomialPmf(n, p),
      numeric: true,
      subject: 'Heads',
      xTitle: `Number of heads in ${n} coins`,
      defaultEvent: { type: 'cmp', op: 'eq', anchor: Math.round(n * p) },
      theoryLabel: `Binomial(n = ${n}, p = ${pct(p)})`,
      sample(rng) {
        let k = 0;
        for (let i = 0; i < n; i++) if (rng.next() < p) k++;
        return k;
      },
      trial(rng) {
        const faces = [];
        let k = 0;
        for (let i = 0; i < n; i++) { const h = rng.next() < p; faces.push(h); if (h) k++; }
        return { index: k, faces };
      },
      stage: 'coins',
    };
  },

  learn: {
    idea: `<p>A single flip is unpredictable, but <b>many</b> flips are not. The share of heads drifts toward the true chance as you flip more — that's the <b>Law of Large Numbers</b>.</p>
      <p>With several coins per trial we count heads. Middle counts are common because there are many ways to make them: with 4 coins there are <b>6</b> ways to get 2 heads (HHTT, HTHT, …) but only <b>1</b> way to get 4.</p>`,
    theory: `<p><b>One coin:</b> P(Heads) = p.</p>
      <p><b>n coins:</b> P(k heads) = C(n, k) · p<sup>k</sup> · (1 − p)<sup>n − k</sup> — the <b>binomial distribution</b>. C(n, k) counts the arrangements.</p>`,
    misconception: `<p><b>“Tails is due.”</b> After five heads in a row, the next flip is still 50/50 — coins have no memory. That belief is the <b>gambler's fallacy</b>. Watch the streak stats: long streaks happen far more often than people expect.</p>`,
    tryThis: [
      { label: 'Ten flips vs. ten thousand', text: 'Flip 1 coin 10 times, note the %, then run 10,000. Which is closer to 50%?', config: { coins: 1, pHeads: 0.5 }, trials: 10, speed: 2 },
      { label: 'Streak hunt', text: 'Flip 100 times. Before you start, guess the longest streak. (Most people guess 4.)', config: { coins: 1, pHeads: 0.5 }, trials: 100, speed: 5 },
      { label: 'Bell from coins', text: '10 coins per trial, 5,000 trials. Where does the hump sit?', config: { coins: 10, pHeads: 0.5 }, trials: 5000, speed: 6 },
      { label: 'Bent coin', text: '70% heads, 4 coins. The hump slides toward more heads.', config: { coins: 4, pHeads: 0.7 }, trials: 2000, speed: 6 },
    ],
  },
};
