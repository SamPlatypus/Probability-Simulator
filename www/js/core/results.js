// Tallies of simulated outcomes, plus the history needed to draw the
// law-of-large-numbers (convergence) chart.

const RECENT = 24;

export class Results {
  /** @param {number} k number of possible outcomes */
  constructor(k, tracker = null) {
    this.k = k;
    this.tracker = tracker;
    this.reset();
  }

  reset() {
    this.counts = new Float64Array(this.k);
    this.n = 0;
    // Ring buffer of the most recent outcome indices.
    this.recentBuf = new Int32Array(RECENT);
    this.recentHead = 0;
    // Cumulative-count snapshots taken at (roughly) log-spaced trial numbers,
    // so any event's running frequency can be re-derived later, even if the
    // user changes which outcomes they are watching.
    this.snapN = [];
    this.snapCounts = [];
    this.nextSnap = 1;
    this.version = 0;
    if (this.tracker) this.tracker.reset();
  }

  /** Record one outcome. Hot path: keep it allocation-free. */
  add(i) {
    this.counts[i]++;
    this.n++;
    this.recentBuf[this.recentHead] = i;
    this.recentHead = (this.recentHead + 1) % RECENT;
    if (this.tracker) this.tracker.add(i);
    if (this.n >= this.nextSnap) this.snapshot();
    this.version++;
  }

  snapshot() {
    this.snapN.push(this.n);
    this.snapCounts.push(Float64Array.from(this.counts));
    // Every trial for the first 100, then ~1.5% steps: under 1,000 points even
    // after ten million trials.
    this.nextSnap = this.n < 100 ? this.n + 1 : Math.ceil(this.n * 1.015);
  }

  /** Most recent outcomes, newest first. */
  recent(limit = RECENT) {
    const out = [];
    const m = Math.min(limit, this.n, RECENT);
    for (let j = 1; j <= m; j++) out.push(this.recentBuf[(this.recentHead - j + RECENT) % RECENT]);
    return out;
  }

  /** Number of trials so far that landed inside a boolean mask of outcomes. */
  hits(mask) {
    let s = 0;
    for (let i = 0; i < this.k; i++) if (mask[i]) s += this.counts[i];
    return s;
  }

  /**
   * Running relative frequency of the masked event at each snapshot, ending
   * with the current state. @returns {{ n: number[], f: number[] }}
   */
  convergence(mask) {
    const n = [], f = [];
    for (let s = 0; s < this.snapN.length; s++) {
      const c = this.snapCounts[s];
      let h = 0;
      for (let i = 0; i < this.k; i++) if (mask[i]) h += c[i];
      n.push(this.snapN[s]);
      f.push(h / this.snapN[s]);
    }
    if (this.n > 0 && n[n.length - 1] !== this.n) {
      n.push(this.n);
      f.push(this.hits(mask) / this.n);
    }
    return { n, f };
  }

  /** A deep copy, used for "Undo" after a reset. */
  clone() {
    const r = new Results(this.k, null);
    r.counts = Float64Array.from(this.counts);
    r.n = this.n;
    r.recentBuf = Int32Array.from(this.recentBuf);
    r.recentHead = this.recentHead;
    r.snapN = this.snapN.slice();
    r.snapCounts = this.snapCounts.slice();
    r.nextSnap = this.nextSnap;
    r.version = this.version + 1;
    r.tracker = this.tracker && this.tracker.clone ? this.tracker.clone() : null;
    return r;
  }
}
