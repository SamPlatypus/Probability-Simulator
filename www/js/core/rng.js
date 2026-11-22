// Seedable pseudo-random number generator.
//
// We use sfc32 (Small Fast Counting, 32-bit): it is fast in JavaScript, passes
// PractRand to large sizes, and — unlike Math.random — can be seeded. Seeding
// lets a teacher give a whole class the same "random" run, and lets the test
// suite check simulations deterministically.

/** Hash an arbitrary string into four 32-bit words (cyrb128). */
export function hashSeed(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4; h2 ^= h1; h3 ^= h1; h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** A fresh, unpredictable seed string. */
export function randomSeed() {
  const words = new Uint32Array(2);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(words);
  } else {
    words[0] = (Math.random() * 2 ** 32) >>> 0;
    words[1] = (Math.random() * 2 ** 32) >>> 0;
  }
  return words[0].toString(36) + words[1].toString(36);
}

/**
 * Create a generator.
 * @param {string|number} [seed] same seed => same sequence. Omit for a random one.
 * @returns {{ next(): number, int(n: number): number, bool(p: number): boolean, seed: string }}
 */
export function createRng(seed) {
  const seedStr = seed === undefined || seed === null || seed === '' ? randomSeed() : String(seed);
  let [a, b, c, d] = hashSeed(seedStr);

  function nextU32() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return t >>> 0;
  }
  // Discard the first outputs so similar seeds diverge immediately.
  for (let i = 0; i < 15; i++) nextU32();

  /** Uniform float in [0, 1). */
  const next = () => nextU32() / 4294967296;

  return {
    seed: seedStr,
    next,
    /** Uniform integer in [0, n). Unbiased for any n up to 2^32. */
    int(n) {
      if (n <= 1) return 0;
      // Rejection sampling removes the modulo bias of `u32 % n`.
      const limit = 4294967296 - (4294967296 % n);
      let x;
      do { x = nextU32(); } while (x >= limit);
      return x % n;
    },
    /** true with probability p. */
    bool(p) { return next() < p; },
  };
}
