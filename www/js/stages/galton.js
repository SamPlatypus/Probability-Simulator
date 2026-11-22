import { h, fitCanvas, cssVar } from './util.js';

const MAX_BALLS = 160;

export default function galtonStage(root, model, ctx) {
  root.classList.add('st-galton');
  const canvas = h('canvas', 'galton-canvas', root);
  canvas.setAttribute('aria-hidden', 'true');
  const rows = model.rows;
  const bins = rows + 1;
  let balls = []; // { path, k, t0, dur, resolve, counted }
  let raf = 0;
  let colors = null;
  let g = null; // geometry

  function readColors() {
    colors = {
      peg: cssVar('--peg'),
      ball: cssVar('--s1'),
      ballHi: cssVar('--ball-hi'),
      bin: cssVar('--s1'),
      binWash: cssVar('--bin-wash'),
      wall: cssVar('--line'),
      text: cssVar('--ink-3'),
    };
  }

  function geometry() {
    const { ctx: c, w, h: H } = fitCanvas(canvas);
    const binH = Math.max(46, H * 0.3);
    const top = 22;
    const boardH = H - binH - top - 8;
    const dx = Math.min((w - 24) / (bins + 0.5), (boardH / Math.max(1, rows)) * 1.35);
    const dy = rows > 0 ? Math.min(boardH / rows, dx * 0.95) : boardH;
    const cx = w / 2;
    const pegTop = top + (boardH - dy * (rows - 1)) / 2 - dy * 0.3;
    g = { c, w, H, binH, top, dx, dy, cx, pegTop, binTop: H - binH, ballR: Math.max(2.5, Math.min(6, dx * 0.22)) };
  }

  // Position of a ball after i bounces having gone right k times.
  const px = (i, k) => g.cx + (k - i / 2) * g.dx;
  const py = (i) => g.pegTop + i * g.dy - g.ballR - 3;

  function ballPos(b, now) {
    const t = Math.min(1, (now - b.t0) / b.dur);
    // Segments: drop to peg 0, then one per row, then into the bin.
    const segs = rows + 1;
    const fallFrac = 0.22;
    if (t >= 1 - fallFrac) {
      const s = (t - (1 - fallFrac)) / fallFrac;
      const x0 = px(rows, b.k), y0 = py(rows);
      const y1 = g.H - 4 - g.ballR;
      return [x0, y0 + (y1 - y0) * s * s];
    }
    const u = (t / (1 - fallFrac)) * segs;
    const i = Math.min(segs - 1, Math.floor(u));
    const s = u - i;
    if (i === 0) {
      const y0 = g.top - g.ballR;
      return [g.cx, y0 + (py(0) - y0) * s * s];
    }
    const row = i - 1;
    let k = 0;
    for (let j = 0; j < row; j++) if (b.path[j]) k++;
    const k2 = k + (b.path[row] ? 1 : 0);
    const x = px(row, k) + (px(row + 1, k2) - px(row, k)) * s;
    const y = py(row) + (py(row + 1) - py(row)) * s - Math.sin(Math.PI * s) * g.dy * 0.35;
    return [x, y];
  }

  function draw(now) {
    if (!g) geometry();
    const { c, w, H } = g;
    c.clearRect(0, 0, w, H);
    // Bins: fill each to its share of the tallest bin so far.
    const counts = ctx.results().counts;
    let max = 0;
    for (let i = 0; i < bins; i++) max = Math.max(max, counts[i]);
    const bw = g.dx;
    const usableH = g.binH - 10;
    for (let i = 0; i < bins; i++) {
      const x = g.cx + (i - rows / 2) * g.dx;
      c.fillStyle = colors.binWash;
      c.fillRect(x - bw / 2 + 1, g.binTop, bw - 2, g.binH - 2);
      if (max > 0 && counts[i] > 0) {
        const hgt = Math.max(2, (counts[i] / max) * usableH);
        c.fillStyle = colors.bin;
        roundTop(c, x - bw / 2 + 2, g.H - 2 - hgt, bw - 4, hgt, Math.min(4, (bw - 4) / 2));
      }
    }
    // Bin walls.
    c.strokeStyle = colors.wall;
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= bins; i++) {
      const x = g.cx + (i - rows / 2 - 0.5) * g.dx;
      c.moveTo(x, g.binTop - 4);
      c.lineTo(x, g.H - 1);
    }
    c.stroke();
    // Pegs (Pascal's triangle).
    c.fillStyle = colors.peg;
    const pr = Math.max(1.6, Math.min(3.2, g.dx * 0.1));
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j <= i; j++) {
        c.beginPath();
        c.arc(px(i, j), g.pegTop + i * g.dy, pr, 0, Math.PI * 2);
        c.fill();
      }
    }
    // Funnel.
    c.strokeStyle = colors.wall;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(g.cx - g.dx * 0.9, 4);
    c.lineTo(g.cx - g.ballR - 2, g.top - 2);
    c.moveTo(g.cx + g.dx * 0.9, 4);
    c.lineTo(g.cx + g.ballR + 2, g.top - 2);
    c.stroke();
    // Balls.
    for (const b of balls) {
      const [x, y] = ballPos(b, now);
      const grad = c.createRadialGradient(x - g.ballR * 0.35, y - g.ballR * 0.35, 0.5, x, y, g.ballR);
      grad.addColorStop(0, colors.ballHi);
      grad.addColorStop(1, b.decor ? colors.ball : colors.ball);
      c.globalAlpha = b.decor ? 0.75 : 1;
      c.fillStyle = grad;
      c.beginPath();
      c.arc(x, y, g.ballR, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    const landed = [];
    balls = balls.filter((b) => {
      if (now - b.t0 >= b.dur) { landed.push(b); return false; }
      return true;
    });
    landed.forEach((b) => { if (b.resolve) b.resolve(); });
    if (landed.some((b) => !b.decor)) ctx.sound('pop');
    draw(now);
    if (balls.length) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };

  const ro = new ResizeObserver(() => { geometry(); kick(); });
  ro.observe(canvas);
  readColors();

  return {
    concurrent: true,
    flightTime(rate, reduced) {
      if (reduced) return 400;
      return Math.max(520, Math.min(2400, 2600 / Math.sqrt(rate * 2)));
    },
    play(t, ms) {
      return new Promise((resolve) => {
        if (balls.length > MAX_BALLS) { resolve(); return; }
        balls.push({ path: t.path, k: t.index, t0: performance.now(), dur: ms, resolve });
        ctx.caption(`Bin ${t.index}`, t.path.map((r) => (r ? 'R' : 'L')).join(''));
        kick();
      });
    },
    show(t) {
      // While streaming, drop an occasional illustrative ball (already counted).
      if (balls.length < 40 && !ctx.reducedMotion()) {
        balls.push({ path: t.path, k: t.index, t0: performance.now(), dur: 650, decor: true });
      }
      ctx.caption(`Bin ${t.index}`, t.path.map((r) => (r ? 'R' : 'L')).join(''));
      kick();
    },
    sync() { kick(); },
    themeChanged() { readColors(); kick(); },
    cancel() {
      const pending = balls;
      balls = [];
      pending.forEach((b) => b.resolve && b.resolve());
      kick();
    },
    destroy() { this.cancel(); ro.disconnect(); if (raf) cancelAnimationFrame(raf); },
  };
}

function roundTop(c, x, y, w, hh, r) {
  c.beginPath();
  c.moveTo(x, y + hh);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + hh);
  c.closePath();
  c.fill();
}
