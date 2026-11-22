// Content for the Learn sheet. Lesson text is the app's own static content.

import { h } from '../stages/util.js';
import { icon } from './icons.js';

export const BASICS = `
  <div class="callout">
    <p><b>Probability</b> is a number from 0 (impossible) to 1 (certain) — or 0% to 100% — saying how likely something is.</p>
  </div>
  <h3>Theoretical vs. experimental</h3>
  <p><b>Theoretical probability</b> comes from reasoning: a fair die has 6 equally likely faces, so P(6) = 1/6.
  <b>Experimental probability</b> comes from doing it: roll 600 times, get 94 sixes, so the experimental probability is 94/600 ≈ 15.7%.
  The bars show experimental results; the marks show theory.</p>
  <h3>The Law of Large Numbers</h3>
  <p>With a few trials, results jump around. With many trials, the experimental probability settles close to the theoretical one.
  The “Does it settle down?” chart shows this: the shaded band narrows as trials grow.</p>
  <h3>Variability is normal</h3>
  <p>Even a perfect coin rarely gives exactly 50 heads in 100 flips. Results naturally scatter around the theory, and
  the typical scatter shrinks in proportion to 1/√n: four times as many trials halves it.</p>
  <h3>Independence</h3>
  <p>Events are <b>independent</b> when one doesn't change the chances of the other — like separate coin flips.
  Drawing marbles <i>without</i> putting them back makes draws <b>dependent</b>.</p>
  <h3>Distributions</h3>
  <p>A <b>distribution</b> lists every outcome with its probability. The probabilities always add up to 100%.
  Its shape — flat, peaked, lopsided — tells a story about how the outcomes are produced.</p>
  <h3>Expected value</h3>
  <p>The <b>expected value</b> is the long-run average. For one die it's 3.5 — a value you can never roll, but the average
  your rolls approach.</p>
  <h3>Is the theory right? (fit checks)</h3>
  <p>The app asks: “If the theory were true, how often would a gap this big happen just by chance?” If the answer is
  rare (under 5%), the results are surprising — maybe the model is wrong, like a loaded die. But remember: about
  1 run in 20 looks surprising even when the theory is right.</p>`;

export const HOW_TO = `
  <ol class="welcome-steps">
    <li><div><b>Pick an experiment</b> from the row of tabs.</div></li>
    <li><div><b>Choose how many trials</b> and a <b>speed</b>. Slow speeds act out every trial; fast speeds run thousands per second.</div></li>
    <li><div><b>Press Run</b> and watch the bars grow. Black marks show the theoretical probability.</div></li>
    <li><div><b>Tap a bar</b> to watch an event (like “Sum ≥ 9”) and compare observed with theory.</div></li>
    <li><div><b>Predict first!</b> Tap Predict, sketch your guess, then run and see how you did.</div></li>
  </ol>
  <h3>Keyboard</h3>
  <p><span class="kbd">Space</span> run / pause · <span class="kbd">S</span> one trial · <span class="kbd">R</span> reset · <span class="kbd">←</span> <span class="kbd">→</span> choose a bar</p>
  <h3>For teachers</h3>
  <p>In Settings, set a <b>fixed seed</b>: everyone using the same seed gets exactly the same “random” results, so a class can compare notes.
  Everything runs on the device — no account, no network, no data collected.</p>`;

/** Build the per-experiment lesson into `body`. `onTry(item)` applies a suggestion. */
export function buildLesson(body, exp, onTry) {
  const prose = h('div', 'prose', body);
  section(prose, 'sparkle', 'The big idea', exp.learn.idea);
  const theory = section(prose, 'target', 'The theory', exp.learn.theory);
  theory.classList.add('callout');
  const mis = section(prose, 'info', 'Watch out', exp.learn.misconception);
  mis.classList.add('callout', 'warn');
  const tryHead = h('h3', '', prose);
  tryHead.append(icon('play'), document.createTextNode('Try this'));
  const list = h('div', 'try-list', prose);
  for (const t of exp.learn.tryThis) {
    const b = h('button', 'try', list);
    b.type = 'button';
    h('b', '', b, t.label);
    h('span', '', b, t.text);
    const go = h('span', 'go', b, 'Set up');
    go.append(icon('chevron'));
    b.addEventListener('click', () => onTry(t));
  }
}

function section(parent, ic, title, html) {
  const head = h('h3', '', parent);
  head.append(icon(ic), document.createTextNode(title));
  const div = h('div', '', parent);
  div.innerHTML = html;
  return div;
}
