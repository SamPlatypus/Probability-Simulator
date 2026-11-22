// Number formatting tuned for learners: friendly, never in scientific notation.

const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

export function int(n) { return nf0.format(Math.round(n)); }

/** 12.9K, 1.2M ... for axes and tight spots. */
export function compact(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return trim(n / 1e9) + 'B';
  if (a >= 1e6) return trim(n / 1e6) + 'M';
  if (a >= 1e4) return trim(n / 1e3) + 'K';
  return int(n);
}
function trim(x) { return (Math.round(x * 10) / 10).toString(); }

/**
 * A probability as a percentage with sensible precision: 50%, 16.7%, 0.198%,
 * 0.00154%. Small numbers keep three significant figures.
 */
export function pct(p, digits) {
  if (!Number.isFinite(p)) return '—';
  const v = p * 100;
  if (v === 0) return '0%';
  if (v === 100) return '100%';
  if (digits !== undefined) return v.toFixed(digits) + '%';
  const a = Math.abs(v);
  let d;
  if (a >= 10) d = 1;
  else if (a >= 1) d = 2;
  else d = Math.min(6, Math.max(2, 2 - Math.floor(Math.log10(a))));
  let s = v.toFixed(d);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s + '%';
}

/** "1 in 6", "1 in 649,740" — odds are often easier to picture than percentages. */
export function oneIn(p) {
  if (!(p > 0)) return 'impossible';
  if (p >= 0.5) return null;
  const x = 1 / p;
  return '1 in ' + (x < 10 ? (Math.round(x * 10) / 10).toString() : int(x));
}

/** Nice fraction for common probabilities, e.g. 1/6, 3/8. */
export function fraction(p, maxDen = 64) {
  if (p === 0) return '0';
  if (p === 1) return '1';
  for (let d = 2; d <= maxDen; d++) {
    const n = Math.round(p * d);
    if (Math.abs(n / d - p) < 1e-9) return `${n}/${d}`;
  }
  return null;
}

export function duration(sec) {
  if (!Number.isFinite(sec)) return '∞';
  if (sec < 1) return 'under a second';
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}m ${Math.round(sec % 60)}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${m % 60}m`;
  return `${Math.round(h / 24)} days`;
}

export function signedPts(d) {
  const v = d * 100;
  const s = Math.abs(v) < 0.005 ? '0.00' : Math.abs(v) >= 10 ? Math.abs(v).toFixed(1) : Math.abs(v).toFixed(2);
  return (v > 0.0049 ? '+' : v < -0.0049 ? '−' : '±') + s + ' pts';
}
