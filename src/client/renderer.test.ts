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
import { FOG, MAX_PIXELS, MAX_TINTS, backing, createRenderer, levelVerts } from './render';

type Call = [name: string, ...args: unknown[]];

// A GL that records its calls. Each constant answers with a number of its own (K says which), an
// extension with `ext`, and everything else with a new object.
const consts = new Map<string, number>();
const K = (name: string) => {
  if (!consts.has(name)) {
    consts.set(name, 1e6 + consts.size);
  }
  return consts.get(name)!;
};
const fakeGl = (calls: Call[], ext: () => unknown) =>
  new Proxy({} as Record<string, unknown>, {
    get: (_, name: string) =>
      /^[A-Z_\d]+$/.test(name)
        ? K(name)
        : (...args: unknown[]) => {
            calls.push([name, ...args]);
            return name == 'getExtension' ? ext() : {};
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
  let float: unknown;
  beforeEach(() => {
    calls = [];
    float = {};
    canvas = document.createElement('canvas');
    resize(320, 200);
    vi.stubGlobal('devicePixelRatio', 1);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) =>
      kind == 'webgl2' ? fakeGl(calls, () => float) : {}) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // The scene's draws: the post passes each draw a bare triangle.
  const resize = (w: number, h: number) => {
    Object.defineProperty(canvas, 'clientWidth', { value: w, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: h, configurable: true });
  };
  const draws = () =>
    calls.filter(c => c[0] == 'drawArrays' && c[3] != 3).map(c => [c[2], c[3]] as [number, number]);
  const frame = (
    rd: ReturnType<typeof createRenderer>,
    fx = createEffects(),
    items = [] as never[],
    lights = [] as Light[],
  ) => rd.frame([1, 1.6, 1], 0, 0, [], new Map(), fx, [], [], items, lights);

  it('builds a fragment shader with one specular row per layer and no stray JS values', () => {
    createRenderer(canvas, compile(ROOM));
    const src = calls.filter(c => c[0] == 'shaderSource').map(c => String(c[2]));
    const frag = src.find(s => s.includes('sampler2DArray'))!;
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

  describe('post-processing', () => {
    const named = (name: string) => calls.filter(c => c[0] == name);
    const FLAT = K('TEXTURE_2D');

    it('asks for a context with no antialiasing and no depth: the scene target has both', () => {
      createRenderer(canvas, compile(ROOM));
      expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('webgl2', {
        antialias: false,
        depth: false,
      });
    });

    it('draws the scene into the multisampled target, resolves it, then draws the post pass on the canvas', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      calls.length = 0;
      frame(rd);
      const blit = calls.findIndex(c => c[0] == 'blitFramebuffer');
      const triangle = calls.findIndex(c => c[0] == 'drawArrays' && c[3] == 3);
      expect(blit).toBeGreaterThan(0);
      expect(triangle).toBeGreaterThan(blit);
      const scene = calls.slice(0, blit);
      expect(scene.filter(c => c[0] == 'drawArrays')).toHaveLength(2);
      // Cleared and drawn with the multisampled target bound.
      const binds = calls.filter(c => c[0] == 'bindFramebuffer');
      expect(binds.find(c => c[1] == K('FRAMEBUFFER'))![2]).not.toBeNull();
      expect(calls.indexOf(binds.find(c => c[1] == K('FRAMEBUFFER'))!)).toBeLessThan(
        calls.findIndex(c => c[0] == 'clear'),
      );
      expect(calls.slice(blit - 2, blit)).toEqual([
        ['bindFramebuffer', K('READ_FRAMEBUFFER'), expect.anything()],
        ['bindFramebuffer', K('DRAW_FRAMEBUFFER'), expect.anything()],
      ]);
      expect(calls[blit]).toEqual([
        'blitFramebuffer',
        ...[0, 0, 320, 200, 0, 0, 320, 200],
        K('COLOR_BUFFER_BIT'),
        K('NEAREST'),
      ]);
      // The last binding before the post pass is the canvas.
      expect(
        calls
          .slice(blit, triangle)
          .filter(c => c[0] == 'bindFramebuffer')
          .at(-1),
      ).toEqual(['bindFramebuffer', K('FRAMEBUFFER'), null]);
      expect(calls.slice(triangle).filter(c => c[0] == 'drawArrays')).toHaveLength(1);
      expect(calls[triangle]).toEqual(['drawArrays', K('TRIANGLES'), 0, 3]);
    });

    it('allocates the targets at the backing size, 16-bit float with the extension', () => {
      createRenderer(canvas, compile(ROOM));
      expect(named('getExtension').map(c => c[1])).toContain('EXT_color_buffer_float');
      expect(named('texStorage2D')[0]).toEqual(['texStorage2D', FLAT, 1, K('RGBA16F'), 320, 200]);
      expect(named('renderbufferStorageMultisample').map(c => c.slice(2))).toEqual([
        [4, K('RGBA16F'), 320, 200],
        [4, K('DEPTH_COMPONENT24'), 320, 200],
      ]);
    });

    it('falls back to 8 bits without the extension', () => {
      float = null;
      createRenderer(canvas, compile(ROOM));
      expect(named('texStorage2D').every(c => c[3] == K('RGBA8'))).toBe(true);
      expect(named('renderbufferStorageMultisample')[0][3]).toBe(K('RGBA8'));
    });

    it('scales the targets with the pixel ratio and the pixel budget', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      resize(1920, 1080);
      createRenderer(canvas, compile(ROOM));
      const [w, h] = backing(1920, 1080, 2);
      expect(named('texStorage2D')[0].slice(4)).toEqual([w, h]);
      expect(w * h).toBeLessThanOrEqual(MAX_PIXELS);
    });

    it('reallocates the targets, and frees the old ones, when the size changes', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd);
      const storage = named('texStorage2D').length;
      const frees = () => named('deleteTexture').length + named('deleteRenderbuffer').length;
      expect(frees()).toBe(0);
      resize(640, 360);
      frame(rd);
      expect(named('texStorage2D')).toHaveLength(2 * storage);
      expect(named('texStorage2D').at(-1)!.slice(4)).toEqual([640, 360]);
      expect(named('renderbufferStorageMultisample').at(-1)!.slice(4)).toEqual([640, 360]);
      expect(frees()).toBeGreaterThan(0);
      expect(canvas.width).toBe(640);
      // The same size again leaves them alone.
      frame(rd);
      expect(named('texStorage2D')).toHaveLength(2 * storage);
    });

    it('builds the targets at the first frame when the canvas had no size yet', () => {
      resize(0, 0);
      const rd = createRenderer(canvas, compile(ROOM));
      expect(named('texStorage2D')).toHaveLength(0);
      frame(rd);
      expect(named('texStorage2D')).toHaveLength(0);
      resize(320, 200);
      frame(rd);
      expect(named('texStorage2D').length).toBeGreaterThan(0);
    });

    it('rebuilds the post program and the targets when the context is restored', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      const programs = named('createProgram').length;
      const storage = named('texStorage2D').length;
      canvas.dispatchEvent(new Event('webglcontextlost'));
      calls.length = 0;
      frame(rd);
      expect(calls).toEqual([]);
      canvas.dispatchEvent(new Event('webglcontextrestored'));
      expect(named('createProgram')).toHaveLength(programs);
      expect(named('texStorage2D')).toHaveLength(storage);
      expect(named('renderbufferStorageMultisample')).toHaveLength(2);
      calls.length = 0;
      frame(rd);
      expect(named('blitFramebuffer')).toHaveLength(1);
      expect(named('texStorage2D')).toHaveLength(0);
    });
  });

  describe('atmosphere', () => {
    const fogOf = () => calls.filter(c => c[0] == 'uniform4fv' && (c[2] as number[]).length == 4);
    const palOf = () => calls.filter(c => c[0] == 'uniform3fv' && (c[2] as number[]).length > 3);
    const clear = () =>
      calls
        .filter(c => c[0] == 'clearColor')
        .at(-1)!
        .slice(1);

    it('fogs and clears with the dark haze when the map sets none', () => {
      createRenderer(canvas, compile(ROOM));
      expect(fogOf().at(-1)![2]).toEqual(FOG);
      expect(clear()).toEqual([FOG[0], FOG[1], FOG[2], 1]);
      expect(FOG[3]).toBe(0.02);
    });

    it('takes the fog colour, density and clear colour from the map, and changes with the level', () => {
      const fog: [number, number, number, number] = [0.5, 0.25, 0.125, 0.04];
      const rd = createRenderer(canvas, compile({ ...ROOM, fog }));
      expect(fogOf().at(-1)![2]).toEqual(fog);
      expect(clear()).toEqual([0.5, 0.25, 0.125, 1]);
      rd.level(compile(ROOM));
      expect(fogOf().at(-1)![2]).toEqual(FOG);
      expect(clear()).toEqual([FOG[0], FOG[1], FOG[2], 1]);
    });

    it('uploads the tint palette, white first and padded with white', () => {
      const tint: [number, number, number] = [0.5, 0.25, 1];
      const lvl = compile({ ...ROOM, sectors: [{ ...ROOM.sectors[0], tint }] });
      const rd = createRenderer(canvas, lvl);
      const pal = Array.from(palOf().at(-1)![2] as Float32Array);
      expect(pal).toHaveLength(MAX_TINTS * 3);
      expect(pal.slice(0, 6)).toEqual([1, 1, 1, ...tint]);
      expect(pal.slice(6).every(v => v == 1)).toBe(true);
      rd.level(compile(ROOM));
      expect(Array.from(palOf().at(-1)![2] as Float32Array).every(v => v == 1)).toBe(true);
    });

    it('declares the fog and palette uniforms in the shader', () => {
      createRenderer(canvas, compile(ROOM));
      const frag = calls
        .filter(c => c[0] == 'shaderSource')
        .map(c => String(c[2]))
        .find(s => s.includes('sampler2DArray'))!;
      expect(frag).toContain(`G[${MAX_TINTS}]`);
      expect(frag).not.toMatch(/undefined|NaN|\[object/);
    });
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
      const drawn = (a: Call[]) => a.filter(c => c[0] == 'drawArrays' && c[3] != 3).length;
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

    it('recreates the shadow map, the targets and their framebuffers when the context is restored', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      const count = (name: string) => calls.filter(c => c[0] == name).length;
      const made = count('createFramebuffer');
      expect(count('texStorage3D')).toBe(1);
      canvas.dispatchEvent(new Event('webglcontextlost'));
      calls.length = 0;
      frame(rd, createEffects(), [], [spot()]);
      expect(calls).toEqual([]);
      canvas.dispatchEvent(new Event('webglcontextrestored'));
      expect(count('texStorage3D')).toBe(1);
      expect(count('createFramebuffer')).toBe(made);
      frame(rd, createEffects(), [], [spot()]);
      expect(layers()).toEqual([0]);
    });
  });
});
