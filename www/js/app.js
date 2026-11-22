// Probability Lab — application shell. Wires the simulation engine, stages,
// charts and controls together.

import { EXPERIMENTS, getExperiment, resolveConfig } from './experiments/index.js';
import { createRng } from './core/rng.js';
import { Results } from './core/results.js';
import { Runner, SPEEDS } from './core/runner.js';
import { sanitizeEvent, eventMask, eventProbability, describeEvent, tapEvent } from './core/events.js';
import { chiSquareTest, proportionZ, moments, observedMoments, totalVariation } from './core/prob.js';
import { mountStage } from './stages/index.js';
import { h } from './stages/util.js';
import { Histogram } from './ui/histogram.js';
import { ConvergenceChart } from './ui/convergence.js';
import { renderControls } from './ui/controls.js';
import { icon, hydrateIcons } from './ui/icons.js';
import * as fmt from './ui/format.js';
import { play as playSound, setSoundEnabled, haptic, setHaptics } from './ui/sound.js';
import { load, save, clearAll } from './ui/storage.js';
import { openSheet, closeSheet, initSheet, isSheetOpen } from './ui/sheet.js';
import { buildLesson, BASICS, HOW_TO } from './ui/learn.js';

const VERSION = '1.0.0';
const TRIAL_OPTIONS = [1, 10, 100, 1000, 10000, 100000, 1000000, Infinity];
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Persistent state
// ---------------------------------------------------------------------------

const saved = load();
const state = {
  mode: EXPERIMENTS.some((e) => e.id === saved.mode) ? saved.mode : 'coins',
  configs: saved.configs && typeof saved.configs === 'object' ? saved.configs : {},
  events: saved.events && typeof saved.events === 'object' ? saved.events : {},
  trials: saved.trials === 'inf' ? Infinity : TRIAL_OPTIONS.includes(saved.trials) ? saved.trials : 100,
  speed: Number.isInteger(saved.speed) && saved.speed >= 0 && saved.speed < SPEEDS.length ? saved.speed : 2,
  unit: saved.unit === 'count' ? 'count' : 'pct',
  showTheory: saved.showTheory !== false,
  combine: false,
  settings: {
    theme: 'auto', sound: false, haptics: true, reduceMotion: 'auto', seedMode: 'random', seed: '',
    ...(saved.settings && typeof saved.settings === 'object' ? saved.settings : {}),
  },
  seenWelcome: !!saved.seenWelcome,
};

function persist(immediate = false) {
  save({
    mode: state.mode, configs: state.configs, events: state.events,
    trials: Number.isFinite(state.trials) ? state.trials : 'inf',
    speed: state.speed, unit: state.unit, showTheory: state.showTheory,
    settings: state.settings, seenWelcome: state.seenWelcome,
  }, immediate);
}

// ---------------------------------------------------------------------------
// Sessions: one per experiment, kept in memory while the app is open, so
// switching tabs doesn't throw results away.
// ---------------------------------------------------------------------------

const sessions = {};
let cur = null; // the active session
let predicting = false;
let draft = null; // prediction being sketched
let undoSnap = null;

function makeRng(id) {
  const { seedMode, seed } = state.settings;
  return createRng(seedMode === 'fixed' && seed ? `${seed}:${id}` : undefined);
}

function createSession(exp, config) {
  const model = exp.build(config);
  const results = new Results(model.outcomes.length, model.tracker ? model.tracker() : null);
  const event = sanitizeEvent(model, state.events[exp.id]);
  return { exp, config, model, results, event, mask: eventMask(model, event), prediction: null, rng: makeRng(exp.id), stage: null };
}

function getSession(id) {
  if (!sessions[id]) {
    const exp = getExperiment(id);
    sessions[id] = createSession(exp, resolveConfig(exp, state.configs[id]));
  }
  return sessions[id];
}

// ---------------------------------------------------------------------------
// Engine + views
// ---------------------------------------------------------------------------

let reducedMotion = false;

const runner = new Runner({
  onChange: () => { updateDock(); wake(); },
  onComplete: () => {
    const r = cur.results;
    const p = eventProbability(cur.model, cur.mask);
    announce(`Finished. ${fmt.int(r.n)} trials. ${describeEvent(cur.model, cur.event)}: ${fmt.pct(r.n ? r.hits(cur.mask) / r.n : 0)} observed, ${fmt.pct(p)} in theory.`);
    playSound('done');
    dirtyStats = true;
    wake();
  },
  onLand: () => { dirtyStats = true; wake(); },
});

const hist = new Histogram($('hist'), {
  onTap: (i) => {
    if (predicting) return;
    setEvent(tapEvent(cur.model, cur.event, i, state.combine));
  },
  onPredict: (i, v) => {
    draft[i] = v;
    updatePredictTotal();
    dirtyChart = true;
    wake();
  },
});
const conv = new ConvergenceChart($('conv'), $('convTip'));

let captionTimer = 0;
const stageCtx = {
  caption(main, sub = '') {
    $('capMain').textContent = main;
    $('capSub').textContent = sub;
    const streaming = runner.state === 'running' && runner.speed.mode === 'stream';
    if (!streaming && !reducedMotion) {
      const c = $('caption');
      c.classList.remove('pop');
      void c.offsetWidth; // restart the animation
      c.classList.add('pop');
      clearTimeout(captionTimer);
      captionTimer = setTimeout(() => c.classList.remove('pop'), 400);
    }
  },
  sound: (name) => playSound(name),
  haptic: () => haptic(),
  reducedMotion: () => reducedMotion,
  results: () => cur.results,
};

// ---------------------------------------------------------------------------
// Activation & configuration
// ---------------------------------------------------------------------------

function activate(id, { remount = true } = {}) {
  runner.cancel();
  if (cur && cur.stage) cur.stage.destroy();
  if (predicting) endPredict(false);
  state.mode = id;
  cur = getSession(id);
  persist();
  $('stage').dataset.mode = id;
  $('modeBlurb').textContent = cur.exp.blurb;
  if (remount) {
    cur.stage = mountStage($('stageRoot'), cur.model, stageCtx);
    stageCtx.caption(cur.exp.name, 'Press Run to start');
  }
  runner.attach(cur.model, cur.results, cur.rng, cur.stage);
  hist.setModel(cur.model);
  $('histWrap').classList.toggle('tall', cur.model.orientation === 'horizontal');
  $('theoryLabel').textContent = `Theory: ${cur.model.theoryLabel}`;
  document.querySelectorAll('.mode-tab').forEach((t) => {
    const on = t.dataset.mode === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    if (on) t.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  });
  renderSetup();
  renderEventOps();
  refreshAll();
}

function renderSetup() {
  renderControls($('controls'), cur.exp, cur.config, {
    onChange: (patch) => applyConfig({ ...cur.config, ...patch }),
    onAction: (aid) => {
      const res = cur.exp.actions[aid](cur.config);
      if (res.patch) applyConfig({ ...cur.config, ...res.patch }, { quiet: true });
      if (res.message) toast(res.message, { duration: 6000 });
    },
  });
}

/** Switch the active experiment to a new configuration (starts a fresh run). */
function applyConfig(next, { quiet = false } = {}) {
  const exp = cur.exp;
  const fixed = exp.fixConfig ? exp.fixConfig(next) : next;
  if (JSON.stringify(fixed) === JSON.stringify(cur.config)) { renderSetup(); return; }
  const prev = cur;
  const hadResults = prev.results.n > 0;
  if (hadResults) snapshotForUndo();
  runner.cancel();
  prev.stage && prev.stage.destroy();
  const s = createSession(exp, fixed);
  // Keep the watched event if it still makes sense for the new model.
  if (prev.model.numeric === s.model.numeric) {
    s.event = sanitizeEvent(s.model, prev.model.outcomes.length === s.model.outcomes.length ? prev.event : null);
    s.mask = eventMask(s.model, s.event);
  }
  sessions[exp.id] = s;
  state.configs[exp.id] = fixed;
  state.events[exp.id] = s.event;
  activate(exp.id);
  if (hadResults && !quiet) toast('New setup — results cleared', { action: 'Undo', onAction: undo });
}

function snapshotForUndo() {
  undoSnap = {
    mode: cur.exp.id, config: cur.config, results: cur.results.clone(), event: cur.event, prediction: cur.prediction,
  };
}

function undo() {
  const u = undoSnap;
  undoSnap = null;
  if (!u) return;
  runner.cancel();
  const exp = getExperiment(u.mode);
  if (cur.stage) cur.stage.destroy();
  const s = createSession(exp, u.config);
  s.results = u.results;
  s.event = sanitizeEvent(s.model, u.event);
  s.mask = eventMask(s.model, s.event);
  s.prediction = u.prediction;
  sessions[u.mode] = s;
  state.configs[u.mode] = u.config;
  state.events[u.mode] = s.event;
  cur = s;
  activate(u.mode);
  toast('Restored');
}

function resetResults() {
  if (cur.results.n === 0 && runner.inFlight === 0 && runner.state === 'idle') {
    stageCtx.caption(cur.exp.name, 'Press Run to start');
    return;
  }
  snapshotForUndo();
  runner.cancel();
  cur.results.reset();
  cur.rng = makeRng(cur.exp.id);
  if (cur.stage) cur.stage.destroy();
  cur.stage = mountStage($('stageRoot'), cur.model, stageCtx);
  runner.attach(cur.model, cur.results, cur.rng, cur.stage);
  hist.setModel(cur.model);
  stageCtx.caption('Cleared', 'Ready for a fresh run');
  refreshAll();
  toast('Results cleared', { action: 'Undo', onAction: undo });
}

function setEvent(ev) {
  cur.event = sanitizeEvent(cur.model, ev);
  cur.mask = eventMask(cur.model, cur.event);
  state.events[cur.exp.id] = cur.event;
  persist();
  renderEventOps();
  refreshAll();
}

// ---------------------------------------------------------------------------
// Frame loop
// ---------------------------------------------------------------------------

let rafId = 0;
let histMoving = false;
let dirtyChart = true;
let dirtyStats = true;
let drawnVersion = -1;
let statsVersion = -1;
let lastStats = 0;

function wake() { if (!rafId) rafId = requestAnimationFrame(frame); }

function frame(now) {
  rafId = 0;
  runner.tick(now);
  const v = cur.results.version;
  if (v !== drawnVersion || histMoving || dirtyChart) {
    pushHistData();
    histMoving = hist.draw(now);
    drawnVersion = v;
    dirtyChart = false;
  }
  const statsDue = v !== statsVersion && now - lastStats > 120;
  if (statsDue || dirtyStats) {
    updateStats();
    updateRecent();
    updateConv();
    cur.stage.sync();
    $('trialCount').textContent = fmt.compact(cur.results.n);
    lastStats = now;
    statsVersion = v;
    dirtyStats = false;
    updateDock();
  }
  const busy = runner.state === 'running' || runner.inFlight > 0 || histMoving || v !== statsVersion;
  if (busy) wake();
}

function refreshAll() {
  dirtyChart = true;
  dirtyStats = true;
  updateLegend();
  updateDock();
  wake();
}

function pushHistData() {
  hist.setData({
    counts: cur.results.counts,
    n: cur.results.n,
    mask: cur.mask,
    anchor: cur.event.type === 'cmp' ? cur.event.anchor : null,
    prediction: predicting ? draft : cur.prediction,
    showTheory: state.showTheory && !predicting,
    unit: predicting ? 'pct' : state.unit,
    predicting,
  });
}

// ---------------------------------------------------------------------------
// Stats panel
// ---------------------------------------------------------------------------

function verdictFor(pValue) {
  if (pValue >= 0.05) return { cls: 'good', ic: 'check', text: 'Within normal chance variation' };
  if (pValue >= 0.001) return { cls: 'warning', ic: 'info', text: 'Unusual — but it happens' };
  return { cls: 'critical', ic: 'bolt', text: 'Very unlikely if the theory is right' };
}

function chancePhrase(pValue) {
  if (pValue >= 0.995) return 'almost always';
  if (pValue < 0.0001) return 'less than 1 time in 10,000';
  const pctText = fmt.pct(pValue);
  return `about ${pctText} of the time`;
}

function updateStats() {
  const m = cur.model, r = cur.results, n = r.n;
  const p = eventProbability(m, cur.mask);
  const hits = r.hits(cur.mask);
  const f = n ? hits / n : NaN;
  const evName = describeEvent(m, cur.event);
  const tiles = $('tiles');
  tiles.textContent = '';

  // Event tile: the headline comparison.
  const hero = h('div', 'tile wide hero', tiles);
  const lab = h('div', 'tile-label', hero);
  lab.textContent = `P(${evName})`;
  const cmp = h('div', 'compare', hero);
  const obsBox = h('div', '', cmp);
  h('div', 'tile-value', obsBox, n ? fmt.pct(f) : '—');
  h('div', 'tile-sub', obsBox, n ? `observed · ${fmt.int(hits)} of ${fmt.int(n)}` : 'observed · no trials yet');
  const thBox = h('div', '', cmp);
  h('div', 'muted-val', thBox, fmt.pct(p));
  const frac = fmt.fraction(p);
  const odds = fmt.oneIn(p);
  h('div', 'tile-sub', thBox, `theory${frac && frac.length <= 7 ? ` · ${frac}` : ''}${odds && odds !== 'impossible' ? ` · ${odds}` : ''}`);
  numberLine(hero, p, f, n);

  // Status of the gap.
  let status;
  if (!n) status = { cls: 'neutral', ic: 'info', text: 'Run some trials to compare' };
  else if (p === 0 || p === 1) status = (hits === 0 && p === 0) || (hits === n && p === 1)
    ? { cls: 'good', ic: 'check', text: p === 0 ? 'Impossible — and it never happened' : 'Certain — and it always happened' }
    : { cls: 'critical', ic: 'bolt', text: 'That should be impossible!' };
  else status = verdictFor(proportionZ(hits, n, p).p);
  const st = h('div', `status ${status.cls}`, hero);
  st.append(icon(status.ic), document.createTextNode(status.text));

  // Gap + trials.
  const gap = h('div', 'tile', tiles);
  h('div', 'tile-label', gap, 'Gap from theory');
  h('div', 'tile-value', gap, n ? fmt.signedPts(f - p) : '—');
  const sd = Math.sqrt((p * (1 - p)) / Math.max(n, 1));
  h('div', 'tile-sub', gap, n && p > 0 && p < 1 ? `typical gap at this size: ±${(sd * 100).toFixed(sd * 100 >= 10 ? 1 : 2)} pts` : 'observed − theory');

  const trials = h('div', 'tile', tiles);
  h('div', 'tile-label', trials, 'Trials run');
  h('div', 'tile-value', trials, fmt.int(n));
  h('div', 'tile-sub', trials, n < 30 ? 'small sample: expect big swings' : n < 1000 ? 'getting steadier' : 'large sample: close to theory');

  if (m.numeric) {
    const values = m.outcomes.map((o) => o.value);
    const th = moments(values, m.probs);
    const ob = observedMoments(values, r.counts, n);
    const avg = h('div', 'tile', tiles);
    h('div', 'tile-label', avg, 'Average result');
    const v = h('div', 'tile-value', avg, n ? round2(ob.mean) : '—');
    h('small', '', v, `vs ${round2(th.mean)}`);
    h('div', 'tile-sub', avg, 'observed vs expected value');
    const spread = h('div', 'tile', tiles);
    h('div', 'tile-label', spread, 'Spread (SD)');
    const v2 = h('div', 'tile-value', spread, n > 1 ? round2(ob.sd) : '—');
    h('small', '', v2, `vs ${round2(th.sd)}`);
    h('div', 'tile-sub', spread, 'standard deviation');
  }

  // Mode-specific extras (e.g. coin streaks).
  if (r.tracker) {
    for (const it of r.tracker.items()) {
      const t = h('div', 'tile', tiles);
      h('div', 'tile-label', t, it.label);
      h('div', 'tile-value', t, it.value);
    }
  }

  // Checks.
  const checks = $('checks');
  checks.textContent = '';
  const fit = chiSquareTest(r.counts, m.probs, n);
  const card = h('div', 'check', checks);
  const head = h('h3', '', card);
  h('span', '', head, 'Does the whole shape fit the theory?');
  let fitStatus, fitText;
  if (!fit.ok) {
    fitStatus = { cls: 'neutral', ic: 'info', text: fit.reason === 'certain' ? 'Nothing to test' : 'Need more trials' };
    fitText = fit.reason === 'certain'
      ? 'Only one outcome is possible with this setup.'
      : 'This check compares every bar with theory at once. It needs enough trials that each outcome group expects at least 5 results.';
  } else {
    fitStatus = verdictFor(fit.p);
    fitText = `Chi-square test: χ² = ${fit.stat === Infinity ? '∞' : round2(fit.stat)} with ${fit.df} degree${fit.df === 1 ? '' : 's'} of freedom. If the theory is right, a mismatch at least this big happens ${chancePhrase(fit.p)}.`;
    if (cur.model.theoryLabel.startsWith('Fair-dice model') && fit.p < 0.01) fitText += ' Suspicious dice? Try “Reveal”.';
  }
  const st2 = h('span', `status ${fitStatus.cls}`, head);
  st2.style.marginTop = '0';
  st2.append(icon(fitStatus.ic), document.createTextNode(fitStatus.text));
  h('p', '', card, fitText);

  if (cur.prediction) {
    const total = cur.prediction.reduce((a, b) => a + b, 0) || 1;
    const guess = cur.prediction.map((g) => g / total);
    const pc = h('div', 'check', checks);
    const ph = h('h3', '', pc);
    h('span', '', ph, 'Your prediction');
    const clear = h('button', 'chip', ph, 'Clear');
    clear.type = 'button';
    // pointerdown: this panel re-renders while trials stream in.
    clear.addEventListener('pointerdown', () => { cur.prediction = null; refreshAll(); });
    const vsTheory = 1 - totalVariation(guess, m.probs);
    let txt = `Matches the theory ${Math.round(vsTheory * 100)}%.`;
    if (n) {
      const obs = Array.from(r.counts, (c) => c / n);
      txt += ` Matches your results ${Math.round((1 - totalVariation(guess, obs)) * 100)}%.`;
    }
    txt += vsTheory > 0.9 ? ' Excellent intuition!' : vsTheory > 0.75 ? ' Close — look where the shapes differ.' : ' Surprised? Compare the dashed outline with the marks.';
    h('p', '', pc, txt);
  }

  // Accessible summary for the histogram.
  $('hist').setAttribute('aria-label', `Histogram of ${m.xTitle}. ${n ? `${fmt.int(n)} trials. ${evName}: ${fmt.pct(f)} observed, ${fmt.pct(p)} theory.` : 'No trials yet.'}`);
  updateReadout(evName, p, hits, n);
  if ($('tableDetails').open) renderTable();
}

function round2(x) { return Number.isFinite(x) ? (Math.round(x * 100) / 100).toString() : '—'; }

function numberLine(parent, p, f, n) {
  const nl = h('div', 'numline', parent);
  nl.setAttribute('aria-hidden', 'true');
  h('div', 'track', nl);
  // Scale: zoom in for small probabilities so the markers are distinguishable.
  const hi = p < 0.2 ? Math.min(1, Math.max(p * 2.5, n ? f * 1.2 : 0, 0.02)) : 1;
  const pos = (x) => `${(Math.min(hi, Math.max(0, x)) / hi) * 100}%`;
  if (n && p > 0 && p < 1) {
    const band = 1.96 * Math.sqrt((p * (1 - p)) / n);
    const b = h('div', 'nl-band', nl);
    b.style.left = pos(p - band);
    b.style.width = `calc(${pos(p + band)} - ${pos(p - band)})`;
  }
  h('div', 'th', nl).style.left = pos(p);
  if (n) h('div', 'obs', nl).style.left = pos(f);
  const ends = h('div', 'ends', nl);
  h('span', '', ends, '0%');
  h('span', '', ends, fmt.pct(hi));
}

function updateReadout(evName, p, hits, n) {
  const ro = $('readout');
  ro.textContent = '';
  h('span', 'ev', ro, evName);
  if (n) {
    h('b', '', ro, fmt.pct(hits / n));
    ro.append(document.createTextNode(` observed (${fmt.int(hits)} of ${fmt.int(n)}) · `));
  } else {
    ro.append(document.createTextNode(' '));
  }
  h('b', '', ro, fmt.pct(p));
  ro.append(document.createTextNode(' theory'));
}

function updateConv() {
  const p = eventProbability(cur.model, cur.mask);
  conv.setData({ ...cur.results.convergence(cur.mask), p });
  conv.draw();
  $('convSub').textContent = `Running % of trials where ${describeEvent(cur.model, cur.event)}`;
}

function updateRecent() {
  const box = $('recent');
  const recent = cur.results.recent(14);
  box.textContent = '';
  for (const i of recent) {
    const o = cur.model.outcomes[i];
    const it = h('span', `recent-item${cur.mask[i] ? ' in' : ''}`, box);
    if (o.slot) {
      const d = h('i', `dot slot-${o.slot}`, it);
      d.style.background = `var(--s${o.slot})`;
    }
    it.append(document.createTextNode(o.short));
  }
}

function updateLegend() {
  const lg = $('legend');
  lg.textContent = '';
  const multi = cur.model.outcomes.some((o) => o.slot);
  const a = h('span', '', lg);
  h('i', `key ${multi ? 'multi' : 'bar'}`, a);
  a.append(document.createTextNode('Observed'));
  if (state.showTheory) {
    const b = h('span', '', lg);
    h('i', 'key tick', b);
    b.append(document.createTextNode('Theory'));
  }
  if (cur.prediction || predicting) {
    const c = h('span', '', lg);
    h('i', 'key dash', c);
    c.append(document.createTextNode('Your guess'));
  }
  const cl = $('convLegend');
  if (!cl.childElementCount) {
    for (const [k, t] of [['line s1', 'Observed running %'], ['line ink', 'Theory'], ['band', '95% range']]) {
      const s = h('span', '', cl);
      h('i', `key ${k}`, s);
      s.append(document.createTextNode(t));
    }
  }
  $('theoryToggle').setAttribute('aria-pressed', String(state.showTheory));
  $('theoryToggle').replaceChildren(icon(state.showTheory ? 'eye' : 'eyeOff'), document.createTextNode('Theory'));
  document.querySelectorAll('#unitSeg .seg-btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.unit === state.unit)));
}

function renderEventOps() {
  const box = $('eventOps');
  box.textContent = '';
  h('span', '', box, cur.model.numeric ? 'Watch' : 'Tap bars to');
  const seg = h('div', 'seg seg-sm', box);
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', 'Event type');
  const opts = cur.model.numeric
    ? [['eq', '='], ['le', '≤'], ['ge', '≥']].map(([op, l]) => ({ l, on: cur.event.op === op, go: () => setEvent({ ...cur.event, op }) }))
    : [
      { l: 'Pick one', on: !state.combine, go: () => { state.combine = false; renderEventOps(); } },
      { l: 'Combine', on: state.combine, go: () => { state.combine = true; renderEventOps(); } },
    ];
  for (const o of opts) {
    const b = h('button', 'seg-btn', seg, o.l);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(o.on));
    b.addEventListener('click', o.go);
  }
  h('span', '', box, cur.model.numeric ? '— tap a bar to move the marker' : '');
}

function renderTable() {
  const m = cur.model, r = cur.results, n = r.n;
  const t = $('dataTable');
  t.textContent = '';
  const thead = h('thead', '', t);
  const hr = h('tr', '', thead);
  for (const c of ['Outcome', 'Count', 'Observed', 'Theory', 'Gap']) h('th', '', hr, c);
  const tb = h('tbody', '', t);
  m.outcomes.forEach((o, i) => {
    const tr = h('tr', cur.mask[i] ? 'in' : '', tb);
    const obs = n ? r.counts[i] / n : NaN;
    h('td', '', tr, o.label);
    h('td', '', tr, fmt.int(r.counts[i]));
    h('td', '', tr, n ? fmt.pct(obs) : '—');
    h('td', '', tr, fmt.pct(m.probs[i]));
    h('td', '', tr, n ? fmt.signedPts(obs - m.probs[i]) : '—');
  });
}

function csv() {
  const m = cur.model, r = cur.results, n = r.n;
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [`# Probability Lab — ${cur.exp.name}`, `# ${m.xTitle}; ${fmt.int(n)} trials; theory: ${m.theoryLabel}`,
    'outcome,count,observed_share,theoretical_probability'];
  m.outcomes.forEach((o, i) => lines.push([esc(o.label), r.counts[i], n ? (r.counts[i] / n).toFixed(6) : '', m.probs[i].toFixed(8)].join(',')));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Dock: trials, speed, run controls
// ---------------------------------------------------------------------------

function trialText(v) { return v === Infinity ? '∞' : fmt.compact(v); }

function buildTrialChips() {
  const box = $('trialChips');
  box.textContent = '';
  for (const v of TRIAL_OPTIONS) {
    const b = h('button', 'chip', box, trialText(v));
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.v = String(v);
    b.setAttribute('aria-label', v === Infinity ? 'Run until paused' : `${fmt.int(v)} trial${v === 1 ? '' : 's'}`);
    b.addEventListener('click', () => {
      state.trials = v;
      persist();
      updateDock();
    });
  }
}

function rateText(rate) {
  if (rate === Infinity) return 'no limit';
  if (rate < 1) return `1 every ${Math.round(1 / rate)}s`;
  return `${fmt.compact(rate)}/s`;
}

function updateDock() {
  if (!cur) return;
  document.querySelectorAll('#trialChips .chip').forEach((b) => {
    const on = Number(b.dataset.v) === state.trials || (b.dataset.v === 'Infinity' && state.trials === Infinity);
    b.setAttribute('aria-checked', String(on));
  });
  const sp = SPEEDS[state.speed];
  $('speed').value = String(state.speed);
  $('speedLabel').textContent = `${sp.label} · ${rateText(sp.rate)}`;
  $('speed').setAttribute('aria-valuetext', `${sp.label}, ${rateText(sp.rate)}`);
  const run = $('runBtn');
  const ic = $('runIc');
  const running = runner.state === 'running';
  run.classList.toggle('running', running);
  ic.replaceChildren(icon(running ? 'pause' : 'play'));
  let label;
  if (running) label = 'Pause';
  else if (runner.state === 'paused') label = 'Resume';
  else label = state.trials === Infinity ? 'Run ∞' : `Run ${trialText(state.trials)}`;
  $('runLabel').textContent = label;
  run.setAttribute('aria-label', running ? 'Pause' : runner.state === 'paused' ? 'Resume run' : `Run ${state.trials === Infinity ? 'until paused' : `${fmt.int(state.trials)} trials`}`);
  $('stepBtn').disabled = running;
  $('streamBadge').hidden = !(running && sp.mode === 'stream');
  let eta;
  if (running || runner.state === 'paused') {
    eta = runner.remaining === Infinity
      ? `${fmt.int(cur.results.n)} trials so far · runs until you pause`
      : `${fmt.int(runner.remaining)} to go · about ${fmt.duration(runner.estimateSeconds(runner.remaining))}`;
    if (runner.state === 'paused') eta = `Paused · ${eta}`;
  } else {
    eta = state.trials === Infinity
      ? 'Runs until you pause'
      : `${fmt.int(state.trials)} trial${state.trials === 1 ? '' : 's'} takes about ${fmt.duration(runner.estimateSeconds(state.trials))} at this speed`;
  }
  $('eta').textContent = eta;
}

function toggleRun() {
  playSound('tick'); // unlocks audio on the first gesture when sound is on
  if (runner.state === 'running') { runner.pause(); return; }
  if (predicting) endPredict(true);
  if (runner.state === 'paused' && runner.remaining > 0) { runner.start(runner.remaining); return; }
  const est = runner.estimateSeconds(state.trials);
  if (Number.isFinite(est) && est > 180) {
    const fast = SPEEDS.findIndex((s) => s.rate * 60 >= state.trials);
    toast(`At this speed that takes ${fmt.duration(est)}.`, {
      action: 'Go faster',
      onAction: () => setSpeed(fast >= 0 ? fast : SPEEDS.length - 1),
      duration: 6000,
    });
  }
  runner.start(state.trials);
}

function setSpeed(i) {
  state.speed = i;
  runner.setSpeed(i);
  persist();
  updateDock();
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

function startPredict() {
  if (runner.state === 'running') runner.pause();
  predicting = true;
  draft = cur.prediction ? normalizeTo1(cur.prediction) : new Array(cur.model.outcomes.length).fill(0);
  $('predictBar').hidden = false;
  $('histWrap').classList.add('predicting');
  $('predictBtn').setAttribute('aria-pressed', 'true');
  updatePredictTotal();
  updateLegend();
  dirtyChart = true;
  wake();
}

function normalizeTo1(arr) {
  const t = arr.reduce((a, b) => a + b, 0) || 1;
  return arr.map((x) => x / t);
}

function updatePredictTotal() {
  const total = draft.reduce((a, b) => a + b, 0);
  const el = $('predictTotal');
  el.textContent = `Adds up to ${Math.round(total * 100)}%` + (Math.abs(total - 1) > 0.02 && total > 0 ? ' — we\'ll scale it to 100%' : '');
}

function endPredict(keep) {
  if (keep && draft && draft.some((x) => x > 0)) cur.prediction = normalizeTo1(draft);
  predicting = false;
  draft = null;
  $('predictBar').hidden = true;
  $('histWrap').classList.remove('predicting');
  $('predictBtn').setAttribute('aria-pressed', 'false');
  refreshAll();
}

// ---------------------------------------------------------------------------
// Sheets: learn, ideas, settings, welcome
// ---------------------------------------------------------------------------

function openLearn(tab = 'lesson') {
  openSheet(cur.exp.name, (body) => {
    const tabs = h('div', 'seg tabs', body);
    tabs.setAttribute('role', 'tablist');
    const pane = h('div', '', body);
    const show = (t) => {
      tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.t === t)));
      pane.textContent = '';
      if (t === 'lesson') buildLesson(pane, cur.exp, applyTry);
      else {
        const prose = h('div', 'prose', pane);
        prose.innerHTML = t === 'basics' ? BASICS : HOW_TO;
      }
    };
    for (const [t, l] of [['lesson', 'This experiment'], ['basics', 'Basics'], ['how', 'How to use']]) {
      const b = h('button', 'seg-btn', tabs, l);
      b.type = 'button';
      b.dataset.t = t;
      b.setAttribute('role', 'tab');
      b.addEventListener('click', () => show(t));
    }
    show(tab);
  });
}

function applyTry(t) {
  closeSheet();
  let next = { ...cur.exp.defaults, ...cur.config, ...t.config };
  if (cur.exp.applyPreset) next = cur.exp.applyPreset(next);
  applyConfig(next, { quiet: true });
  if (cur.results.n > 0) resetResults();
  state.trials = TRIAL_OPTIONS.includes(t.trials) ? t.trials : state.trials;
  setSpeed(t.speed);
  persist();
  updateDock();
  toast(t.text, { duration: 7000 });
  const run = $('runBtn');
  run.classList.remove('nudge');
  void run.offsetWidth;
  run.classList.add('nudge');
  window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
}

let installPrompt = null;

function openSettings() {
  openSheet('Settings', (body) => {
    const list = h('div', 'settings-list', body);
    const row = (title, sub) => {
      const r = h('div', 'setting', list);
      const t = h('div', '', r);
      h('b', '', t, title);
      if (sub) h('small', '', t, sub);
      return r;
    };
    const seg = (r, options, value, onPick) => {
      const s = h('div', 'seg seg-sm', r);
      for (const [v, l] of options) {
        const b = h('button', 'seg-btn', s, l);
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(v === value));
        b.addEventListener('click', () => {
          s.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', 'false'));
          b.setAttribute('aria-checked', 'true');
          onPick(v);
        });
      }
    };
    const toggle = (r, value, onSet, label) => {
      const sw = h('label', 'switch', r);
      const input = h('input', '', sw);
      input.type = 'checkbox';
      input.checked = value;
      input.setAttribute('aria-label', label);
      h('span', '', sw);
      input.addEventListener('change', () => onSet(input.checked));
    };

    seg(row('Appearance'), [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']], state.settings.theme, (v) => {
      state.settings.theme = v; applyTheme(); persist();
    });
    toggle(row('Sound effects', 'Gentle clicks and chimes'), state.settings.sound, (v) => {
      state.settings.sound = v; setSoundEnabled(v); persist(); if (v) playSound('done');
    }, 'Sound effects');
    toggle(row('Vibration', 'A tiny tap when a trial lands (Android)'), state.settings.haptics, (v) => {
      state.settings.haptics = v; setHaptics(v); persist(); if (v) haptic(15);
    }, 'Vibration');
    seg(row('Reduce motion', 'Shorter, simpler animations'), [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']], state.settings.reduceMotion, (v) => {
      state.settings.reduceMotion = v; applyMotion(); persist();
    });

    const seedRow = row('Random seed', 'Fixed seed = repeatable results. Give a class the same seed and everyone sees the same run.');
    seedRow.style.flexWrap = 'wrap';
    seg(seedRow, [['random', 'Random'], ['fixed', 'Fixed']], state.settings.seedMode, (v) => {
      state.settings.seedMode = v;
      seedBox.hidden = v !== 'fixed';
      if (v === 'fixed' && !state.settings.seed) { state.settings.seed = 'class-1'; input.value = 'class-1'; }
      reseedAll();
      persist();
    });
    const seedBox = h('div', 'seed-row', seedRow);
    seedBox.style.flexBasis = '100%';
    seedBox.hidden = state.settings.seedMode !== 'fixed';
    const input = h('input', 'input', seedBox);
    input.value = state.settings.seed;
    input.maxLength = 40;
    input.setAttribute('aria-label', 'Seed');
    input.autocomplete = 'off';
    const apply = h('button', 'btn btn-soft small', seedBox, 'Use seed');
    apply.type = 'button';
    apply.addEventListener('click', () => {
      state.settings.seed = input.value.trim() || 'class-1';
      input.value = state.settings.seed;
      reseedAll();
      persist();
      toast(`Seed “${state.settings.seed}” set — results cleared so every run starts the same way`);
    });

    const inst = row('Install app', installPrompt
      ? 'Add Probability Lab to your home screen. It works fully offline.'
      : isStandalone()
        ? 'Installed — you are using the app version.'
        : /iphone|ipad|ipod/i.test(navigator.userAgent)
          ? 'In Safari tap Share, then “Add to Home Screen”.'
          : 'Use your browser menu → “Install app” or “Add to Home screen”.');
    if (installPrompt) {
      const b = h('button', 'btn btn-accent small', inst);
      b.type = 'button';
      b.append(icon('install'), document.createTextNode('Install'));
      b.addEventListener('click', async () => {
        installPrompt.prompt();
        await installPrompt.userChoice.catch(() => null);
        installPrompt = null;
        closeSheet();
      });
    }
    const off = row('Offline', offlineReady ? 'Everything is saved on this device. No internet needed.' : (window.Capacitor ? 'Built into the app — no internet needed.' : 'Preparing offline copy…'));
    const pill = h('span', `status ${offlineReady || window.Capacitor ? 'good' : 'neutral'}`, off);
    pill.append(icon(offlineReady || window.Capacitor ? 'check' : 'info'), document.createTextNode(offlineReady || window.Capacitor ? 'Ready' : 'Working'));

    const resetRow = row('Start over', 'Clear saved setups and preferences on this device.');
    const rb = h('button', 'btn btn-soft small', resetRow, 'Reset app');
    rb.type = 'button';
    rb.addEventListener('click', () => {
      if (!confirm('Reset all setups and preferences?')) return;
      clearAll();
      location.reload();
    });
    h('p', 'note', body, `Probability Lab ${VERSION} · Works offline · No accounts, no tracking — everything stays on this device.`);
  });
}

function showWelcome() {
  openSheet('Welcome to Probability Lab', (body) => {
    const prose = h('div', 'prose', body);
    h('p', '', prose, 'Run chance experiments thousands of times and watch what “probability” really means.');
    const wrap = h('div', '', prose);
    wrap.innerHTML = HOW_TO.split('<h3>Keyboard</h3>')[0];
    const go = h('button', 'btn btn-accent', prose);
    go.type = 'button';
    go.append(icon('play'), document.createTextNode('Start experimenting'));
    go.addEventListener('click', closeSheet);
  }, {
    onClose: () => { state.seenWelcome = true; persist(); },
  });
}

function reseedAll() {
  for (const id of Object.keys(sessions)) {
    const s = sessions[id];
    s.rng = makeRng(id);
    s.results.reset();
  }
  activate(state.mode);
}

// ---------------------------------------------------------------------------
// Theme & motion
// ---------------------------------------------------------------------------

const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function applyTheme() {
  const t = state.settings.theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t === 'auto' && mqDark.matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0d0d0d' : '#f4f3ef'));
  requestAnimationFrame(() => {
    hist.themeChanged();
    conv.themeChanged();
    if (cur && cur.stage) cur.stage.themeChanged();
    refreshAll();
  });
}

function applyMotion() {
  const m = state.settings.reduceMotion;
  reducedMotion = m === 'on' || (m === 'auto' && mqMotion.matches);
  document.documentElement.classList.toggle('reduce-motion', m === 'on');
  runner.reducedMotion = reducedMotion;
  hist.reduced = reducedMotion;
}

// ---------------------------------------------------------------------------
// Toasts & announcements
// ---------------------------------------------------------------------------

let toastTimer = 0;
function toast(text, { action, onAction, duration = 3800 } = {}) {
  const el = $('toast');
  $('toastText').textContent = text;
  const btn = $('toastAction');
  btn.hidden = !action;
  btn.textContent = action || '';
  btn.onclick = () => { el.hidden = true; if (onAction) onAction(); };
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, duration);
}

function announce(text) {
  const a = $('announcer');
  a.textContent = '';
  setTimeout(() => { a.textContent = text; }, 30);
}

// ---------------------------------------------------------------------------
// Offline (service worker) & install
// ---------------------------------------------------------------------------

let offlineReady = false;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function registerServiceWorker() {
  if (window.Capacitor || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) {
          toast('A new version is ready', { action: 'Reload', onAction: () => location.reload(), duration: 12000 });
        }
      });
    });
  }).catch(() => { /* offline support is a progressive enhancement */ });
  navigator.serviceWorker.ready.then(() => {
    offlineReady = true;
    $('offlinePill').hidden = false;
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function buildTabs() {
  const nav = $('modes');
  for (const exp of EXPERIMENTS) {
    const b = h('button', 'mode-tab', nav);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset.mode = exp.id;
    b.append(icon(exp.icon), document.createTextNode(exp.name));
    b.addEventListener('click', () => { if (state.mode !== exp.id) activate(exp.id); });
  }
  nav.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = EXPERIMENTS.findIndex((x) => x.id === state.mode);
    const j = (i + (e.key === 'ArrowRight' ? 1 : -1) + EXPERIMENTS.length) % EXPERIMENTS.length;
    activate(EXPERIMENTS[j].id);
    nav.querySelector(`[data-mode="${EXPERIMENTS[j].id}"]`).focus();
    e.preventDefault();
  });
}

function bind() {
  $('runBtn').addEventListener('click', toggleRun);
  $('stepBtn').addEventListener('click', () => { if (predicting) endPredict(true); runner.step(); });
  $('resetBtn').addEventListener('click', resetResults);
  $('speed').addEventListener('input', (e) => setSpeed(Number(e.target.value)));
  $('learnBtn').addEventListener('click', () => openLearn());
  $('tryBtn').addEventListener('click', () => openLearn('lesson'));
  $('settingsBtn').addEventListener('click', openSettings);
  $('theoryToggle').addEventListener('click', () => {
    state.showTheory = !state.showTheory;
    persist();
    refreshAll();
  });
  $('unitSeg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-unit]');
    if (!b) return;
    state.unit = b.dataset.unit;
    persist();
    refreshAll();
  });
  $('predictBtn').addEventListener('click', () => (predicting ? endPredict(true) : startPredict()));
  $('predictDone').addEventListener('click', () => endPredict(true));
  $('predictCancel').addEventListener('click', () => endPredict(false));
  $('predictClear').addEventListener('click', () => { draft.fill(0); updatePredictTotal(); dirtyChart = true; wake(); });
  $('predictEven').addEventListener('click', () => {
    draft.fill(1 / draft.length);
    updatePredictTotal();
    dirtyChart = true;
    wake();
  });
  $('tableDetails').addEventListener('toggle', () => { if ($('tableDetails').open) renderTable(); });
  $('exportBtn').addEventListener('click', exportCsv);
  $('copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(csv()); toast('Copied the table — paste it into a spreadsheet'); }
    catch { toast('Copy isn’t available here — try Export'); }
  });

  document.addEventListener('keydown', (e) => {
    if (isSheetOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === ' ' && tag !== 'button') { e.preventDefault(); toggleRun(); }
    else if (e.key === 's' || e.key === 'S') runner.step();
    else if (e.key === 'r' || e.key === 'R') resetResults();
  });

  mqDark.addEventListener('change', () => { if (state.settings.theme === 'auto') applyTheme(); });
  mqMotion.addEventListener('change', applyMotion);
  window.addEventListener('resize', () => { dirtyChart = true; dirtyStats = true; wake(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && runner.state === 'running' && runner.speed.mode === 'animate') runner.pause();
  });
}

async function exportCsv() {
  const data = csv();
  const name = `probability-lab-${cur.exp.id}-${cur.results.n}-trials.csv`;
  try {
    const file = new File([data], name, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
  const a = h('a', '', document.body);
  a.href = url;
  a.download = name;
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// On wide screens the run controls live under the stage; on phones they float.
const mqWide = window.matchMedia('(min-width: 900px)');
function placeDock() {
  const dock = $('dock');
  if (mqWide.matches) {
    document.querySelector('.stage-card').after(dock);
  } else {
    $('app').appendChild(dock);
  }
  dock.classList.toggle('inline', mqWide.matches);
  document.body.classList.toggle('dock-inline', mqWide.matches);
}

function boot() {
  placeDock();
  mqWide.addEventListener('change', placeDock);
  hydrateIcons();
  initSheet();
  buildTabs();
  buildTrialChips();
  bind();
  setSoundEnabled(state.settings.sound);
  setHaptics(state.settings.haptics);
  applyMotion();
  runner.setSpeed(state.speed);
  activate(state.mode);
  applyTheme();
  registerServiceWorker();
  if (!state.seenWelcome) setTimeout(showWelcome, 300);
  // Exposed for automated tests and curious teachers in the console.
  window.probLab = { runner, get session() { return cur; }, state, activate, applyConfig: (p) => applyConfig({ ...cur.config, ...p }) };
}

boot();
