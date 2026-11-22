// Law-of-large-numbers chart: the running share of trials that landed in the
// watched event, on a log trial axis, against the theoretical probability and
// the band where 95% of runs would be (p ± 1.96·√(p(1−p)/n)). The band's funnel
// shape shows variability shrinking like 1/√n.

import { fitCanvas } from '../stages/util.js';
import { readChartColors, niceStep, FONT, withAlpha } from './chart-util.js';
import { compact, int, pct } from './format.js';

export class ConvergenceChart {
  constructor(canvas, tooltip) {
    this.canvas = canvas;
    this.tip = tooltip;
    this.colors = readChartColors(canvas);
    this.data = { n: [], f: [], p: 0 };
    this.hoverX = null;
    this.layout = null;
    this.bind();
  }

  themeChanged() { this.colors = readChartColors(this.canvas); }

  setData(d) { this.data = d; }

  draw() {
    const { ctx: c, w, h } = fitCanvas(this.canvas);
    const col = this.colors;
    const { n, f, p } = this.data;
    c.clearRect(0, 0, w, h);
    const last = n.length ? n[n.length - 1] : 0;
    const xMaxN = Math.max(10, niceCeilLog(last));
    const lx = (v) => Math.log10(Math.max(1, v));
    const lmax = lx(xMaxN);

    // y range: whole 0–100% for common events, zoomed for rare ones.
    let yMax = 1;
    if (p < 0.3) {
      let m = p + 2.6 * Math.sqrt((p * (1 - p)) / 20);
      for (let i = 0; i < n.length; i++) if (n[i] >= 20) m = Math.max(m, f[i]);
      const st = niceStep(m * 1.1, 4);
      yMax = Math.min(1, Math.ceil((m * 1.1) / st) * st);
    }
    c.font = `500 11px ${FONT}`;
    const step = niceStep(yMax, 4);
    let yw = 0;
    for (let v = 0; v <= yMax + 1e-12; v += step) yw = Math.max(yw, c.measureText(tick(v, step)).width);
    const L = { x: Math.ceil(yw) + 10, y: 10, r: w - 12, b: h - 22 };
    L.w = L.r - L.x; L.h = L.b - L.y;
    const X = (v) => L.x + (lx(v) / lmax) * L.w;
    const Y = (v) => L.b - (Math.min(yMax, Math.max(0, v)) / yMax) * L.h;
    this.layout = { L, X, lmax, lx };

    // Grid.
    c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let v = 0; v <= yMax + 1e-12; v += step) {
      const y = Math.round(Y(v)) + 0.5;
      c.strokeStyle = v === 0 ? col.axis : col.grid; c.lineWidth = 1;
      c.beginPath(); c.moveTo(L.x, y); c.lineTo(L.r, y); c.stroke();
      c.fillStyle = col.ink3; c.fillText(tick(v, step), L.x - 6, y);
    }
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let e = 0; 10 ** e <= xMaxN; e++) {
      const x = Math.round(X(10 ** e)) + 0.5;
      c.strokeStyle = col.grid;
      c.beginPath(); c.moveTo(x, L.y); c.lineTo(x, L.b); c.stroke();
      c.fillStyle = col.ink3;
      c.fillText(compact(10 ** e), Math.min(Math.max(x, L.x + 6), L.r - 8), L.b + 6);
    }

    c.save();
    c.beginPath(); c.rect(L.x, L.y - 4, L.w, L.h + 8); c.clip();

    // 95% band.
    if (p > 0 && p < 1) {
      const pts = 80;
      c.beginPath();
      for (let s = 0; s <= pts; s++) {
        const nn = 10 ** ((s / pts) * lmax);
        const y = Y(p + 1.96 * Math.sqrt((p * (1 - p)) / nn));
        s ? c.lineTo(X(nn), y) : c.moveTo(X(nn), y);
      }
      for (let s = pts; s >= 0; s--) {
        const nn = 10 ** ((s / pts) * lmax);
        c.lineTo(X(nn), Y(p - 1.96 * Math.sqrt((p * (1 - p)) / nn)));
      }
      c.closePath();
      c.fillStyle = col.band;
      c.fill();
    }
    // Theory line.
    c.strokeStyle = col.theory; c.lineWidth = 1.5;
    const ty = Math.round(Y(p)) + 0.5;
    c.beginPath(); c.moveTo(L.x, ty); c.lineTo(L.r, ty); c.stroke();

    // Observed running frequency.
    if (n.length) {
      c.strokeStyle = col.series[0]; c.lineWidth = 2; c.lineJoin = 'round'; c.lineCap = 'round';
      c.beginPath();
      for (let i = 0; i < n.length; i++) {
        const x = X(n[i]), y = Y(f[i]);
        i ? c.lineTo(x, y) : c.moveTo(x, y);
      }
      c.stroke();
    }
    c.restore();

    // End marker + labels.
    c.font = `600 11px ${FONT}`;
    c.textBaseline = 'bottom';
    c.textAlign = 'left';
    c.fillStyle = col.ink2;
    const thLabel = `Theory ${pct(p)}`;
    c.fillText(thLabel, L.x + 4, ty - 3 < L.y + 12 ? ty + 15 : ty - 3);
    if (n.length) {
      const ex = X(n[n.length - 1]), ey = Y(f[f.length - 1]);
      dot(c, ex, ey, col.series[0], col.surface);
    }

    // Crosshair.
    if (this.hoverX !== null && n.length) {
      const target = 10 ** (((this.hoverX - L.x) / L.w) * lmax);
      let bi = 0;
      for (let i = 1; i < n.length; i++) if (Math.abs(lx(n[i]) - lx(target)) < Math.abs(lx(n[bi]) - lx(target))) bi = i;
      const x = Math.round(X(n[bi])) + 0.5;
      c.strokeStyle = col.ink3; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x, L.y); c.lineTo(x, L.b); c.stroke();
      dot(c, X(n[bi]), Y(f[bi]), col.series[0], col.surface);
      this.showTip(n[bi], f[bi], p, x, L);
    } else if (this.tip) {
      this.tip.hidden = true;
    }
    if (!n.length) {
      c.fillStyle = col.ink3; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `500 12px ${FONT}`;
      c.fillText('Your running % will trace a path here', L.x + L.w / 2, L.y + L.h * 0.25);
    }
  }

  showTip(nn, ff, p, x, L) {
    if (!this.tip) return;
    const band = p > 0 && p < 1 ? 1.96 * Math.sqrt((p * (1 - p)) / nn) : 0;
    const inside = Math.abs(ff - p) <= band + 1e-12;
    this.tip.hidden = false;
    this.tip.querySelector('[data-k="n"]').textContent = `After ${int(nn)} trial${nn === 1 ? '' : 's'}`;
    this.tip.querySelector('[data-k="obs"]').textContent = pct(ff);
    this.tip.querySelector('[data-k="th"]').textContent = pct(p);
    this.tip.querySelector('[data-k="band"]').textContent = band ? `${pct(Math.max(0, p - band))} – ${pct(Math.min(1, p + band))}${inside ? '' : ' (outside)'}` : '—';
    const tw = this.tip.offsetWidth || 160;
    const left = Math.min(Math.max(x - tw / 2, 4), this.canvas.clientWidth - tw - 4);
    this.tip.style.transform = `translate(${left}px, 0)`;
  }

  bind() {
    const cv = this.canvas;
    const move = (e) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left;
      if (!this.layout || x < this.layout.L.x - 10) { this.hoverX = null; } else this.hoverX = Math.min(this.layout.L.r, Math.max(this.layout.L.x, x));
      this.draw();
    };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerdown', move);
    cv.addEventListener('pointerleave', () => { this.hoverX = null; this.draw(); });
    cv.addEventListener('pointercancel', () => { this.hoverX = null; this.draw(); });
  }
}

function niceCeilLog(v) {
  if (v <= 10) return 10;
  const e = Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (m * 10 ** e >= v) return m * 10 ** e;
  return 10 ** (e + 1);
}

function tick(v, step) {
  const d = step * 100 >= 1 ? 0 : step * 100 >= 0.1 ? 1 : 2;
  return (v * 100).toFixed(d) + '%';
}

function dot(c, x, y, fill, ring) {
  c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fillStyle = ring; c.fill();
  c.beginPath(); c.arc(x, y, 4, 0, Math.PI * 2); c.fillStyle = fill; c.fill();
}

export { withAlpha };
