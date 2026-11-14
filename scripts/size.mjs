// Fails when a gzipped browser entry, shared chunks included, grows past its budget.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGETS = [
  // 76 KB until the detailed hands (the user, 2026-11-09: "peu importe le budget").
  // 92 and 18 KB until the moon's crater, rovers and base (the user, 2026-11-10: weight does not matter).
  // 110 KB until the space trooper's armour (the user, 2026-11-10: weight does not matter).
  // 144 KB until the woman's own helmet, 100 B under it (the user: weight does not matter).
  // 170 KB until the fist combos, the frags, the death falls and the runners' fingers (the user, 2026-11-13).
  // 174 KB until the ninja's belt, buckle, back and gold pads (the user, 2026-11-14).
  // 176 KB until 8 HP and the armour pickups (the user, 2026-11-14).
  { file: 'dist/index.js', max: 177 * 1024 },
  // 40 KB until the bots after UT2004's (the user, 2026-11-13).
  { file: 'dist/local.js', max: 44 * 1024 },
];

// An entry plus every chunk it statically imports, concatenated.
const collect = (file, seen = new Set()) => {
  if (seen.has(file)) {
    return '';
  }
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  const deps = [...src.matchAll(/from\s*["'](\.\/[^"']+)["']|import\s*["'](\.\/[^"']+)["']/g)];
  return src + deps.map(m => collect(join(dirname(file), m[1] ?? m[2]), seen)).join('');
};

let failed = false;
for (const { file, max } of BUDGETS) {
  const raw = collect(file);
  const gz = gzipSync(raw, { level: 9 }).length;
  const ok = gz <= max;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${file}: ${raw.length} B raw, ${gz} B gzip (budget ${max} B)`,
  );
}
process.exit(failed ? 1 : 0);
