// Inline SVG icons (24×24, 2px strokes). Drawn for this app; no icon font, so
// they render offline and crisply at any size.

const P = (d, extra = {}) => ['path', { d, ...extra }];
const C = (cx, cy, r, extra = {}) => ['circle', { cx, cy, r, ...extra }];
const R = (x, y, width, height, rx, extra = {}) => ['rect', { x, y, width, height, rx, ...extra }];
const F = { fill: 'currentColor', stroke: 'none' };

const ICONS = {
  coin: [C(12, 12, 9), C(12, 12, 5.5), P('M12 9.5v5')],
  die: [R(4, 4, 16, 16, 3.5), C(8.5, 8.5, 1.3, F), C(12, 12, 1.3, F), C(15.5, 15.5, 1.3, F)],
  spinner: [C(12, 12, 9), P('M12 12V3M12 12l7.8 4.5M12 12l-7.8 4.5'), C(12, 12, 1.6, F)],
  marbles: [C(7.5, 15.5, 4), C(16.5, 15.5, 4), C(12, 7.5, 4)],
  cards: [R(4, 7, 11, 14, 2), P('M8.5 7V5a2 2 0 0 1 2-2h7.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H15'), P('M9.5 12.2l-1.5 2 1.5 2 1.5-2z', F)],
  galton: [C(12, 4.5, 1.4, F), C(9, 8.5, 1.4, F), C(15, 8.5, 1.4, F), C(6, 12.5, 1.4, F), C(12, 12.5, 1.4, F), C(18, 12.5, 1.4, F), P('M3.5 21h17M8 17v4M12 16v5M16 17v4')],
  door: [P('M5.5 21V4.5a1.5 1.5 0 0 1 1.5-1.5h10a1.5 1.5 0 0 1 1.5 1.5V21M3 21h18'), C(15, 12.5, 1.1, F)],
  cake: [P('M4 21h16M5.5 21v-6.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2V21M5.5 16.5c1.6 1.2 3 1.2 4.4 0s2.8-1.2 4.2 0 2.8 1.2 4.4 0M12 12.5V9'), P('M12 4.2c.9 1 .9 2.1 0 2.8-.9-.7-.9-1.8 0-2.8z', F)],
  play: [P('M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5a.8.8 0 0 0-1.2.7z', F)],
  pause: [R(6.5, 5, 4, 14, 1.2, F), R(13.5, 5, 4, 14, 1.2, F)],
  step: [P('M5.5 6.2v11.6a.7.7 0 0 0 1.1.6l8.5-5.8a.7.7 0 0 0 0-1.2L6.6 5.6a.7.7 0 0 0-1.1.6z', F), P('M18.5 5.5v13')],
  reset: [P('M4 12a8 8 0 1 0 2.4-5.7'), P('M4 4.5v4.2h4.2')],
  book: [P('M3 5.5c3-1.3 6-1.3 9 .5v14c-3-1.8-6-1.8-9-.5zM21 5.5c-3-1.3-6-1.3-9 .5v14c3-1.8 6-1.8 9-.5z')],
  settings: [P('M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1'), C(15, 7, 2), C(9, 12, 2), C(17, 17, 2)],
  eye: [P('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'), C(12, 12, 3)],
  eyeOff: [P('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z'), C(12, 12, 3), P('M4 4l16 16')],
  pencil: [P('M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z'), P('M14.5 7.5l3 3')],
  download: [P('M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14')],
  close: [P('M6.5 6.5l11 11M17.5 6.5l-11 11')],
  plus: [P('M12 5.5v13M5.5 12h13')],
  minus: [P('M5.5 12h13')],
  shuffle: [P('M16 4h4v4M4 19.5 20 4M20 16v4h-4M14.5 14.5 20 20M4 4.5l5 5')],
  check: [P('M5 12.5l4.5 4.5L19 7.5')],
  info: [C(12, 12, 9), P('M12 11v5.5'), C(12, 7.8, 1.1, F)],
  sparkle: [P('M12 3.5l1.7 5 5 1.7-5 1.7-1.7 5-1.7-5-5-1.7 5-1.7z'), P('M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z')],
  target: [C(12, 12, 8.5), C(12, 12, 4.5), C(12, 12, 1.2, F)],
  table: [R(3.5, 4.5, 17, 15, 2), P('M3.5 9.5h17M3.5 14.5h17M10 9.5v10')],
  install: [P('M12 3.5v11M7.5 10 12 14.5l4.5-4.5'), P('M5 13.5v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4')],
  bolt: [P('M13 3 5 13.5h6l-1 7.5 8-10.5h-6z')],
  undo: [P('M9 14 4 9l5-5'), P('M4 9h10.5a5.5 5.5 0 0 1 0 11H11')],
  chevron: [P('M9 6l6 6-6 6')],
  speed: [P('M4.2 17.5a8.5 8.5 0 1 1 15.6 0'), P('M12 13.5l4-4.5'), C(12, 13.5, 1.6, F)],
};

const NS = 'http://www.w3.org/2000/svg';

export function icon(name, cls = 'ic') {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  for (const [tag, attrs] of ICONS[name] || []) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    s.appendChild(n);
  }
  return s;
}

/** Replace every <i data-icon="name"> placeholder in a subtree with its SVG. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    const svg = icon(el.dataset.icon, el.getAttribute('class') || 'ic');
    el.replaceWith(svg);
  });
}
