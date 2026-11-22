// Drives a simulation at a chosen speed.
//
// Two regimes:
//  * "animate" — each trial is acted out on the stage and only counted when its
//    animation lands, so the bar that grows is exactly the result the learner
//    just watched.
//  * "stream"  — trials are simulated in batches every frame (up to millions per
//    second at Max). The stage shows a sampled recent trial a few times a second.

export const SPEEDS = [
  { id: 'slow', label: 'Slow', rate: 0.5, mode: 'animate' },
  { id: 'steady', label: 'Steady', rate: 1, mode: 'animate' },
  { id: 'quick', label: 'Quick', rate: 2.5, mode: 'animate' },
  { id: 'fast', label: 'Fast', rate: 8, mode: 'animate' },
  { id: 'faster', label: 'Faster', rate: 50, mode: 'stream' },
  { id: 'rapid', label: 'Rapid', rate: 500, mode: 'stream' },
  { id: 'turbo', label: 'Turbo', rate: 5000, mode: 'stream' },
  { id: 'max', label: 'Max', rate: Infinity, mode: 'stream' },
];

const MAX_FRAME_BUDGET_MS = 11; // leave room in a 16.7 ms frame for drawing
const STREAM_STAGE_INTERVAL = 180; // ms between stage refreshes while streaming

export class Runner {
  constructor({ onChange, onComplete, onLand } = {}) {
    this.onChange = onChange || (() => {});
    this.onComplete = onComplete || (() => {});
    this.onLand = onLand || (() => {});
    this.speedIndex = 2;
    this.state = 'idle'; // idle | running | paused
    this.remaining = 0;
    this.inFlight = 0;
    this.busy = false;
    this.gen = 0;
    this.nextLaunch = 0;
    this.acc = 0;
    this.lastTick = 0;
    this.lastStageShow = 0;
    this.reducedMotion = false;
  }

  get speed() { return SPEEDS[this.speedIndex]; }

  attach(model, results, rng, stage) {
    this.cancel();
    this.model = model;
    this.results = results;
    this.rng = rng;
    this.stage = stage;
  }

  setSpeed(i) {
    this.speedIndex = Math.max(0, Math.min(SPEEDS.length - 1, i));
    this.acc = 0;
    this.nextLaunch = 0;
    this.onChange();
  }

  /** Begin (or continue) a run of `count` trials (Infinity = until paused). */
  start(count) {
    if (this.state === 'running') return;
    if (this.state !== 'paused' || this.remaining <= 0) this.remaining = count;
    this.state = 'running';
    this.lastTick = 0;
    this.acc = 0;
    this.nextLaunch = 0;
    this.onChange();
  }

  pause() {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.onChange();
  }

  /** Stop everything and forget in-flight trials (used by Reset and config changes). */
  cancel() {
    this.gen++;
    this.state = 'idle';
    this.remaining = 0;
    this.inFlight = 0;
    this.busy = false;
    if (this.stage) this.stage.cancel();
    this.onChange();
  }

  /** Act out exactly one trial, whatever the speed. */
  step() {
    if (this.state === 'running' || this.busy || !this.model) return;
    const anim = this.speed.mode === 'animate' ? this.durationFor(this.speed.rate) : 650;
    this.launch(anim);
  }

  durationFor(rate) {
    if (this.stage && this.stage.concurrent) return this.stage.flightTime(rate, this.reducedMotion);
    const period = 1000 / rate;
    const d = Math.min(1600, period * 0.82);
    return this.reducedMotion ? Math.min(d, 250) : d;
  }

  launch(duration) {
    const trial = this.model.trial(this.rng);
    const gen = this.gen;
    this.inFlight++;
    this.busy = true;
    this.stage.play(trial, duration).then(() => {
      if (gen !== this.gen) return;
      this.inFlight--;
      if (!this.stage.concurrent || this.inFlight === 0) this.busy = false;
      this.results.add(trial.index);
      this.onLand(trial);
      this.checkDone();
    });
    this.onChange();
  }

  checkDone() {
    if (this.state === 'running' && this.remaining <= 0 && this.inFlight === 0) {
      this.state = 'idle';
      this.onChange();
      this.onComplete();
    }
  }

  /** Called once per animation frame. Returns true if results changed. */
  tick(now) {
    if (this.state !== 'running' || !this.model) return false;
    const dt = this.lastTick ? Math.min(100, now - this.lastTick) : 16;
    this.lastTick = now;
    const sp = this.speed;

    if (sp.mode === 'animate') {
      const period = 1000 / sp.rate;
      if (this.nextLaunch === 0) this.nextLaunch = now;
      if (this.stage.concurrent) {
        while (this.remaining > 0 && now >= this.nextLaunch) {
          this.remaining--;
          this.launch(this.durationFor(sp.rate));
          this.nextLaunch += period;
          if (this.nextLaunch < now - period) this.nextLaunch = now + period;
        }
      } else if (!this.busy && this.remaining > 0 && now >= this.nextLaunch) {
        this.remaining--;
        this.launch(this.durationFor(sp.rate));
        this.nextLaunch = now + period;
      }
      this.checkDone();
      return false;
    }

    // Streaming: several trials per frame.
    const { model, rng, results } = this;
    let done = 0;
    let last = null;
    if (sp.rate === Infinity) {
      const t0 = performance.now();
      const chunk = 2000;
      while (this.remaining > 0) {
        const m = Math.min(chunk, this.remaining);
        for (let j = 0; j < m - 1; j++) results.add(model.sample(rng));
        last = model.trial(rng);
        results.add(last.index);
        this.remaining -= m;
        done += m;
        if (performance.now() - t0 > MAX_FRAME_BUDGET_MS) break;
      }
    } else {
      this.acc += (sp.rate * dt) / 1000;
      let due = Math.floor(this.acc);
      this.acc -= due;
      due = Math.min(due, this.remaining);
      if (due > 0) {
        for (let j = 0; j < due - 1; j++) results.add(model.sample(rng));
        last = model.trial(rng);
        results.add(last.index);
        this.remaining -= due;
        done = due;
      }
    }
    if (last) {
      const interval = this.reducedMotion ? STREAM_STAGE_INTERVAL * 3 : STREAM_STAGE_INTERVAL;
      if (now - this.lastStageShow > interval || this.remaining <= 0) {
        this.lastStageShow = now;
        this.stage.show(last, { streaming: true, rate: sp.rate });
      }
    }
    if (this.remaining <= 0) {
      this.state = 'idle';
      this.onChange();
      this.onComplete();
    }
    return done > 0;
  }

  /** Rough time a run of `count` trials will take at the current speed, in seconds. */
  estimateSeconds(count) {
    const sp = this.speed;
    if (!Number.isFinite(count)) return Infinity;
    if (sp.rate === Infinity) return count / 3e6;
    return count / sp.rate;
  }
}
