// Shared bits for the canvas charts.

export function readChartColors(el) {
  const cs = getComputedStyle(el);
  const v = (n) => cs.getPropertyValue(n).trim();
  const series = [];
  for (let i = 1; i <= 8; i++) series.push(v(`--s${i}`));
  return {
    surface: v('--surface'),
    ink: v('--ink'),
    ink2: v('--ink-2'),
    ink3: v('--ink-3'),
    grid: v('--grid'),
    axis: v('--axis'),
    theory: v('--theory'),
    guess: v('--guess'),
    band: v('--band'),
    series,
  };
}

/** A "nice" axis step giving roughly `target` intervals over [0, max]. */
export function niceStep(max, target = 4) {
  if (!(max > 0)) return 1;
  const raw = max / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

export function roundedBar(c, x, y, w, hgt, r, horizontal = false) {
  // Rounded data-end, square at the baseline.
  r = Math.max(0, Math.min(r, (horizontal ? hgt : w) / 2, horizontal ? w : hgt));
  c.beginPath();
  if (!horizontal) {
    c.moveTo(x, y + hgt);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + hgt);
  } else {
    c.moveTo(x, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + hgt - r);
    c.arcTo(x + w, y + hgt, x + w - r, y + hgt, r);
    c.lineTo(x, y + hgt);
  }
  c.closePath();
  c.fill();
}

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

export function withAlpha(color, a) {
  // Works for #rgb/#rrggbb; other formats fall back to globalAlpha by caller.
  if (color.startsWith('#')) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.split('').map((x) => x + x).join('');
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
  }
  return color;
}
