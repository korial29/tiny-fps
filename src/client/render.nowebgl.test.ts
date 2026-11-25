import { expect, it } from 'vitest';
import { ROOFTOPS } from '../shared/map';
import { build } from '../shared/world';
import { createRenderer } from './render';

// A file of its own: no other test has built the renderer's meshes yet (they are memoized).
it('throws at once with no WebGL2, before the seconds of its builds', () => {
  const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
  const t = performance.now();
  expect(() => createRenderer(canvas, build(ROOFTOPS))).toThrow('WebGL2 is not available');
  // The builds (warmSteps()) take some 2 s here, far more on a loaded runner.
  expect(performance.now() - t).toBeLessThan(500);
});
