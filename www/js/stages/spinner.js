import { h, svg, scheduler } from './util.js';

const R = 92; // wheel radius in SVG units (viewBox is 200 × 200, centred at 100,100)

function polar(deg, r) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
}

export default function spinnerStage(root, model, ctx) {
  const sched = scheduler();
  root.classList.add('st-spinner');
  const box = h('div', 'spin-box', root);
  const s = svg('svg', { viewBox: '0 0 200 200', class: 'spin-svg', role: 'img', 'aria-label': 'Spinner wheel' }, box);
  svg('circle', { cx: 100, cy: 100, r: R + 5, class: 'spin-rim' }, s);
  const wheel = svg('g', { class: 'spin-wheel' }, s);
  const sectors = [];
  let start = 0;
  model.bounds.forEach((end, i) => {
    const slot = model.outcomes[i].slot;
    let path;
    if (model.bounds.length === 1) {
      path = svg('circle', { cx: 100, cy: 100, r: R }, wheel);
    } else {
      const [x1, y1] = polar(start, R), [x2, y2] = polar(end, R);
      const large = end - start > 180 ? 1 : 0;
      path = svg('path', { d: `M100 100 L${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} Z` }, wheel);
    }
    path.setAttribute('class', `sector slot-${slot}`);
    path.style.fill = `var(--s${slot})`;
    sectors.push(path);
    const mid = (start + end) / 2;
    if (end - start >= 16) {
      const [tx, ty] = polar(mid, R * (end - start > 90 ? 0.58 : 0.68));
      const t = svg('text', { x: tx, y: ty, class: `sector-label slot-${slot}`, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, wheel);
      t.textContent = model.outcomes[i].label;
    }
    start = end;
  });
  // Tick marks around the rim help show that every angle is equally likely.
  for (let a = 0; a < 360; a += 10) {
    const [x1, y1] = polar(a, R + 1), [x2, y2] = polar(a, R + (a % 30 ? 3 : 5));
    svg('line', { x1, y1, x2, y2, class: 'spin-tick' }, s);
  }
  svg('circle', { cx: 100, cy: 100, r: 13, class: 'spin-hub' }, s);
  svg('circle', { cx: 100, cy: 100, r: 4.5, class: 'spin-hub-dot' }, s);
  svg('path', { d: 'M100 17 L91 1 Q100 -3 109 1 Z', class: 'spin-pointer' }, s);

  let rotation = 0;
  const setRot = (deg) => { wheel.style.transform = `rotate(${deg}deg)`; };

  function targetFor(angle, turns) {
    const want = ((-angle % 360) + 360) % 360;
    const cur = ((rotation % 360) + 360) % 360;
    let delta = want - cur;
    if (delta < 0) delta += 360;
    return rotation + turns * 360 + delta;
  }

  function land(t) {
    sectors.forEach((p, i) => p.classList.toggle('won', i === t.index));
    ctx.caption(`Sector ${model.outcomes[t.index].label}`, `stopped at ${Math.round(t.angle)}°`);
  }

  return {
    concurrent: false,
    async play(t, ms) {
      sectors.forEach((p) => p.classList.remove('won'));
      if (ms < 220 || ctx.reducedMotion()) {
        rotation = targetFor(t.angle, 0);
        setRot(rotation);
        land(t);
        await sched.wait(ms);
        return;
      }
      const turns = Math.max(1, Math.min(5, Math.round(ms / 380)));
      const from = rotation;
      rotation = targetFor(t.angle, turns);
      ctx.sound('spin');
      await sched.animate(wheel, [{ transform: `rotate(${from}deg)` }, { transform: `rotate(${rotation}deg)` }],
        { duration: ms * 0.92, easing: 'cubic-bezier(.12,.62,.18,1)' });
      setRot(rotation);
      ctx.sound('tick');
      ctx.haptic();
      land(t);
      await sched.wait(ms * 0.08);
    },
    show(t) {
      rotation = targetFor(t.angle, 0);
      setRot(rotation);
      land(t);
    },
    cancel() { sched.cancel(); setRot(rotation); },
    destroy() { sched.cancel(); },
  };
}
