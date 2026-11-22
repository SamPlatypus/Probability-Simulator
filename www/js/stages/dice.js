import { h, scheduler, rand } from './util.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const STAT_WORD = { sum: 'Sum', max: 'Highest', min: 'Lowest' };

export default function diceStage(root, model, ctx) {
  const sched = scheduler();
  root.classList.add('st-dice');
  const table = h('div', 'dice-table', root);
  let dice = [];
  let sides = 0;

  function build(count, s) {
    table.textContent = '';
    sides = s;
    table.dataset.count = String(count);
    dice = [];
    for (let i = 0; i < count; i++) {
      const die = h('div', `die d${s}`, table);
      const face = h('div', 'die-face', die);
      if (s !== 6) h('span', 'die-tag', die, `d${s}`);
      dice.push({ die, face, value: 0 });
      setFace(dice[i], Math.ceil(s / 2));
    }
  }

  function setFace(d, v) {
    if (d.value === v) return;
    d.value = v;
    if (sides === 6) {
      d.face.className = 'die-face pips';
      d.face.textContent = '';
      for (let p = 0; p < 9; p++) {
        const cell = h('i', PIPS[v].includes(p) ? 'pip on' : 'pip', d.face);
        cell.setAttribute('aria-hidden', 'true');
      }
    } else {
      d.face.className = 'die-face num';
      d.face.textContent = String(v);
      d.face.classList.toggle('underline', (v === 6 || v === 9) && sides >= 9);
    }
  }

  build(model.diceCount, model.sides);

  function caption(t) {
    const n = t.faces.length;
    const value = model.outcomes[t.index].label;
    if (n === 1) ctx.caption(`Rolled ${value}`);
    else ctx.caption(`${STAT_WORD[t.stat]} ${value}`, t.stat === 'sum' ? t.faces.join(' + ') : t.faces.join(' · '));
    // Highlight the die that decided a max/min.
    dice.forEach((d, i) => d.die.classList.toggle('decider', t.stat !== 'sum' && n > 1 && t.faces[i] === model.outcomes[t.index].value));
  }

  function ensure(t) {
    if (t.faces.length !== dice.length || t.sides !== sides) build(t.faces.length, t.sides);
  }

  return {
    concurrent: false,
    async play(t, ms) {
      ensure(t);
      dice.forEach((d) => d.die.classList.remove('decider'));
      if (ms < 200 || ctx.reducedMotion()) {
        t.faces.forEach((v, i) => setFace(dice[i], v));
        dice.forEach((d) => sched.animate(d.die, [{ transform: 'scale(.88)' }, { transform: 'scale(1)' }], { duration: Math.min(ms, 150) }));
        caption(t);
        await sched.wait(ms);
        return;
      }
      ctx.sound('rattle');
      const dur = ms * 0.88;
      const stop = sched.every(Math.max(55, dur / 14), () => {
        dice.forEach((d) => setFace(d, 1 + Math.floor(Math.random() * sides)));
      });
      await Promise.all(dice.map((d, i) => {
        const dx = rand(-28, 28), dy = rand(-36, -16), spin = rand(300, 620) * (Math.random() < 0.5 ? -1 : 1);
        return sched.animate(d.die, [
          { transform: 'translate(0,0) rotate(0deg) scale(1)' },
          { transform: `translate(${dx}px, ${dy}px) rotate(${spin * 0.55}deg) scale(1.08)`, offset: 0.35 },
          { transform: `translate(${-dx * 0.4}px, 6px) rotate(${spin * 0.9}deg) scale(.98)`, offset: 0.7 },
          { transform: `translate(${dx * 0.1}px, -3px) rotate(${spin}deg) scale(1)`, offset: 0.88 },
          { transform: `translate(0,0) rotate(${Math.round(spin / 360) * 360}deg) scale(1)` },
        ], { duration: dur - i * 30, delay: i * 30, easing: 'cubic-bezier(.25,.7,.35,1)' });
      }));
      stop();
      t.faces.forEach((v, i) => setFace(dice[i], v));
      ctx.sound('clack');
      ctx.haptic();
      caption(t);
      await sched.wait(ms * 0.05);
    },
    show(t) {
      ensure(t);
      t.faces.forEach((v, i) => setFace(dice[i], v));
      caption(t);
    },
    cancel() { sched.cancel(); },
    destroy() { sched.cancel(); },
  };
}
