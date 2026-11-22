// The live outcome histogram: observed bars that grow as trials land, with the
// theoretical probability drawn as a reference mark on each bar, an optional
// learner prediction, and tap-to-select events.

import { fitCanvas } from '../stages/util.js';
import { readChartColors, niceStep, roundedBar, FONT, withAlpha } from './chart-util.js';
import { compact } from './format.js';

const BAR_MAX = 24;

export class Histogram {
  constructor(canvas, { onTap, onPredict } = {}) {
    this.canvas = canvas;
    this.onTap = onTap || (() => {});
    this.onPredict = onPredict || (() => {});
    this.model = null;
    this.disp = [];
    this.dispMax = 0;
    this.data = null;
    this.colors = readChartColors(canvas);
    this.lastDraw = 0;
    this.layout = null;
    this.reduced = false;
    this.bindPointer();
  }

  themeChanged() { this.colors = readChartColors(this.canvas); this.lastDraw = 0; }

  setModel(model) {
    this.model = model;
    this.disp = new Array(model.outcomes.length).fill(0);
    this.dispMax = 0;
  }

  /**
   * @param {{counts: Float64Array, n: number, mask: boolean[], anchor: number|null,
   *   prediction: number[]|null, showTheory: boolean, unit: 'pct'|'count', predicting: boolean}} d
   */
  setData(d) { this.data = d; }

  values() {
    const { counts, n, unit } = this.data;
    const k = this.model.outcomes.length;
    const obs = new Array(k), th = new Array(k);
    for (let i = 0; i < k; i++) {
      obs[i] = unit === 'pct' ? (n ? counts[i] / n : 0) : counts[i];
      th[i] = unit === 'pct' ? this.model.probs[i] : this.model.probs[i] * n;
    }
    let guess = null;
    if (this.data.prediction) {
      if (this.data.predicting) {
        // Raw shares while sketching, so other bars don't move under the finger.
        guess = this.data.prediction.slice();
      } else {
        const total = this.data.prediction.reduce((a, b) => a + b, 0) || 1;
        guess = this.data.prediction.map((g) => (unit === 'pct' ? g / total : (g / total) * n));
      }
    }
    return { obs, th, guess };
  }

  /** Draw a frame. Returns true while bars are still easing toward their targets. */
  draw(now = performance.now()) {
    if (!this.model || !this.data) return false;
    const { ctx: c, w, h } = fitCanvas(this.canvas);
    const col = this.colors;
    const m = this.model;
    const k = m.outcomes.length;
    const { obs, th, guess } = this.values();
    const { showTheory, mask, unit, predicting, n } = this.data;

    // Axis maximum: fit observed, theory and guess, with headroom.
    let target = 0;
    for (let i = 0; i < k; i++) {
      target = Math.max(target, obs[i], showTheory ? th[i] : 0, guess ? guess[i] : 0);
    }
    if (target <= 0) target = unit === 'pct' ? Math.max(...m.probs) : 1;
    target *= 1.12;
    // A fixed scale while sketching a prediction (it must not reveal the theory).
    if (predicting) target = predictScale(k);

    // Ease displayed values (bars grow smoothly rather than jump).
    const dt = this.lastDraw ? Math.min(100, now - this.lastDraw) : 1000;
    this.lastDraw = now;
    const a = this.reduced ? 1 : 1 - Math.exp(-dt / 70);
    let moving = false;
    if (this.dispMax === 0 || predicting) this.dispMax = target;
    this.dispMax += (target - this.dispMax) * a;
    if (Math.abs(target - this.dispMax) > target * 0.002) moving = true;
    for (let i = 0; i < k; i++) {
      const d = obs[i] - this.disp[i];
      this.disp[i] += d * a;
      if (Math.abs(d) > this.dispMax * 0.002) moving = true;
    }
    const yMax = this.dispMax;

    c.clearRect(0, 0, w, h);
    const horizontal = m.orientation === 'horizontal';
    c.font = `500 11px ${FONT}`;
    const step = niceStep(yMax, horizontal ? 3 : 4);
    const fmt = (v) => (unit === 'pct' ? pctTick(v, step) : compact(v));

    if (!horizontal) {
      // ---- Vertical columns ----
      let yLabelW = 0;
      for (let v = 0; v <= yMax + 1e-12; v += step) yLabelW = Math.max(yLabelW, c.measureText(fmt(v)).width);
      const L = { x: Math.ceil(yLabelW) + 10, y: 10, r: w - 6, b: h - 40 };
      L.w = L.r - L.x; L.h = L.b - L.y;
      const band = L.w / k;
      this.layout = { horizontal, L, band, k };
      const Y = (v) => L.b - (v / yMax) * L.h;

      // Gridlines + y labels.
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      for (let v = 0; v <= yMax + 1e-12; v += step) {
        const y = Math.round(Y(v)) + 0.5;
        c.strokeStyle = v === 0 ? col.axis : col.grid;
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(L.x, y); c.lineTo(L.r, y); c.stroke();
        c.fillStyle = col.ink3;
        c.fillText(fmt(v), L.x - 6, y);
      }

      // Bars.
      let barW = Math.min(BAR_MAX, band * 0.62);
      if (band - barW < 2) barW = Math.max(1, band - 2);
      if (band < 3) barW = band;
      for (let i = 0; i < k; i++) {
        const v = this.disp[i];
        if (v <= 0 || predicting) continue;
        const x = L.x + band * i + (band - barW) / 2;
        const y = Y(v);
        const color = barColor(m, i, col);
        c.fillStyle = mask[i] || m.outcomes[i].slot ? color : withAlpha(color, 0.32);
        roundedBar(c, x, y, barW, L.b - y, Math.min(4, barW / 2));
      }

      // Prediction (dashed: it's a projection).
      if (guess) {
        c.save();
        c.setLineDash([4, 3]);
        c.strokeStyle = col.guess;
        c.lineWidth = 2;
        if (predicting) c.fillStyle = withAlpha(col.guess, 0.14);
        if (k <= 40) {
          const gw = Math.max(barW + 8, Math.min(band - 2, barW + 14));
          for (let i = 0; i < k; i++) {
            const x = L.x + band * i + (band - gw) / 2;
            const y = Y(guess[i]);
            if (predicting) c.fillRect(x, y, gw, L.b - y);
            c.strokeRect(x + 1, y, gw - 2, L.b - y);
          }
        } else {
          c.beginPath();
          for (let i = 0; i < k; i++) {
            const x = L.x + band * (i + 0.5), y = Y(guess[i]);
            i ? c.lineTo(x, y) : c.moveTo(x, y);
          }
          c.stroke();
        }
        c.restore();
      }

      // Theory marks.
      if (showTheory) {
        if (k <= 40) {
          const tw = Math.max(Math.min(band - 1, barW + 10), 6);
          for (let i = 0; i < k; i++) {
            const x = L.x + band * i + (band - tw) / 2;
            const y = Math.round(Y(th[i]));
            c.fillStyle = col.surface;
            c.fillRect(x - 1, y - 2, tw + 2, 4);
            c.fillStyle = col.theory;
            c.fillRect(x, y - 1, tw, 2);
          }
        } else {
          c.lineJoin = 'round';
          for (const [stroke, lw] of [[col.surface, 4], [col.theory, 2]]) {
            c.strokeStyle = stroke; c.lineWidth = lw;
            c.beginPath();
            for (let i = 0; i < k; i++) {
              const x = L.x + band * (i + 0.5), y = Y(th[i]);
              i ? c.lineTo(x, y) : c.moveTo(x, y);
            }
            c.stroke();
          }
        }
      }

      // X labels, thinned to fit.
      c.font = `500 11px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      // Full names when every one fits its slot, else the short form.
      let fullW = 0;
      for (const o of m.outcomes) fullW = Math.max(fullW, c.measureText(o.label).width);
      const useFull = fullW + 8 <= band;
      const lab = (o) => (useFull ? o.label : o.short);
      let maxLW = 0;
      for (const o of m.outcomes) maxLW = Math.max(maxLW, c.measureText(lab(o)).width);
      let every = Math.max(1, Math.ceil((maxLW + 8) / band));
      if (every > 1 && m.numeric) every = [2, 5, 10, 20, 25, 50].find((s) => s >= every) || every;
      for (let i = 0; i < k; i++) {
        const o = m.outcomes[i];
        const show = every === 1 || (m.numeric ? o.value % every === 0 : i % every === 0);
        if (!show) continue;
        c.fillStyle = mask[i] ? col.ink : col.ink3;
        c.font = `${mask[i] ? 650 : 500} 11px ${FONT}`;
        c.fillText(lab(o), L.x + band * (i + 0.5), L.b + 6);
      }
      // Selection marks for categorical events: a short ink rule under each chosen label.
      if (!m.numeric) {
        c.fillStyle = col.ink;
        for (let i = 0; i < k; i++) {
          if (!mask[i]) continue;
          const cx = L.x + band * (i + 0.5);
          const lw = Math.min(band - 6, Math.max(14, c.measureText(lab(m.outcomes[i])).width));
          c.fillRect(cx - lw / 2, L.b + 21, lw, 2);
        }
      }
      // Anchor caret for numeric events.
      if (this.data.anchor !== null && this.data.anchor !== undefined && m.numeric) {
        const x = L.x + band * (this.data.anchor + 0.5);
        c.fillStyle = col.ink;
        c.beginPath();
        c.moveTo(x, L.b + 21); c.lineTo(x - 4, L.b + 26); c.lineTo(x + 4, L.b + 26); c.closePath(); c.fill();
      }
      c.fillStyle = col.ink3;
      c.font = `500 11px ${FONT}`;
      c.textBaseline = 'bottom';
      c.fillText(m.xTitle, L.x + L.w / 2, h - 1);

      if (n === 0 && !predicting && !guess) emptyHint(c, col, L, showTheory);
      if (predicting) predictHint(c, col, L);
    } else {
      // ---- Horizontal bars (long category names) ----
      c.font = `500 12px ${FONT}`;
      let labW = 0;
      for (const o of m.outcomes) labW = Math.max(labW, c.measureText(o.label).width);
      labW = Math.min(w * 0.42, labW + 12);
      const L = { x: labW, y: 4, r: w - 14, b: h - 22 };
      L.w = L.r - L.x; L.h = L.b - L.y;
      const band = L.h / k;
      this.layout = { horizontal, L, band, k };
      const X = (v) => L.x + (v / yMax) * L.w;
      c.textAlign = 'center';
      c.textBaseline = 'top';
      c.font = `500 11px ${FONT}`;
      for (let v = 0; v <= yMax + 1e-12; v += step) {
        const x = Math.round(X(v)) + 0.5;
        c.strokeStyle = v === 0 ? col.axis : col.grid;
        c.lineWidth = 1;
        c.beginPath(); c.moveTo(x, L.y); c.lineTo(x, L.b); c.stroke();
        c.fillStyle = col.ink3;
        c.fillText(fmt(v), Math.min(x, w - 14), L.b + 5);
      }
      let barH = Math.min(BAR_MAX - 6, band * 0.6);
      if (band - barH < 2) barH = Math.max(1, band - 2);
      for (let i = 0; i < k; i++) {
        const y = L.y + band * i + (band - barH) / 2;
        const v = this.disp[i];
        const color = barColor(m, i, col);
        if (v > 0 && !predicting) {
          c.fillStyle = mask[i] || m.outcomes[i].slot ? color : withAlpha(color, 0.32);
          // Rare outcomes get a minimum visible sliver once they've happened.
          roundedBar(c, L.x, y, Math.max(obs[i] > 0 ? 2 : 0, X(v) - L.x), barH, 4, true);
        }
        if (guess) {
          c.save(); c.setLineDash([4, 3]); c.strokeStyle = col.guess; c.lineWidth = 2;
          c.strokeRect(L.x, y - 3, X(guess[i]) - L.x, barH + 6);
          c.restore();
        }
        if (showTheory) {
          const x = Math.round(X(th[i]));
          c.fillStyle = col.surface;
          c.fillRect(x - 2, y - 6, 4, barH + 12);
          c.fillStyle = col.theory;
          c.fillRect(x - 1, y - 5, 2, barH + 10);
        }
        c.textAlign = 'right';
        c.textBaseline = 'middle';
        c.fillStyle = mask[i] ? col.ink : col.ink2;
        c.font = `${mask[i] ? 650 : 500} 12px ${FONT}`;
        c.fillText(m.outcomes[i].label, L.x - 8, y + barH / 2);
      }
      if (n === 0 && !predicting && !guess) emptyHint(c, col, L, showTheory);
      if (predicting) predictHint(c, col, L);
    }
    return moving;
  }

  indexAt(clientX, clientY) {
    if (!this.layout) return -1;
    const r = this.canvas.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    const { L, band, k, horizontal } = this.layout;
    const i = horizontal ? Math.floor((y - L.y) / band) : Math.floor((x - L.x) / band);
    if (horizontal ? x < 0 : y < 0) return -1;
    return i >= 0 && i < k ? i : -1;
  }

  /** In predict mode, the guess value under the pointer for the touched bar. */
  valueAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const { L, horizontal } = this.layout;
    const frac = horizontal ? (clientX - r.left - L.x) / L.w : (L.b - (clientY - r.top)) / L.h;
    return Math.max(0, Math.min(1, frac)) * (this.data.predicting ? predictScale(this.layout.k) : this.dispMax);
  }

  bindPointer() {
    const cv = this.canvas;
    let dragging = false, downAt = null;
    cv.addEventListener('pointerdown', (e) => {
      if (!this.data) return;
      if (this.data.predicting) {
        dragging = true;
        cv.setPointerCapture(e.pointerId);
        this.predictAt(e);
        e.preventDefault();
      } else {
        downAt = [e.clientX, e.clientY];
      }
    });
    cv.addEventListener('pointermove', (e) => {
      if (dragging) { this.predictAt(e); e.preventDefault(); }
    });
    const end = (e) => {
      if (dragging) { dragging = false; return; }
      if (downAt && e.type === 'pointerup') {
        const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
        if (moved < 10) {
          const i = this.indexAt(e.clientX, e.clientY);
          if (i >= 0) this.onTap(i);
        }
      }
      downAt = null;
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    // Keyboard: arrows move the selected outcome.
    cv.addEventListener('keydown', (e) => {
      if (!this.data || !this.model) return;
      const k = this.model.outcomes.length;
      const cur = this.data.anchor ?? (this.data.mask.indexOf(true));
      const fwd = this.model.orientation === 'horizontal' ? 'ArrowDown' : 'ArrowRight';
      const back = this.model.orientation === 'horizontal' ? 'ArrowUp' : 'ArrowLeft';
      if (e.key === fwd) { this.onTap(Math.min(k - 1, cur + 1)); e.preventDefault(); }
      if (e.key === back) { this.onTap(Math.max(0, cur - 1)); e.preventDefault(); }
    });
  }

  predictAt(e) {
    const i = this.indexAt(e.clientX, e.clientY);
    if (i < 0) return;
    // The guess is stored as a share (it is normalised for display).
    this.onPredict(i, this.valueAt(e.clientX, e.clientY));
  }
}

/** Axis maximum (as a share) used while the learner sketches a prediction. */
export function predictScale(k) {
  return Math.min(1, Math.max(0.1, 2.5 / k));
}

function barColor(m, i, col) {
  const slot = m.outcomes[i].slot;
  return slot ? col.series[slot - 1] : col.series[0];
}

function pctTick(v, step) {
  const p = v * 100;
  const s = step * 100;
  const d = s >= 1 ? 0 : s >= 0.1 ? 1 : s >= 0.01 ? 2 : 3;
  return p.toFixed(d) + '%';
}

function emptyHint(c, col, L, showTheory) {
  c.save();
  c.fillStyle = col.ink3;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `500 12px ${FONT}`;
  c.fillText(showTheory ? 'Marks show the theory. Press Run to add trials.' : 'Press Run — bars grow as trials land.', L.x + L.w / 2, L.y + 14);
  c.restore();
}

function predictHint(c, col, L) {
  c.save();
  c.fillStyle = col.guess;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `650 12px ${FONT}`;
  c.fillText('Drag up and down on each bar to sketch your guess', L.x + L.w / 2, L.y + 12);
  c.restore();
}
