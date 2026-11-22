import { pct } from '../ui/format.js';

/**
 * Play one Monty Hall game for real: hide the car, pick a door, let the host
 * open goat doors, then see which strategy would have won.
 */
export function playMonty(rng, doors, host) {
  const car = rng.int(doors);
  const pick = rng.int(doors);
  let opened, switchTo;
  if (host === 'all' || doors === 3) {
    // Host opens every door except your pick and one other, never revealing the car.
    const keep = pick === car ? otherThan(rng, doors, pick) : car;
    opened = [];
    for (let d = 0; d < doors; d++) if (d !== pick && d !== keep) opened.push(d);
    switchTo = keep;
  } else {
    // Host opens a single random goat door that you didn't pick.
    const goats = [];
    for (let d = 0; d < doors; d++) if (d !== pick && d !== car) goats.push(d);
    const o = goats[rng.int(goats.length)];
    opened = [o];
    // Switching means moving to a random other closed door.
    const choices = [];
    for (let d = 0; d < doors; d++) if (d !== pick && d !== o) choices.push(d);
    switchTo = choices[rng.int(choices.length)];
  }
  // 0 = staying wins, 1 = switching wins, 2 = both lose.
  const index = pick === car ? 0 : switchTo === car ? 1 : 2;
  return { index, car, pick, opened, switchTo, doors };
}

function otherThan(rng, doors, x) {
  const r = rng.int(doors - 1);
  return r >= x ? r + 1 : r;
}

export default {
  id: 'monty',
  name: 'Monty Hall',
  icon: 'door',
  blurb: 'Stay or switch? The famous puzzle',
  defaults: { doors: 3, host: 'all' },

  controls(c) {
    const ctl = [{ type: 'stepper', key: 'doors', label: 'Doors', min: 3, max: 8 }];
    if (c.doors > 3) {
      ctl.push({
        type: 'choice', key: 'host', label: 'The host opens',
        options: [{ value: 'all', label: 'All but one' }, { value: 'one', label: 'Just one' }],
        hint: (cfg) => (cfg.host === 'all'
          ? 'Every other goat door opens, leaving your door and one more.'
          : 'One goat door opens; switching picks one of the other closed doors.'),
      });
    }
    return ctl;
  },

  build(c) {
    const d = c.doors;
    const host = d === 3 ? 'all' : c.host;
    const outcomes = [
      { label: 'Staying wins', short: 'Stay wins' },
      { label: 'Switching wins', short: 'Switch wins' },
    ];
    let probs = [1 / d, (d - 1) / d];
    if (host === 'one') {
      outcomes.push({ label: 'Both lose', short: 'Both lose' });
      const sw = (d - 1) / (d * (d - 2));
      probs = [1 / d, sw, 1 - 1 / d - sw];
    }
    return {
      outcomes,
      probs,
      numeric: false,
      xTitle: 'Which strategy would win this game',
      defaultEvent: { type: 'set', items: [1] },
      theoryLabel: `Stay ${pct(probs[0])} · Switch ${pct(probs[1])}`,
      sample: (rng) => playMonty(rng, d, host).index,
      trial: (rng) => playMonty(rng, d, host),
      doorsCount: d,
      stage: 'monty',
    };
  },

  learn: {
    idea: `<p>A car hides behind one door, goats behind the rest. You pick a door. The host — who <b>knows</b> where the car is — opens a goat door. Should you switch?</p>
      <p>Your first pick is right only <b>1 time in 3</b>. Those are the only games where switching loses. The other <b>2 times in 3</b>, the car is behind one of the doors you didn't pick — and the host has just shown you which one.</p>`,
    theory: `<p>P(stay wins) = 1/n. With the host opening all but one other door, P(switch wins) = (n − 1)/n.</p>
      <p>If the host opens only one door, switching wins with P = (n − 1) ÷ (n(n − 2)) — still better than staying.</p>`,
    misconception: `<p><b>“Two doors left, so it's 50/50.”</b> Only if the host opened a door at random. He didn't — he avoided the car, and that gives you information. Simulate 1,000 games and the 2 : 1 ratio is hard to argue with.</p>`,
    tryThis: [
      { label: 'Play slowly', text: 'Watch 10 games one at a time. Count how often switching wins.', config: { doors: 3 }, trials: 10, speed: 1 },
      { label: 'Settle the argument', text: '10,000 games. Does switching win about 2/3 of the time?', config: { doors: 3 }, trials: 10000, speed: 6 },
      { label: 'Make it obvious', text: '8 doors, host opens 6. Switching wins 7/8 of the time.', config: { doors: 8, host: 'all' }, trials: 2000, speed: 5 },
    ],
  },
};
