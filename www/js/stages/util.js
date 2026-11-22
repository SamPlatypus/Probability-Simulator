// Small helpers shared by the stage animations.

export function h(tag, cls, parent, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
}

export function svg(tag, attrs = {}, parent) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

/**
 * Timers and animations that can all be cancelled at once (Reset, config
 * change). Cancelled waits resolve immediately so nothing is left hanging.
 */
export function scheduler() {
  const timers = new Set();
  const anims = new Set();
  return {
    wait(ms) {
      return new Promise((resolve) => {
        const entry = { resolve };
        entry.t = setTimeout(() => { timers.delete(entry); resolve(); }, Math.max(0, ms));
        timers.add(entry);
      });
    },
    animate(node, keyframes, options) {
      if (!node.animate) return Promise.resolve();
      const a = node.animate(keyframes, options);
      anims.add(a);
      return a.finished.then(() => {}, () => {}).finally(() => anims.delete(a));
    },
    every(ms, fn) {
      const id = setInterval(fn, ms);
      const entry = { resolve() {}, t: id, interval: true };
      timers.add(entry);
      return () => { clearInterval(id); timers.delete(entry); };
    },
    cancel() {
      for (const e of timers) { if (e.interval) clearInterval(e.t); else clearTimeout(e.t); e.resolve(); }
      timers.clear();
      for (const a of anims) a.cancel();
      anims.clear();
    },
  };
}

export const rand = (a, b) => a + Math.random() * (b - a);

/** Read a CSS custom property from the document root. */
export function cssVar(name, el = document.documentElement) {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

/** Canvas sized to its CSS box at device pixel ratio. Returns ctx + logical size. */
export function fitCanvas(canvas) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width)), hgt = Math.max(1, Math.round(rect.height));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h: hgt, dpr };
}
