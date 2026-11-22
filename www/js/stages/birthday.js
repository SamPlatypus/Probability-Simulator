import { h, fitCanvas, cssVar, scheduler } from './util.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function dayName(d, days) {
  if (days === 12) return MONTHS[d];
  if (days === 7) return WEEKDAYS[d];
  let m = 0;
  while (d >= MONTH_DAYS[m]) { d -= MONTH_DAYS[m]; m++; }
  return `${MONTHS[m]} ${d + 1}`;
}

export default function birthdayStage(root, model, ctx) {
  const sched = scheduler();
  root.classList.add('st-birthday');
  const canvas = h('canvas', 'bday-canvas', root);
  canvas.setAttribute('aria-hidden', 'true');
  const days = model.days;
  let tally = new Map(); // day -> people
  let colors;

  const readColors = () => {
    colors = {
      cell: cssVar('--cell'), one: cssVar('--s1'), match: cssVar('--s2'), ink: cssVar('--ink-2'), muted: cssVar('--ink-3'), surface: cssVar('--stage-ring'),
    };
  };
  readColors();

  // Cell rectangles for each day, laid out like a calendar.
  function cells(w, H) {
    const out = [];
    if (days === 365) {
      const labelW = 26, gap = 2;
      const size = Math.min((w - labelW - 6) / 31 - gap, (H - 8) / 12 - gap);
      const left = labelW + (w - labelW - 31 * (size + gap)) / 2;
      const top = (H - 12 * (size + gap)) / 2;
      let d = 0;
      for (let m = 0; m < 12; m++) {
        for (let i = 0; i < MONTH_DAYS[m]; i++) {
          out[d++] = { x: left + i * (size + gap), y: top + m * (size + gap), s: size };
        }
      }
      return { out, labels: MONTHS.map((mn, m) => ({ text: mn[0], x: left - 8, y: top + m * (size + gap) + size / 2 })), size };
    }
    const cols = days === 12 ? 6 : 7, rowsN = days === 12 ? 2 : 1;
    const gap = 8;
    const size = Math.min((w - 16 - (cols - 1) * gap) / cols, (H - 16 - (rowsN - 1) * gap) / rowsN);
    const left = (w - cols * size - (cols - 1) * gap) / 2;
    const top = (H - rowsN * size - (rowsN - 1) * gap) / 2;
    for (let d = 0; d < days; d++) {
      out.push({ x: left + (d % cols) * (size + gap), y: top + Math.floor(d / cols) * (size + gap), s: size });
    }
    return { out, labels: [], size, big: true };
  }

  function draw() {
    const { ctx: c, w, h: H } = fitCanvas(canvas);
    c.clearRect(0, 0, w, H);
    const L = cells(w, H);
    c.font = `600 ${L.big ? 12 : 10}px system-ui, -apple-system, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const lb of L.labels) { c.fillStyle = colors.muted; c.fillText(lb.text, lb.x, lb.y); }
    L.out.forEach((cell, d) => {
      const n = tally.get(d) || 0;
      c.fillStyle = n === 0 ? colors.cell : n === 1 ? colors.one : colors.match;
      const r = Math.min(3, cell.s / 3);
      c.beginPath();
      c.roundRect ? c.roundRect(cell.x, cell.y, cell.s, cell.s, r) : c.rect(cell.x, cell.y, cell.s, cell.s);
      c.fill();
      if (n > 1 && !L.big) {
        c.strokeStyle = colors.match;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(cell.x + cell.s / 2, cell.y + cell.s / 2, cell.s * 1.15, 0, Math.PI * 2);
        c.stroke();
      }
      if (L.big) {
        c.fillStyle = n ? '#ffffff' : colors.ink;
        c.font = `600 ${Math.max(11, Math.min(15, cell.s / 4))}px system-ui, -apple-system, sans-serif`;
        c.fillText(dayName(d, days), cell.x + cell.s / 2, cell.y + cell.s * (n ? 0.35 : 0.5));
        if (n) {
          c.font = `700 ${Math.max(12, Math.min(22, cell.s / 3))}px system-ui, -apple-system, sans-serif`;
          c.fillText(n > 1 ? `${n} people` : '1 person', cell.x + cell.s / 2, cell.y + cell.s * 0.68);
        }
      }
    });
  }

  const ro = new ResizeObserver(draw);
  ro.observe(canvas);

  function caption(t) {
    if (t.shared.length) {
      const first = dayName(t.shared[0], days);
      ctx.caption(`Match! ${first}`, t.shared.length > 1 ? `${t.shared.length} shared ${days === 365 ? 'days' : days === 12 ? 'months' : 'weekdays'}` : `${model.people} people`);
    } else {
      ctx.caption('All different', `${model.people} people`);
    }
  }

  function setAll(t) {
    tally = new Map();
    t.list.forEach((d) => tally.set(d, (tally.get(d) || 0) + 1));
    draw();
    caption(t);
  }

  return {
    concurrent: false,
    async play(t, ms) {
      if (ms < 300 || ctx.reducedMotion()) {
        setAll(t);
        await sched.wait(ms);
        return;
      }
      tally = new Map();
      ctx.caption('People arrive…', `${model.people} people`);
      const step = (ms * 0.82) / t.list.length;
      let matched = false;
      for (const d of t.list) {
        tally.set(d, (tally.get(d) || 0) + 1);
        if (tally.get(d) === 2 && !matched) {
          matched = true;
          ctx.sound('win');
          ctx.caption(`Match! ${dayName(d, days)}`, 'still arriving…');
        } else if (t.list.length <= 30) ctx.sound('tick');
        draw();
        await sched.wait(step);
      }
      ctx.haptic();
      caption(t);
      await sched.wait(ms * 0.1);
    },
    show(t) { setAll(t); },
    themeChanged() { readColors(); draw(); },
    cancel() { sched.cancel(); },
    destroy() { sched.cancel(); ro.disconnect(); },
  };
}
