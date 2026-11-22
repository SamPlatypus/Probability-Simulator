import { binomialPmf, hypergeometricPmf } from '../core/prob.js';

export const MARBLE_COLORS = [
  { key: 'blue', label: 'Blue', slot: 1 },
  { key: 'orange', label: 'Orange', slot: 2 },
  { key: 'teal', label: 'Teal', slot: 3 },
];

export default {
  id: 'marbles',
  name: 'Marbles',
  icon: 'marbles',
  blurb: 'Draw from a bag, with or without putting back',
  defaults: { blue: 5, orange: 3, teal: 2, draws: 1, replace: true },

  controls(c) {
    const total = c.blue + c.orange + c.teal;
    return [
      ...MARBLE_COLORS.map((m) => ({
        type: 'stepper', key: m.key, label: `${m.label} marbles`, min: 0, max: 12, swatch: m.slot,
      })),
      {
        type: 'stepper', key: 'draws', label: 'Marbles drawn per trial', min: 1, max: c.replace ? 8 : Math.max(1, Math.min(8, total)),
        hint: (cfg) => (cfg.draws > 1 ? 'We record how many blue marbles you get.' : 'We record the colour you get.'),
      },
      {
        type: 'choice', key: 'replace', label: 'After each draw',
        options: [{ value: true, label: 'Put it back' }, { value: false, label: 'Keep it out' }],
        hint: (cfg) => (cfg.replace
          ? 'With replacement: every draw sees the same bag, so draws are independent.'
          : 'Without replacement: each draw changes the bag, so draws depend on each other.'),
      },
    ];
  },

  /** Keep the bag non-empty and draws feasible. */
  fixConfig(c) {
    const out = { ...c };
    if (out.blue + out.orange + out.teal === 0) out.blue = 1;
    const total = out.blue + out.orange + out.teal;
    if (!out.replace && out.draws > total) out.draws = total;
    return out;
  },

  build(c) {
    const counts = [c.blue, c.orange, c.teal];
    const total = counts.reduce((a, b) => a + b, 0);
    // The bag: one entry per physical marble, holding its colour index.
    const bag = [];
    counts.forEach((n, color) => { for (let i = 0; i < n; i++) bag.push(color); });
    const k = c.replace ? c.draws : Math.min(c.draws, total);
    const order = Int32Array.from(bag.keys()); // reusable permutation for draws without replacement

    const drawIds = (rng, out) => {
      if (c.replace) {
        for (let j = 0; j < k; j++) out[j] = rng.int(total);
      } else {
        // Partial Fisher–Yates: the first k slots become a uniformly random k-subset.
        for (let j = 0; j < k; j++) {
          const r = j + rng.int(total - j);
          const t = order[j]; order[j] = order[r]; order[r] = t;
          out[j] = order[j];
        }
      }
      return out;
    };
    const scratch = new Int32Array(k);

    const base = {
      bag,
      counts,
      draws: k,
      replace: c.replace,
      stage: 'marbles',
      trial(rng) {
        const ids = Array.from(drawIds(rng, new Int32Array(k)));
        const colors = ids.map((id) => bag[id]);
        const index = k === 1 ? colors[0] : colors.filter((x) => x === 0).length;
        return { index, ids, colors };
      },
    };

    if (k === 1) {
      return {
        ...base,
        outcomes: MARBLE_COLORS.map((m) => ({ label: m.label, short: m.label, slot: m.slot })),
        probs: counts.map((n) => n / total),
        numeric: false,
        xTitle: 'Colour drawn',
        defaultEvent: { type: 'set', items: [0] },
        theoryLabel: `P(colour) = how many ÷ ${total}`,
        sample: (rng) => bag[rng.int(total)],
      };
    }
    const outcomes = [];
    for (let j = 0; j <= k; j++) outcomes.push({ label: String(j), short: String(j), value: j });
    return {
      ...base,
      outcomes,
      probs: c.replace ? binomialPmf(k, counts[0] / total) : hypergeometricPmf(total, counts[0], k),
      numeric: true,
      subject: 'Blue',
      xTitle: `Blue marbles in ${k} draws`,
      defaultEvent: { type: 'cmp', op: 'eq', anchor: Math.round((k * counts[0]) / total) },
      theoryLabel: c.replace ? `Binomial(${k}, ${counts[0]}/${total})` : `Hypergeometric(${total}, ${counts[0]}, ${k})`,
      sample(rng) {
        drawIds(rng, scratch);
        let b = 0;
        for (let j = 0; j < k; j++) if (bag[scratch[j]] === 0) b++;
        return b;
      },
    };
  },

  learn: {
    idea: `<p>A bag of marbles turns probability into <b>counting</b>: with 5 blue out of 10, P(blue) = 5/10.</p>
      <p>Drawing several marbles raises a big question: do you <b>put each one back</b>? If you do, every draw is identical and <b>independent</b>. If you don't, each draw changes the bag, so the draws are <b>dependent</b> — after taking a blue, blue gets less likely.</p>`,
    theory: `<p><b>With replacement</b> (k draws, b blue of N): P(j blue) = C(k, j)(b/N)<sup>j</sup>(1 − b/N)<sup>k − j</sup>.</p>
      <p><b>Without replacement:</b> P(j blue) = C(b, j)·C(N − b, k − j) ÷ C(N, k) — the <b>hypergeometric</b> distribution. It's narrower: extreme results are rarer because the bag “pushes back”.</p>`,
    misconception: `<p><b>“Putting it back doesn't matter.”</b> For a huge bag it barely does — for a small bag it matters a lot. Draw 5 from a bag of 10 both ways and compare the spread.</p>`,
    tryThis: [
      { label: 'Simple counting', text: '5 blue, 3 orange, 2 teal. Predict each bar, then draw 1,000.', config: { blue: 5, orange: 3, teal: 2, draws: 1, replace: true }, trials: 1000, speed: 6 },
      { label: 'Put back…', text: 'Draw 5 from 5 blue + 5 orange, putting back. Note the spread.', config: { blue: 5, orange: 5, teal: 0, draws: 5, replace: true }, trials: 3000, speed: 6 },
      { label: '…or keep out', text: 'Same bag, but keep marbles out. The histogram gets narrower.', config: { blue: 5, orange: 5, teal: 0, draws: 5, replace: false }, trials: 3000, speed: 6 },
      { label: 'Impossible event', text: 'No teal in the bag: its bar can never grow. P = 0 means impossible.', config: { blue: 4, orange: 4, teal: 0, draws: 1, replace: true }, trials: 500, speed: 6 },
    ],
  },
};
