import { h, scheduler } from './util.js';
import { MARBLE_COLORS } from '../experiments/marbles.js';

/** Deterministic shuffle so the jar looks mixed but doesn't jump around. */
function mixedOrder(n) {
  const order = Array.from({ length: n }, (_, i) => i);
  let s = 12345;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export default function marblesStage(root, model, ctx) {
  const sched = scheduler();
  root.classList.add('st-marbles');
  const field = h('div', 'mb-field', root);
  const jar = h('div', 'mb-jar', field);
  h('div', 'mb-jar-neck', jar);
  const trayEl = h('div', 'mb-tray', field);
  const trayTitle = h('div', 'mb-tray-title', trayEl, model.replace ? 'Drawn (each put back)' : 'Drawn (kept out)');
  trayTitle.setAttribute('aria-hidden', 'true');

  const N = model.bag.length;
  const k = model.draws;
  const order = mixedOrder(N);
  const marbles = model.bag.map((color, id) => {
    const m = h('div', `marble slot-${MARBLE_COLORS[color].slot}`, field);
    m.dataset.id = String(id);
    return { el: m, color, home: [0, 0], out: -1 };
  });
  const slots = [];
  for (let j = 0; j < k; j++) slots.push(h('div', 'mb-slot', trayEl));
  let ghosts = [];
  let size = 18;
  let geo = null;

  function layout() {
    const fr = field.getBoundingClientRect();
    if (!fr.width) return;
    const jr = jar.getBoundingClientRect();
    const jx = jr.left - fr.left, jy = jr.top - fr.top, jw = jr.width, jh = jr.height;
    const pad = 10;
    // Pick the largest marble size that fits everything in the jar.
    size = Math.max(10, Math.min(26, Math.floor(Math.sqrt(((jw - 2 * pad) * (jh * 0.72)) / Math.max(N, 1)) * 0.86)));
    field.style.setProperty('--marble', `${size}px`);
    const cols = Math.max(1, Math.floor((jw - 2 * pad) / (size * 1.04)));
    order.forEach((id, slot) => {
      const r = Math.floor(slot / cols), c = slot % cols;
      const rowCount = Math.min(cols, N - r * cols);
      const offset = (jw - 2 * pad - rowCount * size * 1.04) / 2;
      const x = jx + pad + offset + c * size * 1.04 + size / 2 + (r % 2 ? size * 0.25 : -size * 0.1);
      const y = jy + jh - pad - r * size * 0.9 - size / 2;
      marbles[id].home = [x, y];
    });
    const tr = trayEl.getBoundingClientRect();
    geo = { slots: slots.map((s) => { const b = s.getBoundingClientRect(); return [b.left - fr.left + b.width / 2, b.top - fr.top + b.height / 2]; }), tray: tr };
    marbles.forEach((m) => place(m.el, m.out >= 0 ? geo.slots[m.out] : m.home));
    ghosts.forEach((g) => place(g.el, geo.slots[g.slot]));
  }

  function place(el, [x, y]) { el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`; }

  const ro = new ResizeObserver(() => layout());
  ro.observe(field);
  requestAnimationFrame(layout);

  function resetBag() {
    ghosts.forEach((g) => g.el.remove());
    ghosts = [];
    marbles.forEach((m) => {
      if (m.out >= 0) { m.out = -1; place(m.el, m.home); }
      m.el.classList.remove('picked');
    });
  }

  function caption(t) {
    const names = t.colors.map((c) => MARBLE_COLORS[c].label);
    if (k === 1) ctx.caption(names[0]);
    else {
      const blue = t.colors.filter((c) => c === 0).length;
      ctx.caption(`${blue} blue`, names.join(', '));
    }
  }

  async function drawOne(t, j, ms) {
    const id = t.ids[j];
    const m = marbles[id];
    if (!geo) layout();
    const to = geo ? geo.slots[j] : m.home;
    const from = m.home;
    const lift = [from[0], Math.min(from[1], (geo ? geo.tray.top - field.getBoundingClientRect().top : 0) + 4)];
    let mover;
    if (model.replace) {
      // A copy goes to the tray as the record; the marble itself stays in the bag.
      mover = h('div', `marble ghost slot-${MARBLE_COLORS[m.color].slot}`, field);
      ghosts.push({ el: mover, slot: j });
      m.el.classList.add('picked');
      sched.wait(ms).then(() => m.el.classList.remove('picked'));
    } else {
      mover = m.el;
      m.out = j;
    }
    const kf = [
      { transform: `translate(${from[0]}px, ${from[1]}px) translate(-50%, -50%) scale(1)` },
      { transform: `translate(${lift[0]}px, ${lift[1] - 30}px) translate(-50%, -50%) scale(1.25)`, offset: 0.45 },
      { transform: `translate(${to[0]}px, ${to[1]}px) translate(-50%, -50%) scale(1)` },
    ];
    place(mover, to);
    await sched.animate(mover, kf, { duration: ms, easing: 'cubic-bezier(.3,.7,.3,1)' });
    ctx.sound('pop');
  }

  return {
    concurrent: false,
    async play(t, ms) {
      resetBag();
      if (ms < 260 || ctx.reducedMotion()) {
        this.show(t);
        await sched.wait(ms);
        return;
      }
      const step = (ms * 0.9) / k;
      for (let j = 0; j < k; j++) {
        await drawOne(t, j, step * 0.92);
        await sched.wait(step * 0.08);
      }
      ctx.haptic();
      caption(t);
    },
    show(t) {
      resetBag();
      if (!geo) layout();
      t.ids.forEach((id, j) => {
        const m = marbles[id];
        const to = geo ? geo.slots[j] : m.home;
        if (model.replace) {
          const g = h('div', `marble ghost slot-${MARBLE_COLORS[m.color].slot}`, field);
          ghosts.push({ el: g, slot: j });
          place(g, to);
        } else {
          m.out = j;
          place(m.el, to);
        }
      });
      caption(t);
    },
    cancel() { sched.cancel(); resetBag(); },
    destroy() { sched.cancel(); ro.disconnect(); },
  };
}
