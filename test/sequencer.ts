import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { BaseSequencer } from 'vitest/node';
import type { TestSpecification } from 'vitest/node';

/**
 * Shards by weight rather than by Vitest's hash of the path, which put twice the work on one shard
 * as on another: each file, longest first, goes to the shard with the least work so far. The
 * weights are the seconds of each file in `test/durations.json` (`npm run test:durations`); a file
 * not in it weighs the median. Every shard works out the same split, so none runs a file twice.
 */
export class Sequencer extends BaseSequencer {
  weights = JSON.parse(
    readFileSync(new URL('./durations.json', import.meta.url), 'utf8'),
  ) as Record<string, number>;

  weigh(files: TestSpecification[]) {
    const known = Object.values(this.weights).sort((a, b) => a - b);
    const median = known[known.length >> 1] ?? 1;
    const root = this.ctx.config.root;
    return files
      .map(spec => {
        const path = relative(root, spec.moduleId).split('\\').join('/');
        return { spec, path, weight: this.weights[path] ?? median };
      })
      .sort((a, b) => b.weight - a.weight || (a.path < b.path ? -1 : 1));
  }

  override shard(files: TestSpecification[]) {
    const { index, count } = this.ctx.config.shard!;
    const load = new Array<number>(count).fill(0);
    const mine = this.weigh(files).filter(({ weight }) => {
      const least = load.indexOf(Math.min(...load));
      load[least] += weight;
      return least == index - 1;
    });
    return Promise.resolve(mine.map(({ spec }) => spec));
  }

  // Longest first, so a long file does not start last and keep a worker busy alone at the end.
  override sort(files: TestSpecification[]) {
    return Promise.resolve(this.weigh(files).map(({ spec }) => spec));
  }
}
