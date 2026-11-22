import { normalize } from '../core/prob.js';

export const LETTERS = 'ABCDEFGH';

export const SPINNER_PRESETS = [
  { label: 'Equal quarters', weights: [1, 1, 1, 1] },
  { label: 'Half & quarters', weights: [2, 1, 1] },
  { label: '1 : 2 : 3', weights: [1, 2, 3] },
  { label: 'Long shot', weights: [7, 1] },
  { label: 'Rainbow 8', weights: [1, 1, 1, 1, 1, 1, 1, 1] },
];

export default {
  id: 'spinner',
  name: 'Spinner',
  icon: 'spinner',
  blurb: 'Design a wheel and spin it',
  defaults: { weights: [1, 1, 1, 1] },

  controls() {
    return [{ type: 'sectors', key: 'weights', label: 'Sectors', presets: SPINNER_PRESETS, max: 8 }];
  },

  build(c) {
    const weights = c.weights.slice(0, 8).map((w) => Math.max(1, Math.min(12, w | 0)));
    const probs = normalize(weights);
    // Sector boundaries in degrees, clockwise from the pointer.
    const bounds = [];
    let acc = 0;
    for (const p of probs) bounds.push((acc += p * 360));
    bounds[bounds.length - 1] = 360;
    const sectorAt = (deg) => {
      let i = 0;
      while (deg >= bounds[i]) i++;
      return i;
    };
    const total = weights.reduce((a, b) => a + b, 0);
    return {
      outcomes: weights.map((w, i) => ({ label: LETTERS[i], short: LETTERS[i], slot: i + 1 })),
      probs,
      numeric: false,
      xTitle: 'Sector',
      defaultEvent: { type: 'set', items: [0] },
      theoryLabel: `P(sector) = weight ÷ ${total}`,
      weights,
      bounds,
      // The physical mechanism: a uniformly random stopping angle. The outcome is
      // whichever sector the pointer lands in — probability ∝ angle.
      sample: (rng) => sectorAt(rng.next() * 360),
      trial(rng) {
        const angle = rng.next() * 360;
        return { index: sectorAt(angle), angle };
      },
      stage: 'spinner',
    };
  },

  learn: {
    idea: `<p>The spinner stops at a <b>random angle</b>. Every angle is equally likely, so a sector's chance is just its <b>share of the circle</b>. A sector twice as wide is hit twice as often.</p>
      <p>This is <b>geometric probability</b>: probability as area or angle.</p>`,
    theory: `<p>P(sector) = sector angle ÷ 360° = its weight ÷ total weight.</p>
      <p>With weights 1 : 2 : 3 the chances are 1/6, 2/6, 3/6.</p>`,
    misconception: `<p><b>“Three outcomes means each is 1/3.”</b> Only when they're equally likely! Counting outcomes works only for equal-sized pieces. Try “1 : 2 : 3” and see.</p>`,
    tryThis: [
      { label: 'Not all outcomes are equal', text: 'Weights 1 : 2 : 3. Predict each bar before you spin.', config: { weights: [1, 2, 3] }, trials: 600, speed: 5 },
      { label: 'The long shot', text: 'A 1-in-8 sector: how many spins until you first hit it? Watch the recent results.', config: { weights: [7, 1] }, trials: 40, speed: 3 },
      { label: 'Eight-way fair', text: '8 equal sectors, 8,000 spins: each bar should sit near 12.5%.', config: { weights: [1, 1, 1, 1, 1, 1, 1, 1] }, trials: 8000, speed: 6 },
    ],
  },
};
