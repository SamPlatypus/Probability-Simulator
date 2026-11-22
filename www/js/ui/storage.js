// Settings and setups persist in localStorage (per device, works offline).
// Every access is guarded: private browsing or blocked storage just means the
// app starts fresh each time.

const KEY = 'problab.v1';
let timer = 0;

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

export function save(data, immediate = false) {
  clearTimeout(timer);
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* storage unavailable */ }
  };
  if (immediate) write(); else timer = setTimeout(write, 250);
}

export function clearAll() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
