import coins from './coins.js';
import dice from './dice.js';
import spinner from './spinner.js';
import marbles from './marbles.js';
import cards from './cards.js';
import galton from './galton.js';
import monty from './monty.js';
import birthday from './birthday.js';

const STAGES = { coins, dice, spinner, marbles, cards, galton, monty, birthday };

/**
 * Mount the animated stage for a model into `root`.
 * ctx: { caption(main, sub), sound(name), haptic(), reducedMotion(), results() }
 */
export function mountStage(root, model, ctx) {
  root.textContent = '';
  root.className = 'stage-canvas';
  const stage = STAGES[model.stage](root, model, ctx);
  return {
    concurrent: false,
    flightTime: () => 800,
    sync() {},
    themeChanged() {},
    ...stage,
  };
}
