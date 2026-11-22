import { h, scheduler } from './util.js';

export default function montyStage(root, model, ctx) {
  const sched = scheduler();
  root.classList.add('st-monty');
  const hall = h('div', 'monty-hall', root);
  let doors = [];

  function build(n) {
    hall.textContent = '';
    hall.dataset.count = String(n);
    doors = [];
    for (let i = 0; i < n; i++) {
      const d = h('div', 'door', hall);
      const prize = h('div', 'door-prize', d);
      const panel = h('div', 'door-panel', d);
      h('span', 'door-num', panel, String(i + 1));
      h('i', 'door-knob', panel);
      const tag = h('div', 'door-tag', d);
      doors.push({ d, prize, panel, tag });
    }
  }
  build(Math.max(3, model.doorsCount || 3));

  function reset(t) {
    if (doors.length !== t.doors) build(t.doors);
    doors.forEach((x, i) => {
      x.d.className = 'door';
      x.prize.textContent = i === t.car ? '🚗' : '🐐';
      x.prize.setAttribute('aria-label', i === t.car ? 'car' : 'goat');
      x.tag.textContent = '';
    });
  }
  const mark = (i, cls, text) => { doors[i].d.classList.add(cls); if (text) doors[i].tag.textContent = text; };

  const result = (t) => {
    const lbl = model.outcomes[t.index].label;
    ctx.caption(lbl, t.index === 0 ? 'Your first pick had the car' : t.index === 1 ? 'The car was behind the other door' : 'The car was behind a door you didn\'t switch to');
  };

  function final(t) {
    reset(t);
    mark(t.pick, 'picked', 'You');
    t.opened.forEach((i) => mark(i, 'open'));
    if (t.switchTo !== undefined) mark(t.switchTo, 'switch', t.switchTo === t.pick ? '' : 'Switch');
    doors.forEach((x, i) => { x.d.classList.add('open'); if (i === t.car) x.d.classList.add('car'); });
    result(t);
  }

  return {
    concurrent: false,
    async play(t, ms) {
      if (ms < 450 || ctx.reducedMotion()) {
        final(t);
        await sched.wait(ms);
        return;
      }
      reset(t);
      ctx.caption('Pick a door…');
      await sched.wait(ms * 0.12);
      mark(t.pick, 'picked', 'You');
      ctx.sound('tick');
      await sched.wait(ms * 0.2);
      ctx.caption('The host opens goat doors', 'He knows where the car is');
      t.opened.forEach((i) => mark(i, 'open'));
      ctx.sound('creak');
      await sched.wait(ms * 0.26);
      mark(t.switchTo, 'switch', 'Switch');
      ctx.caption('Stay or switch?');
      await sched.wait(ms * 0.2);
      doors.forEach((x, i) => { x.d.classList.add('open'); if (i === t.car) x.d.classList.add('car'); });
      ctx.sound(t.index === 1 ? 'win' : 'tick');
      ctx.haptic();
      result(t);
      await sched.wait(ms * 0.2);
    },
    show(t) { final(t); },
    cancel() { sched.cancel(); },
    destroy() { sched.cancel(); },
  };
}
