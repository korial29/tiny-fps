// Writes test/durations.json, the seconds of each test file, from a Vitest JSON report: the weights
// test/sequencer.ts shards by. Refresh it when files are added, split or grow (npm run test:durations).
import { readFileSync, writeFileSync } from 'node:fs';
import { relative } from 'node:path';

const [report] = process.argv.slice(2);
const root = process.cwd();
const { testResults } = JSON.parse(readFileSync(report, 'utf8'));
const weights = Object.fromEntries(
  testResults
    .map(f => [
      relative(root, f.name).split('\\').join('/'),
      Math.round((f.endTime - f.startTime) / 100) / 10,
    ])
    .sort(([a], [b]) => (a < b ? -1 : 1)),
);
writeFileSync('test/durations.json', JSON.stringify(weights, null, 2) + '\n');
console.log(`test/durations.json: ${Object.keys(weights).length} files`);
