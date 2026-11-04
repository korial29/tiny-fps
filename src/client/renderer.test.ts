// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from '../shared/level';
import { HALL } from '../shared/map';
import { ITEM, TEX } from '../shared/types';
import type { MapDef } from '../shared/types';
import { createEffects } from './effects';
import { LIGHT } from './lights';
import type { Light } from './lights';
import { STRIDE } from './mesh';
import { LAYERS } from './textures';
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
    lights = [] as Light[],
  ) => rd.frame([1, 1.6, 1], 0, 0, [], new Map(), fx, [], [], items, lights);

  it('builds a fragment shader with one specular row per layer and no stray JS values', () => {
    createRenderer(canvas, compile(ROOM));
    const src = calls.filter(c => c[0] == 'shaderSource').map(c => String(c[2]));
    const frag = src.find(s => s.includes('precision'))!;
    const rows = frag.match(/const vec2 SP\[(\d+)\]=vec2\[\]\((.*)\);/)!;
    expect(Number(rows[1])).toBe(LAYERS + 1);
    expect(rows[2].match(/vec2\(/g)).toHaveLength(LAYERS + 1);
    expect(frag).not.toMatch(/undefined|NaN|\[object/);
  });

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

  describe('lights', () => {
    const spot = (shadow = true): Light => ({
      kind: LIGHT.SPOT,
      p: [2, 1.6, 2],
      d: [1, 0, 0],
      cone: 0.9,
      range: 10,
      color: [1, 1, 1],
      shadow,
    });
    const layers = () =>
      calls.filter(c => c[0] == 'framebufferTextureLayer').map(c => c[5] as number);

    it('draws no depth pass without lights, nor for lights that cast nothing', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd);
      expect(layers()).toEqual([]);
      expect(draws()).toHaveLength(2);
      frame(rd, createEffects(), [], [spot(false), { ...spot(), kind: LIGHT.POINT }]);
      expect(layers()).toEqual([]);
      expect(draws()).toHaveLength(4);
    });

    it('draws one depth pass per mapped light, into its own layer, before the scene', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd, createEffects(), [], [spot(), spot(false), spot()]);
      expect(layers()).toEqual([0, 1]);
      // Two depth passes, then the world and the view model.
      expect(draws()).toHaveLength(4);
      expect(calls.filter(c => c[0] == 'clear')).toHaveLength(2 + 2);
      const scene = calls.findIndex(c => c[0] == 'viewport' && c[3] == 320);
      const drawn = (a: Call[]) => a.filter(c => c[0] == 'drawArrays').length;
      expect([drawn(calls.slice(0, scene)), drawn(calls.slice(scene))]).toEqual([2, 2]);
      expect(calls.find(c => c[0] == 'viewport')).toEqual(['viewport', 0, 0, 512, 512]);
      expect(calls.filter(c => c[0] == 'viewport').at(-1)).toEqual(['viewport', 0, 0, 320, 200]);
    });

    it('maps at most MAX_SHADOWS lights', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(
        rd,
        createEffects(),
        [],
        Array.from({ length: 7 }, () => spot()),
      );
      expect(layers()).toHaveLength(4);
    });

    it('leaves the unlit effects and the view model out of the depth passes', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd, createEffects(), [], [spot()]);
      const [depth, world] = draws();
      expect(depth[1]).toBe(world[1]);
      calls.length = 0;
      const fx = createEffects();
      fx.sparks.push({ p: [2, 1, 2], v: [0, 0, 0], life: 1 } as never);
      frame(rd, fx, [], [spot()]);
      const [d2, w2] = draws();
      expect(d2[1]).toBe(depth[1]);
      expect(w2[1]).toBe(depth[1] + 36);
    });

    it('unbinds the shadow map while writing it, and binds it back for the scene', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      calls.length = 0;
      frame(rd, createEffects(), [], [spot()]);
      const binds = calls.filter(c => c[0] == 'bindTexture').map(c => c[2]);
      expect(binds[0]).toBeNull();
      expect(binds[1]).not.toBeNull();
    });

    it('recreates the shadow map and its framebuffer when the context is restored', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      const count = (name: string) => calls.filter(c => c[0] == name).length;
      expect(count('texStorage3D')).toBe(1);
      expect(count('createFramebuffer')).toBe(1);
      canvas.dispatchEvent(new Event('webglcontextlost'));
      calls.length = 0;
      frame(rd, createEffects(), [], [spot()]);
      expect(calls).toEqual([]);
      canvas.dispatchEvent(new Event('webglcontextrestored'));
      expect(count('texStorage3D')).toBe(1);
      expect(count('createFramebuffer')).toBe(1);
      frame(rd, createEffects(), [], [spot()]);
      expect(layers()).toEqual([0]);
    });
  });
});
