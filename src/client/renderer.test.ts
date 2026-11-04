// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from '../shared/level';
import { HALL } from '../shared/map';
import { ITEM, TEX } from '../shared/types';
import type { MapDef } from '../shared/types';
import { createEffects } from './effects';
import { STRIDE } from './mesh';
import { createRenderer, levelVerts } from './render';

type Call = [name: string, ...args: unknown[]];

// A GL that records its calls and answers constants with 1 and everything else with a no-op.
const fakeGl = (calls: Call[]) =>
  new Proxy({} as Record<string, unknown>, {
    get: (_, name: string) =>
      /^[A-Z_\d]+$/.test(name)
        ? 1
        : (...args: unknown[]) => {
            calls.push([name, ...args]);
            return {};
          },
  });

const ROOM: MapDef = {
  sectors: [
    {
      pts: [
        [0, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      floor: 0,
      ceil: 3,
      ft: TEX.TILE,
      wt: TEX.BRICK,
      ct: TEX.STONE,
    },
  ],
  spawns: [[1, 1, 0]],
};

describe('createRenderer', () => {
  let calls: Call[];
  let canvas: HTMLCanvasElement;
  beforeEach(() => {
    calls = [];
    canvas = document.createElement('canvas');
    Object.defineProperty(canvas, 'clientWidth', { value: 320 });
    Object.defineProperty(canvas, 'clientHeight', { value: 200 });
    vi.stubGlobal('devicePixelRatio', 1);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) =>
      kind == 'webgl2' ? fakeGl(calls) : {}) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const draws = () =>
    calls.filter(c => c[0] == 'drawArrays').map(c => [c[2], c[3]] as [number, number]);
  const frame = (
    rd: ReturnType<typeof createRenderer>,
    fx = createEffects(),
    items = [] as never[],
  ) => rd.frame([1, 1.6, 1], 0, 0, [], new Map(), fx, [], [], items);

  it('rebuilds the level geometry on level()', () => {
    const [a, b] = [compile(HALL), compile(ROOM)];
    const rd = createRenderer(canvas, a);
    const head = () =>
      calls.filter(c => c[0] == 'bufferSubData' && c[2] == 0).at(-1)?.[3] as Float32Array;
    expect(head()).toHaveLength(levelVerts(a).length);
    rd.level(b);
    expect(head()).toEqual(new Float32Array(levelVerts(b)));
    expect(calls.filter(c => c[0] == 'bufferData').at(-1)?.[2]).toBeGreaterThan(
      levelVerts(b).length * 4,
    );
    frame(rd);
    // The world draw starts from the new level's vertices.
    expect(draws()[0][1]).toBeGreaterThanOrEqual(levelVerts(b).length / STRIDE);
    expect(draws()[0][1]).toBeLessThan(levelVerts(a).length / STRIDE);
  });

  it('draws the items, and the gun on top unless dead', () => {
    const rd = createRenderer(canvas, compile(ROOM));
    const items = [{ id: 0, kind: ITEM.HEALTH, x: 2, y: 0, z: 2 }] as never[];
    frame(rd);
    const plain = draws();
    calls.length = 0;
    frame(rd, createEffects(), items);
    expect(draws()[0][1]).toBe(plain[0][1] + 144);
    // The second call is the view model.
    expect(draws()[1][1]).toBeGreaterThan(0);
    calls.length = 0;
    const fx = createEffects();
    fx.update(undefined, 0, 0.1, true);
    frame(rd, fx);
    expect(draws()[1][1]).toBe(0);
  });
});
