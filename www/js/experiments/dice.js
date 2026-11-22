import { diceStatPmf, normalize } from '../core/prob.js';

const STAT_NAMES = { sum: 'Sum', max: 'Highest', min: 'Lowest' };
const LOAD = 3; // a loaded face is this many times as likely as each other face

function faceSampler(weights) {
  const sides = weights.length;
  if (weights.every((w) => w === weights[0])) return (rng) => rng.int(sides) + 1;
  const probs = normalize(weights);
  const cum = [];
  let acc = 0;
  for (const p of probs) cum.push((acc += p));
  cum[sides - 1] = 1;
  return (rng) => {
    const u = rng.next();
    let f = 0;
    while (u >= cum[f]) f++;
    return f + 1;
  };
}

export default {
  id: 'dice',
  name: 'Dice',
  icon: 'die',
  blurb: 'Roll dice — sums, highs and lows',
  defaults: { dice: 2, sides: 6, stat: 'sum', die: 'fair', mysteryLoaded: false, mysteryFace: 6 },

  controls(c) {
    const ctl = [
      { type: 'stepper', key: 'dice', label: 'Dice per roll', min: 1, max: 6 },
      {
        type: 'choice', key: 'sides', label: 'Sides on each die',
        options: [4, 6, 8, 10, 12, 20].map((s) => ({ value: s, label: `d${s}` })),
      },
    ];
    if (c.dice > 1) {
      ctl.push({
        type: 'choice', key: 'stat', label: 'Record the',
        options: [{ value: 'sum', label: 'Sum' }, { value: 'max', label: 'Highest' }, { value: 'min', label: 'Lowest' }],
      });
    }
    ctl.push({
      type: 'choice', key: 'die', label: 'The dice are',
      options: [{ value: 'fair', label: 'Fair' }, { value: 'loaded', label: 'Loaded' }, { value: 'mystery', label: 'Mystery' }],
      hint: (cfg) => cfg.die === 'loaded'
        ? `Face ${cfg.sides} is ${LOAD}× as likely as each other face. The theory accounts for it.`
        : cfg.die === 'mystery'
          ? 'These dice might be loaded. The theory assumes they are fair — use the fit check to catch a cheat, then reveal.'
          : 'Every face equally likely.',
      onSelect: (value) => (value === 'mystery' ? newMystery(c.sides) : null),
    });
    if (c.die === 'mystery') {
      ctl.push({
        type: 'actions', actions: [
          { id: 'reveal', label: 'Reveal the dice', icon: 'eye' },
          { id: 'new-mystery', label: 'New mystery', icon: 'shuffle' },
        ],
      });
    }
    return ctl;
  },

  /** Presets that ask for mystery dice get a freshly hidden truth. */
  applyPreset(c) {
    return c.die === 'mystery' ? { ...c, ...newMystery(c.sides) } : c;
  },

  actions: {
    reveal(c) {
      return {
        message: c.mysteryLoaded
          ? `They were loaded! Face ${c.mysteryFace} comes up ${LOAD}× as often as each other face.`
          : 'They were fair. Every face is equally likely.',
      };
    },
    'new-mystery'(c) {
      return { patch: newMystery(c.sides), message: 'New mystery dice — fair or loaded? Collect evidence.' };
    },
  },

  build(c) {
    const { dice: n, sides } = c;
    const stat = n > 1 ? c.stat : 'sum';
    const theoryWeights = new Array(sides).fill(1);
    const trueWeights = new Array(sides).fill(1);
    if (c.die === 'loaded') { theoryWeights[sides - 1] = LOAD; trueWeights[sides - 1] = LOAD; }
    if (c.die === 'mystery' && c.mysteryLoaded) trueWeights[Math.min(sides, c.mysteryFace) - 1] = LOAD;

    const { values, probs } = diceStatPmf(normalize(theoryWeights), n, stat);
    const offset = values[0];
    const roll = faceSampler(trueWeights);
    const subject = n === 1 ? 'Face' : STAT_NAMES[stat];
    const mode = probs.indexOf(Math.max(...probs));

    const combine = stat === 'sum'
      ? (faces) => faces.reduce((a, b) => a + b, 0)
      : stat === 'max' ? (faces) => Math.max(...faces) : (faces) => Math.min(...faces);

    return {
      outcomes: values.map((v) => ({ label: String(v), short: String(v), value: v })),
      probs,
      numeric: true,
      subject,
      xTitle: n === 1 ? `Face shown on a d${sides}` : `${STAT_NAMES[stat]} of ${n} d${sides}`,
      defaultEvent: { type: 'cmp', op: 'eq', anchor: mode },
      theoryLabel: (c.die === 'mystery' ? 'Fair-dice model · ' : '') +
        (n === 1 ? `Each face ${c.die === 'loaded' ? 'weighted' : `1/${sides}`}` : `${STAT_NAMES[stat]} of ${n} × d${sides}`),
      sample(rng) {
        if (stat === 'sum') {
          let s = 0;
          for (let i = 0; i < n; i++) s += roll(rng);
          return s - offset;
        }
        let m = roll(rng);
        for (let i = 1; i < n; i++) {
          const f = roll(rng);
          if (stat === 'max' ? f > m : f < m) m = f;
        }
        return m - offset;
      },
      trial(rng) {
        const faces = [];
        for (let i = 0; i < n; i++) faces.push(roll(rng));
        return { index: combine(faces) - offset, faces, sides, stat };
      },
      diceCount: n,
      sides,
      stage: 'dice',
    };
  },

  learn: {
    idea: `<p>One fair die is <b>flat</b>: every face is equally likely. Add two dice together and a <b>peak</b> appears at 7, because more combinations make 7 (1+6, 2+5, 3+4, 4+3, 5+2, 6+1) than make 2 (only 1+1).</p>
      <p>Add more dice and the shape turns into a smooth <b>bell curve</b>. That's the <b>Central Limit Theorem</b> peeking through: sums of many random things tend to look normal.</p>`,
    theory: `<p><b>One die:</b> P(face) = 1/sides.</p>
      <p><b>Sum of two d6:</b> count the pairs. 36 equally likely pairs; 6 of them sum to 7, so P(7) = 6/36 = 1/6.</p>
      <p><b>Highest of n dice:</b> P(max ≤ k) = (k/sides)<sup>n</sup>, so high values dominate as you add dice.</p>`,
    misconception: `<p><b>“All sums are equally likely.”</b> Each <i>face</i> is, but sums aren't — they're built from combinations. Try 2d6 and watch 7 pull ahead.</p>
      <p><b>Catching a cheat:</b> Mystery dice may be loaded. With 30 rolls you can rarely tell; with 3,000 the fit check usually can. More data, more power.</p>`,
    tryThis: [
      { label: 'Flat to peaked', text: 'Roll 1 die 3,000 times, then switch to 2 dice. What happens to the shape?', config: { dice: 1, sides: 6, die: 'fair' }, trials: 3000, speed: 6 },
      { label: 'Bell curve', text: '5 dice, sum. The histogram hugs the theory curve.', config: { dice: 5, sides: 6, stat: 'sum', die: 'fair' }, trials: 20000, speed: 7 },
      { label: 'Best of three', text: 'Highest of 3 d20 — why do high numbers win?', config: { dice: 3, sides: 20, stat: 'max', die: 'fair' }, trials: 5000, speed: 6 },
      { label: 'Catch the cheat', text: 'Mystery die: roll 50, check the fit; then 5,000. Then reveal.', config: { dice: 1, sides: 6, die: 'mystery' }, trials: 50, speed: 5 },
    ],
  },
};

function newMystery(sides) {
  return { die: 'mystery', mysteryLoaded: Math.random() < 0.5, mysteryFace: 1 + Math.floor(Math.random() * sides) };
}
