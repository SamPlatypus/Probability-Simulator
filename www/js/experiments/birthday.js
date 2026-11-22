import { birthdayShared } from '../core/prob.js';
import { pct } from '../ui/format.js';

export const CALENDARS = {
  365: { noun: 'birthday', plural: 'birthdays', unit: 'day' },
  12: { noun: 'birth month', plural: 'birth months', unit: 'month' },
  7: { noun: 'weekday', plural: 'weekdays', unit: 'weekday' },
};

export default {
  id: 'birthday',
  name: 'Birthdays',
  icon: 'cake',
  blurb: 'How likely is a shared birthday?',
  defaults: { people: 23, days: 365 },

  controls(c) {
    return [
      { type: 'stepper', key: 'people', label: 'People in the room', min: 2, max: c.days === 365 ? 100 : 24, big: true },
      {
        type: 'choice', key: 'days', label: 'Match on',
        options: [{ value: 365, label: 'Birthday' }, { value: 12, label: 'Month' }, { value: 7, label: 'Weekday' }],
        hint: (cfg) => `P(some pair shares a ${CALENDARS[cfg.days].noun}) = ${pct(birthdayShared(cfg.people, cfg.days))}`,
      },
    ];
  },

  fixConfig(c) {
    const max = c.days === 365 ? 100 : 24;
    return c.people > max ? { ...c, people: max } : c;
  },

  build(c) {
    const { people, days } = c;
    const q = birthdayShared(people, days);
    const stamps = new Uint32Array(days);
    let stamp = 0;
    return {
      outcomes: [
        { label: 'All different', short: 'All different' },
        { label: 'Shared', short: 'Shared' },
      ],
      probs: [1 - q, q],
      numeric: false,
      xTitle: `Do any two of ${people} people share a ${CALENDARS[days].noun}?`,
      defaultEvent: { type: 'set', items: [1] },
      theoryLabel: `1 − (${days}·${days - 1}·…·${days - people + 1}) ÷ ${days}^${people}`,
      people,
      days,
      sample(rng) {
        // Stamping avoids clearing the array every trial.
        stamp++;
        if (stamp === 0xffffffff) { stamps.fill(0); stamp = 1; }
        for (let i = 0; i < people; i++) {
          const d = rng.int(days);
          if (stamps[d] === stamp) return 1;
          stamps[d] = stamp;
        }
        return 0;
      },
      trial(rng) {
        const list = [];
        for (let i = 0; i < people; i++) list.push(rng.int(days));
        const seen = new Map();
        const shared = new Set();
        list.forEach((d) => { seen.set(d, (seen.get(d) || 0) + 1); if (seen.get(d) > 1) shared.add(d); });
        return { index: shared.size ? 1 : 0, list, shared: [...shared] };
      },
      stage: 'birthday',
    };
  },

  learn: {
    idea: `<p>In a room of just <b>23</b> people, there's a better-than-even chance that two share a birthday. It feels wrong because we imagine someone matching <i>our</i> birthday. But any pair counts — and 23 people make <b>253 pairs</b>.</p>`,
    theory: `<p>It's easier to find P(all different) and subtract from 1:</p>
      <p>P(all different) = 365/365 × 364/365 × 363/365 × … (one factor per person).</p>
      <p>P(shared) = 1 − P(all different). For 23 people that's 50.7%; for 50 people, 97%.</p>`,
    misconception: `<p><b>“You'd need about 183 people (half of 365).”</b> That's the number for someone to probably match <i>you</i>. For <i>any</i> match, pairs pile up fast: n people make n(n − 1)/2 pairs.</p>`,
    tryThis: [
      { label: 'The famous 23', text: 'Run 1,000 rooms of 23 people. Is it really about 50%?', config: { people: 23, days: 365 }, trials: 1000, speed: 6 },
      { label: 'A class of 30', text: 'In most classes of 30, two students share a birthday. Check it.', config: { people: 30, days: 365 }, trials: 2000, speed: 6 },
      { label: 'Months', text: 'With only 12 months, 5 people already match more often than not.', config: { people: 5, days: 12 }, trials: 1000, speed: 5 },
    ],
  },
};
