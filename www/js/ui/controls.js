// Builds the "Set up" panel for an experiment from its declarative control list.

import { h } from '../stages/util.js';
import { icon } from './icons.js';
import { LETTERS } from '../experiments/spinner.js';
import { pct } from './format.js';

export function renderControls(root, exp, config, { onChange, onAction }) {
  root.textContent = '';
  for (const ctl of exp.controls(config)) {
    const row = h('div', `ctl ctl-${ctl.type}`, root);
    if (ctl.label && ctl.type !== 'sectors') {
      const lab = h('div', 'ctl-label', row);
      if (ctl.swatch) h('i', `swatch slot-${ctl.swatch}`, lab);
      h('span', '', lab, ctl.label);
      if (ctl.type === 'slider') h('output', 'ctl-value', lab, ctl.format ? ctl.format(config[ctl.key]) : String(config[ctl.key]));
    }
    const body = h('div', 'ctl-body', row);
    switch (ctl.type) {
      case 'stepper': stepper(body, ctl, config, onChange); break;
      case 'slider': slider(body, row, ctl, config, onChange); break;
      case 'choice': choice(body, ctl, config, onChange); break;
      case 'sectors': sectors(body, ctl, config, onChange); break;
      case 'actions':
        for (const a of ctl.actions) {
          const b = h('button', 'btn btn-soft', body);
          b.type = 'button';
          b.append(icon(a.icon), document.createTextNode(a.label));
          b.addEventListener('click', () => onAction(a.id));
        }
        break;
      default: break;
    }
    const hint = typeof ctl.hint === 'function' ? ctl.hint(config) : ctl.hint;
    if (hint) h('p', 'ctl-hint', row, hint);
  }
}

function stepper(body, ctl, config, onChange) {
  const v = config[ctl.key];
  const wrap = h('div', 'stepper', body);
  const set = (nv) => {
    nv = Math.max(ctl.min, Math.min(ctl.max, nv));
    if (nv !== config[ctl.key]) onChange({ [ctl.key]: nv });
  };
  const minus = h('button', 'step-btn', wrap);
  minus.type = 'button';
  minus.append(icon('minus'));
  minus.setAttribute('aria-label', `Fewer: ${ctl.label}`);
  minus.disabled = v <= ctl.min;
  const val = h('output', 'step-val', wrap, String(v));
  val.setAttribute('aria-live', 'polite');
  const plus = h('button', 'step-btn', wrap);
  plus.type = 'button';
  plus.append(icon('plus'));
  plus.setAttribute('aria-label', `More: ${ctl.label}`);
  plus.disabled = v >= ctl.max;
  minus.addEventListener('click', () => set(config[ctl.key] - 1));
  plus.addEventListener('click', () => set(config[ctl.key] + 1));
  if (ctl.max - ctl.min > 15) {
    const r = h('input', 'range', body);
    Object.assign(r, { type: 'range', min: ctl.min, max: ctl.max, step: 1, value: v });
    r.setAttribute('aria-label', ctl.label);
    r.addEventListener('input', () => { val.textContent = r.value; });
    r.addEventListener('change', () => set(Number(r.value)));
  }
}

function slider(body, row, ctl, config, onChange) {
  const r = h('input', 'range', body);
  Object.assign(r, { type: 'range', min: ctl.min, max: ctl.max, step: ctl.step, value: config[ctl.key] });
  r.setAttribute('aria-label', ctl.label);
  const out = row.querySelector('.ctl-value');
  const read = () => Math.round(Number(r.value) / ctl.step) * ctl.step;
  r.addEventListener('input', () => { out.textContent = ctl.format ? ctl.format(read()) : String(read()); });
  r.addEventListener('change', () => onChange({ [ctl.key]: Number(read().toFixed(4)) }));
}

function choice(body, ctl, config, onChange) {
  const seg = h('div', 'seg', body);
  seg.setAttribute('role', 'radiogroup');
  seg.setAttribute('aria-label', ctl.label);
  for (const o of ctl.options) {
    const b = h('button', 'seg-btn', seg, o.label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    const on = config[ctl.key] === o.value;
    b.setAttribute('aria-checked', String(on));
    b.addEventListener('click', () => {
      if (config[ctl.key] === o.value) return;
      const extra = ctl.onSelect ? ctl.onSelect(o.value) : null;
      onChange({ [ctl.key]: o.value, ...(extra || {}) });
    });
  }
}

function sectors(body, ctl, config, onChange) {
  const weights = config[ctl.key];
  const total = weights.reduce((a, b) => a + b, 0);
  const head = h('div', 'ctl-label', body);
  h('span', '', head, 'Sectors and their sizes');
  const list = h('div', 'sector-list', body);
  weights.forEach((w, i) => {
    const row = h('div', 'sector-row', list);
    h('i', `swatch big slot-${i + 1}`, row).textContent = LETTERS[i];
    const st = h('div', 'stepper small', row);
    const set = (nv) => {
      const next = weights.slice();
      next[i] = Math.max(1, Math.min(12, nv));
      onChange({ [ctl.key]: next });
    };
    const minus = h('button', 'step-btn', st);
    minus.type = 'button'; minus.append(icon('minus'));
    minus.setAttribute('aria-label', `Shrink sector ${LETTERS[i]}`);
    minus.disabled = w <= 1;
    minus.addEventListener('click', () => set(w - 1));
    h('output', 'step-val', st, String(w));
    const plus = h('button', 'step-btn', st);
    plus.type = 'button'; plus.append(icon('plus'));
    plus.setAttribute('aria-label', `Grow sector ${LETTERS[i]}`);
    plus.disabled = w >= 12;
    plus.addEventListener('click', () => set(w + 1));
    h('span', 'sector-share', row, `${w}/${total} = ${pct(w / total)}`);
    const rm = h('button', 'icon-btn small', row);
    rm.type = 'button';
    rm.append(icon('close'));
    rm.setAttribute('aria-label', `Remove sector ${LETTERS[i]}`);
    rm.disabled = weights.length <= 2;
    rm.addEventListener('click', () => onChange({ [ctl.key]: weights.filter((_, j) => j !== i) }));
  });
  const actions = h('div', 'sector-actions', body);
  const add = h('button', 'btn btn-soft', actions);
  add.type = 'button';
  add.append(icon('plus'), document.createTextNode('Add sector'));
  add.disabled = weights.length >= ctl.max;
  add.addEventListener('click', () => onChange({ [ctl.key]: [...weights, 1] }));
  const presets = h('div', 'chip-row', body);
  h('span', 'chip-row-label', presets, 'Presets');
  for (const p of ctl.presets) {
    const b = h('button', 'chip', presets, p.label);
    b.type = 'button';
    if (p.weights.join() === weights.join()) b.classList.add('on');
    b.addEventListener('click', () => onChange({ [ctl.key]: p.weights.slice() }));
  }
}
