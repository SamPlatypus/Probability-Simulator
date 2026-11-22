// Regenerates the service worker's precache list and cache version from the
// files in www/. Run after changing any app file: `npm run build`.
// `--check` exits non-zero if sw.js is out of date (used by `npm run check`).

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../www/', import.meta.url));
const swPath = join(root, 'sw.js');
const TEMPLATE_VERSION = /const VERSION = 'problab-[^']*';/;
const TEMPLATE_LIST = /const PRECACHE = \[[^\]]*\];/s;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return [p];
  });
}

const files = walk(root)
  .map((p) => relative(root, p).split(sep).join('/'))
  .filter((p) => p !== 'sw.js' && !p.startsWith('.') && !p.endsWith('.map'))
  .sort();

const hash = createHash('sha256');
for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
const version = hash.digest('hex').slice(0, 12);
const list = ['./', ...files.map((f) => `./${f}`)];

const current = readFileSync(swPath, 'utf8');
const next = current
  .replace(TEMPLATE_VERSION, `const VERSION = 'problab-${version}';`)
  .replace(TEMPLATE_LIST, `const PRECACHE = [\n${list.map((f) => `  '${f}',`).join('\n')}\n];`);

if (process.argv.includes('--check')) {
  if (next !== current) {
    console.error('www/sw.js is out of date — run `npm run build`.');
    process.exit(1);
  }
  console.log(`sw.js up to date (${list.length} files, ${version})`);
} else {
  writeFileSync(swPath, next);
  console.log(`sw.js: ${list.length} files precached, version ${version}`);
}
