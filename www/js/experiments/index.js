import coins from './coins.js';
import dice from './dice.js';
import spinner from './spinner.js';
import marbles from './marbles.js';
import cards from './cards.js';
import galton from './galton.js';
import monty from './monty.js';
import birthday from './birthday.js';

export const EXPERIMENTS = [coins, dice, spinner, marbles, cards, galton, monty, birthday];

export function getExperiment(id) {
  return EXPERIMENTS.find((e) => e.id === id) || EXPERIMENTS[0];
}

/** Defaults + saved config, cleaned up by the experiment if it wants to. */
export function resolveConfig(exp, saved) {
  let c = { ...exp.defaults };
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(exp.defaults)) {
      const d = exp.defaults[k];
      if (k in saved && typeof saved[k] === typeof d && Array.isArray(saved[k]) === Array.isArray(d)) c[k] = saved[k];
    }
  }
  if (exp.fixConfig) c = exp.fixConfig(c);
  return c;
}
