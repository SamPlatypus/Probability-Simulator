// Tiny synthesized sound effects (no audio files, so they work offline and add
// nothing to the download). Off by default; enabled in Settings.

let ac = null;
let enabled = false;
let lastAt = 0;

export function setSoundEnabled(on) { enabled = on; if (on) ensure(); }

function ensure() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

function tone(freq, dur, { type = 'sine', gain = 0.12, slide = 0, delay = 0 } = {}) {
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ac.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { gain = 0.1, freq = 2000, q = 1, delay = 0 } = {}) {
  const t = ac.currentTime + delay;
  const len = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const f = ac.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t);
}

const SOUNDS = {
  toss: () => noise(0.08, { freq: 3000, gain: 0.05 }),
  coin: () => { tone(2100, 0.25, { gain: 0.05 }); tone(3150, 0.18, { gain: 0.03, delay: 0.01 }); },
  rattle: () => { for (let i = 0; i < 4; i++) noise(0.04, { freq: 1400 + i * 300, gain: 0.07, delay: i * 0.06 }); },
  clack: () => { noise(0.05, { freq: 900, gain: 0.12, q: 2 }); noise(0.04, { freq: 1300, gain: 0.08, q: 2, delay: 0.05 }); },
  spin: () => noise(0.3, { freq: 600, gain: 0.03, q: 0.6 }),
  tick: () => tone(1500, 0.05, { type: 'triangle', gain: 0.06 }),
  pop: () => tone(700, 0.08, { gain: 0.07, slide: 400 }),
  swish: () => noise(0.14, { freq: 4000, gain: 0.04, q: 0.5 }),
  flip: () => noise(0.04, { freq: 2500, gain: 0.06 }),
  creak: () => tone(180, 0.25, { type: 'sawtooth', gain: 0.025, slide: 60 }),
  win: () => { tone(660, 0.12, { gain: 0.06 }); tone(990, 0.2, { gain: 0.06, delay: 0.1 }); },
  done: () => { tone(523, 0.12, { gain: 0.05 }); tone(659, 0.12, { gain: 0.05, delay: 0.09 }); tone(784, 0.22, { gain: 0.05, delay: 0.18 }); },
};

export function play(name) {
  if (!enabled || !SOUNDS[name]) return;
  const now = performance.now();
  if (now - lastAt < 30) return; // avoid machine-gun clicks
  lastAt = now;
  if (!ensure()) return;
  try { SOUNDS[name](); } catch { /* audio is best-effort */ }
}

let hapticsOn = true;
export function setHaptics(on) { hapticsOn = on; }
export function haptic(ms = 8) {
  if (hapticsOn && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* not supported */ }
  }
}
