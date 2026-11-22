// A bottom sheet on phones, a centred dialog on wider screens.

const sheet = () => document.getElementById('sheet');
const backdrop = () => document.getElementById('backdrop');
let lastFocus = null;
let onCloseCb = null;

export function openSheet(title, build, { onClose } = {}) {
  const s = sheet();
  document.getElementById('sheetTitle').textContent = title;
  const body = document.getElementById('sheetBody');
  body.textContent = '';
  body.scrollTop = 0;
  build(body);
  lastFocus = document.activeElement;
  onCloseCb = onClose || null;
  s.hidden = false;
  backdrop().hidden = false;
  // A history entry lets the Android back button / browser back close the sheet.
  if (!(history.state && history.state.sheet)) history.pushState({ sheet: true }, '');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => document.getElementById('sheetClose').focus({ preventScroll: true }));
}

export function closeSheet(fromHistory = false) {
  const s = sheet();
  if (s.hidden) return;
  if (!fromHistory && history.state && history.state.sheet) history.back();
  s.hidden = true;
  backdrop().hidden = true;
  s.style.transform = '';
  document.body.style.overflow = '';
  const cb = onCloseCb;
  onCloseCb = null;
  if (cb) cb();
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}

export function isSheetOpen() { return !sheet().hidden; }

export function initSheet() {
  document.getElementById('sheetClose').addEventListener('click', () => closeSheet());
  backdrop().addEventListener('click', () => closeSheet());
  window.addEventListener('popstate', () => { if (isSheetOpen()) closeSheet(true); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isSheetOpen()) closeSheet();
    if (e.key === 'Tab' && isSheetOpen()) trapFocus(e);
  });
  // Drag the grip down to dismiss.
  const grip = document.getElementById('sheetGrip');
  let y0 = null;
  grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; grip.setPointerCapture(e.pointerId); });
  grip.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    const dy = Math.max(0, e.clientY - y0);
    sheet().style.transform = `translateY(${dy}px)`;
  });
  const end = (e) => {
    if (y0 === null) return;
    const dy = e.clientY - y0;
    y0 = null;
    if (dy > 90) closeSheet(); else sheet().style.transform = '';
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
}

function trapFocus(e) {
  const nodes = [...sheet().querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])')]
    .filter((n) => !n.disabled && n.offsetParent !== null);
  if (!nodes.length) return;
  const first = nodes[0], last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
  else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
}
