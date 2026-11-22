import { h, scheduler, rand } from './util.js';

export default function coinsStage(root, model, ctx) {
  const single = !model.numeric;
  const n = single ? 1 : model.outcomes.length - 1;
  const sched = scheduler();
  root.classList.add('st-coins');
  const tray = h('div', 'coin-tray', root);
  tray.dataset.count = String(n);
  const coins = [];
  for (let i = 0; i < n; i++) {
    const wrap = h('div', 'coin-wrap', tray);
    const coin = h('div', 'coin', wrap);
    h('div', 'coin-face heads', coin).innerHTML = '<span>H</span>';
    h('div', 'coin-face tails', coin).innerHTML = '<span>T</span>';
    const shadow = h('div', 'coin-shadow', wrap);
    coins.push({ wrap, coin, shadow, angle: 0 });
  }

  const caption = (t) => {
    const k = t.faces.filter(Boolean).length;
    if (single) ctx.caption(k ? 'Heads' : 'Tails');
    else ctx.caption(`${k} head${k === 1 ? '' : 's'}`, `${n - k} tails`);
  };

  function setFaces(faces) {
    faces.forEach((heads, i) => {
      const c = coins[i];
      c.angle = heads ? 0 : 180;
      c.coin.style.transform = `rotateX(${c.angle}deg)`;
      c.wrap.classList.toggle('is-tails', !heads);
    });
  }

  return {
    concurrent: false,
    async play(trial, ms) {
      if (ms < 180 || ctx.reducedMotion()) {
        setFaces(trial.faces);
        coins.forEach((c) => sched.animate(c.coin, [{ transform: `rotateX(${c.angle}deg) scale(.86)` }, { transform: `rotateX(${c.angle}deg) scale(1)` }], { duration: Math.min(ms, 160), easing: 'ease-out' }));
        caption(trial);
        await sched.wait(ms);
        return;
      }
      ctx.sound('toss');
      const stagger = Math.min(70, (ms * 0.12) / Math.max(1, n - 1));
      const lift = Math.min(90, 30 + ms * 0.06);
      const done = trial.faces.map((heads, i) => {
        const c = coins[i];
        const start = c.angle % 360;
        const spins = Math.max(2, Math.round(ms / 260)) + (i % 2);
        const end = (heads ? 0 : 180) + 360 * spins;
        const delay = i * stagger;
        const dur = Math.max(140, ms * 0.86 - delay);
        c.angle = heads ? 0 : 180;
        c.wrap.classList.toggle('is-tails', !heads);
        const wobble = rand(-8, 8);
        sched.animate(c.shadow, [
          { transform: 'scaleX(1)', opacity: 0.55 },
          { transform: 'scaleX(.45)', opacity: 0.2, offset: 0.45 },
          { transform: 'scaleX(1)', opacity: 0.55 },
        ], { duration: dur, delay, easing: 'ease-in-out', fill: 'backwards' });
        return sched.animate(c.coin, [
          { transform: `translateY(0) rotateX(${start}deg) rotateZ(0deg)` },
          { transform: `translateY(-${lift}px) rotateX(${(start + end) / 2}deg) rotateZ(${wobble}deg)`, offset: 0.45, easing: 'cubic-bezier(.45,0,.75,.4)' },
          { transform: `translateY(0) rotateX(${end}deg) rotateZ(0deg)`, offset: 0.9 },
          { transform: `translateY(-4px) rotateX(${end}deg)`, offset: 0.95 },
          { transform: `translateY(0) rotateX(${end}deg)` },
        ], { duration: dur, delay, easing: 'cubic-bezier(.2,.6,.35,1)', fill: 'backwards' })
          .then(() => { c.coin.style.transform = `rotateX(${c.angle}deg)`; });
      });
      await Promise.all(done);
      ctx.sound('coin');
      ctx.haptic();
      caption(trial);
      await sched.wait(ms * 0.04);
    },
    show(trial) {
      setFaces(trial.faces);
      caption(trial);
    },
    cancel() { sched.cancel(); },
    destroy() { sched.cancel(); },
  };
}
