import { binomialPmf } from '../core/prob.js';
import { pct } from '../ui/format.js';

export default {
  id: 'galton',
  name: 'Galton board',
  icon: 'galton',
  blurb: 'Balls bounce through pegs into bins',
  defaults: { rows: 10, p: 0.5 },

  controls() {
    return [
      { type: 'stepper', key: 'rows', label: 'Rows of pegs', min: 2, max: 16 },
      {
        type: 'slider', key: 'p', label: 'Chance of bouncing right', min: 0.1, max: 0.9, step: 0.05,
        format: (v) => pct(v), hint: (c) => (c.p === 0.5 ? 'Level board: left and right equally likely.' : 'Tilted board: the pile shifts.'),
      },
    ];
  },

  build(c) {
    const { rows, p } = c;
    const outcomes = [];
    for (let k = 0; k <= rows; k++) outcomes.push({ label: String(k), short: String(k), value: k });
    return {
      outcomes,
      probs: binomialPmf(rows, p),
      numeric: true,
      subject: 'Bin',
      xTitle: 'Bin = number of right bounces',
      defaultEvent: { type: 'cmp', op: 'eq', anchor: Math.round(rows * p) },
      theoryLabel: `Binomial(${rows}, ${pct(p)})`,
      rows,
      sample(rng) {
        let k = 0;
        for (let i = 0; i < rows; i++) if (rng.next() < p) k++;
        return k;
      },
      trial(rng) {
        const path = [];
        let k = 0;
        for (let i = 0; i < rows; i++) { const r = rng.next() < p; path.push(r); if (r) k++; }
        return { index: k, path };
      },
      stage: 'galton',
    };
  },

  learn: {
    idea: `<p>Each ball hits a peg on every row and goes <b>left or right</b> at random. The bin it lands in is just the number of right bounces.</p>
      <p>Reaching an edge bin needs <i>every</i> bounce to go the same way — only one path does that. The middle bins can be reached by <b>many</b> paths, so they fill up fastest. The pile becomes a <b>bell curve</b>.</p>`,
    theory: `<p>With n rows and right-bounce chance p, P(bin k) = C(n, k)·p<sup>k</sup>(1 − p)<sup>n − k</sup> — the <b>binomial distribution</b>.</p>
      <p>C(n, k), the number of paths into bin k, makes <b>Pascal's triangle</b> — look at the pegs!</p>`,
    misconception: `<p><b>“The balls aim for the middle.”</b> No ball has a target — each bounce is a coin flip. The bell shape comes purely from counting paths.</p>`,
    tryThis: [
      { label: 'Watch it build', text: '12 rows, 300 balls at Quick. The bins become a bell.', config: { rows: 12, p: 0.5 }, trials: 300, speed: 3 },
      { label: 'Tilt the board', text: 'Right-bounce chance 70%: the pile slides but keeps its shape.', config: { rows: 12, p: 0.7 }, trials: 3000, speed: 6 },
      { label: 'Tiny board', text: '2 rows: bins 0, 1, 2 at ¼, ½, ¼ — like flipping two coins.', config: { rows: 2, p: 0.5 }, trials: 400, speed: 4 },
    ],
  },
};
