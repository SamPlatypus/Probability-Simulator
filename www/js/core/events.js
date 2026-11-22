// An "event" is a set of outcomes the learner is watching, e.g. "sum ≥ 9" or
// "Hearts or Diamonds". Numeric experiments use comparisons against an anchor
// outcome; categorical ones use an explicit set.

export const OPS = { eq: '=', le: '≤', ge: '≥' };

export function defaultEvent(model) {
  return model.defaultEvent ? { ...model.defaultEvent } : { type: 'set', items: [0] };
}

/** Make sure an event still fits the model (outcome count can change). */
export function sanitizeEvent(model, ev) {
  const k = model.outcomes.length;
  if (!ev) return defaultEvent(model);
  if (model.numeric) {
    if (ev.type !== 'cmp') return defaultEvent(model);
    return { type: 'cmp', op: OPS[ev.op] ? ev.op : 'eq', anchor: Math.max(0, Math.min(k - 1, ev.anchor | 0)) };
  }
  if (ev.type !== 'set') return defaultEvent(model);
  const items = [...new Set(ev.items.filter((i) => i >= 0 && i < k))];
  return items.length ? { type: 'set', items } : defaultEvent(model);
}

export function eventMask(model, ev) {
  const k = model.outcomes.length;
  const mask = new Array(k).fill(false);
  if (ev.type === 'cmp') {
    for (let i = 0; i < k; i++) {
      mask[i] = ev.op === 'eq' ? i === ev.anchor : ev.op === 'le' ? i <= ev.anchor : i >= ev.anchor;
    }
  } else {
    for (const i of ev.items) mask[i] = true;
  }
  return mask;
}

export function eventProbability(model, mask) {
  let p = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) p += model.probs[i];
  return Math.min(1, p);
}

export function describeEvent(model, ev) {
  if (ev.type === 'cmp') {
    const o = model.outcomes[ev.anchor];
    return `${model.subject} ${OPS[ev.op]} ${o.label}`;
  }
  const labels = ev.items.slice().sort((a, b) => a - b).map((i) => model.outcomes[i].label);
  if (labels.length === model.outcomes.length) return 'Any outcome';
  if (labels.length <= 3) return labels.join(' or ');
  return `${labels.slice(0, 2).join(', ')} + ${labels.length - 2} more`;
}

/**
 * What tapping a bar does to the event. Numeric: moves the anchor. Categorical:
 * selects just that outcome, or (with `combine`) toggles it in/out of the set.
 */
export function tapEvent(model, ev, index, combine = false) {
  if (model.numeric) return { type: 'cmp', op: ev.type === 'cmp' ? ev.op : 'eq', anchor: index };
  if (!combine) return { type: 'set', items: [index] };
  const set = new Set(ev.type === 'set' ? ev.items : []);
  if (set.has(index)) {
    if (set.size > 1) set.delete(index);
  } else {
    set.add(index);
  }
  return { type: 'set', items: [...set] };
}
