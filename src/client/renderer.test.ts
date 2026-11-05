// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from '../shared/level';
import { ITEM, TEX } from '../shared/types';
import type { MapDef } from '../shared/types';
import { createEffects, lit } from './effects';
import { LIGHT } from './lights';
import type { Light } from './lights';
import { STRIDE } from './mesh';
import { LAYERS } from './textures';
import { FOG, MAX_PIXELS, MAX_TINTS, backing, createRenderer } from './render';

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
  ) => rd.frame([1, 1.6, 1], 0, 0, [], new Map(), fx, items, lights);

  it('builds a fragment shader with one specular row per layer and no stray JS values', () => {
    createRenderer(canvas, compile(ROOM));
    const src = calls.filter(c => c[0] == 'shaderSource').map(c => String(c[2]));
    const frag = src.find(s => s.includes('sampler2DArray'))!;
    const rows = frag.match(/const vec2 SP\[(\d+)\]=vec2\[\]\((.*)\);/)!;
    expect(Number(rows[1])).toBe(LAYERS + 1);
    expect(rows[2].match(/vec2\(/g)).toHaveLength(LAYERS + 1);
    expect(frag).not.toMatch(/undefined|NaN|\[object/);
  });

  it('draws the items after the level, in the same call', () => {
    const rd = createRenderer(canvas, compile(ROOM));
    const items = [{ id: 0, kind: ITEM.HEALTH, x: 2, y: 0, z: 2 }] as never[];
    frame(rd);
    const plain = draws();
    calls.length = 0;
    frame(rd, createEffects(), items);
    expect(draws()).toEqual([[0, plain[0][1] + 144]]);
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

    it('draws the scene into the multisampled target, resolves it, then draws the post passes, the last on the canvas', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      calls.length = 0;
      frame(rd);
      const blit = calls.findIndex(c => c[0] == 'blitFramebuffer');
      const post = calls.flatMap((c, i) => (c[0] == 'drawArrays' && c[3] == 3 ? [i] : []));
      expect(blit).toBeGreaterThan(0);
      expect(post.length).toBeGreaterThan(0);
      expect(post[0]).toBeGreaterThan(blit);
      // The scene: cleared and drawn into a target of its own, before the resolve.
      const scene = calls.slice(0, blit);
      expect(scene.filter(c => c[0] == 'drawArrays')).toHaveLength(1);
      const target = scene.find(c => c[0] == 'bindFramebuffer' && c[1] == K('FRAMEBUFFER'))!;
      expect(target[2]).not.toBeNull();
      expect(scene.indexOf(target)).toBeLessThan(scene.findIndex(c => c[0] == 'clear'));
      expect(scene.at(-2)).toEqual(['bindFramebuffer', K('READ_FRAMEBUFFER'), target[2]]);
      expect(scene.at(-1)).toEqual(['bindFramebuffer', K('DRAW_FRAMEBUFFER'), expect.anything()]);
      expect(calls[blit]).toEqual([
        'blitFramebuffer',
        ...[0, 0, 320, 200, 0, 0, 320, 200],
        K('COLOR_BUFFER_BIT'),
        K('NEAREST'),
      ]);
      // The last binding before the last pass is the canvas.
      expect(
        calls
          .slice(blit, post.at(-1))
          .filter(c => c[0] == 'bindFramebuffer')
          .at(-1),
      ).toEqual(['bindFramebuffer', K('FRAMEBUFFER'), null]);
      expect(calls[post.at(-1)!]).toEqual(['drawArrays', K('TRIANGLES'), 0, 3]);
    });

    /** Every post pass in the calls: what it drew into, at which size, in which mode, and what it read. */
    const passes = () => {
      const owner = new Map<unknown, unknown>();
      const units: unknown[] = [];
      let [fbo, unit, size, step] = [null as unknown, 0, [0, 0], [0, 0, 0]];
      const out: {
        to: unknown;
        size: number[];
        mode: number;
        step: number[];
        from: unknown[];
      }[] = [];
      for (const [name, ...a] of calls) {
        if (name == 'bindFramebuffer') {
          fbo = a[1];
        } else if (name == 'framebufferTexture2D' && fbo) {
          owner.set(fbo, a[3]);
        } else if (name == 'activeTexture') {
          unit = (a[0] as number) - K('TEXTURE0');
        } else if (name == 'bindTexture' && a[0] == FLAT) {
          units[unit] = a[1];
        } else if (name == 'viewport') {
          size = a.slice(2) as number[];
        } else if (name == 'uniform4f') {
          step = a.slice(1) as number[];
        } else if (name == 'drawArrays' && a[2] == 3) {
          out.push({
            to: fbo && owner.get(fbo),
            size,
            mode: step[2],
            step: step.slice(0, 2),
            from: [...units],
          });
        }
      }
      return out;
    };

    it('blooms the bright parts at half size, then blurs them at a quarter and an eighth', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd);
      const run = passes();
      expect(run.map(p => p.mode)).toEqual([0, 1, 1, 1, 1, 1, 1, 2]);
      expect(run.map(p => p.size)).toEqual([
        [160, 100],
        [160, 100],
        [160, 100],
        [80, 50],
        [80, 50],
        [40, 25],
        [40, 25],
        [320, 200],
      ]);
      // The bright pass steps by a texel of the scene, each blur by one of its own size: x then y.
      expect(run[0].step).toEqual([1 / 320, 1 / 200]);
      expect(run.slice(1, 7).map(p => p.step)).toEqual([
        [1 / 160, 0],
        [0, 1 / 100],
        [1 / 80, 0],
        [0, 1 / 50],
        [1 / 40, 0],
        [0, 1 / 25],
      ]);
    });

    it('never reads a texture it draws into, and composes the scene with the three blurs', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd);
      frame(rd);
      const run = passes();
      expect(run).toHaveLength(16);
      for (const { to, from } of run) {
        if (to) {
          expect(from).not.toContain(to);
        }
      }
      const [bright, h0, v0, h1, v1, h2, v2, compose] = run.slice(8);
      const scene = bright.from[0];
      expect(scene).toBeTruthy();
      // Level 0 blurs the bright pass in place through its scratch; each next level reads the last.
      expect(v0.to).toBe(bright.to);
      expect([h0.from[0], v0.from[0]]).toEqual([bright.to, h0.to]);
      expect([h1.from[0], v1.from[0]]).toEqual([v0.to, h1.to]);
      expect([h2.from[0], v2.from[0]]).toEqual([v1.to, h2.to]);
      expect(new Set([scene, v0.to, h0.to, v1.to, h1.to, v2.to, h2.to]).size).toBe(7);
      expect(compose.to).toBeNull();
      expect(compose.from).toEqual([scene, v0.to, v1.to, v2.to]);
    });

    it('unbinds units 1 to 3 after the composite: the next frame draws into the blurs', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd);
      const last = calls.filter(c => c[0] == 'bindTexture' && c[1] == FLAT).slice(-3);
      expect(last.map(c => c[2])).toEqual([null, null, null]);
      const units = calls.filter(c => c[0] == 'activeTexture').slice(-4);
      expect(units.map(c => (c[1] as number) - K('TEXTURE0'))).toEqual([3, 2, 1, 0]);
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
      expect(named('texStorage2D')[storage].slice(4)).toEqual([640, 360]);
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

  it('draws the world in one call, and nothing blended', () => {
    const rd = createRenderer(canvas, compile(ROOM));
    frame(rd);
    expect(draws()).toHaveLength(1);
    expect(calls.filter(c => c[0] == 'enable').map(c => c[1])).not.toContain(K('BLEND'));
    expect(calls.filter(c => c[0] == 'depthMask')).toHaveLength(0);
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

    it('takes the fog colour, density and clear colour from the map', () => {
      const fog: [number, number, number, number] = [0.5, 0.25, 0.125, 0.04];
      createRenderer(canvas, compile({ ...ROOM, fog }));
      expect(fogOf().at(-1)![2]).toEqual(fog);
      expect(clear()).toEqual([0.5, 0.25, 0.125, 1]);
    });

    it('uploads the tint palette, white first and padded with white', () => {
      const tint: [number, number, number] = [0.5, 0.25, 1];
      const lvl = compile({ ...ROOM, sectors: [{ ...ROOM.sectors[0], tint }] });
      createRenderer(canvas, lvl);
      const pal = Array.from(palOf().at(-1)![2] as Float32Array);
      expect(pal).toHaveLength(MAX_TINTS * 3);
      expect(pal.slice(0, 6)).toEqual([1, 1, 1, ...tint]);
      expect(pal.slice(6).every(v => v == 1)).toBe(true);
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
      expect(draws()).toHaveLength(1);
      frame(rd, createEffects(), [], [spot(false), { ...spot(), kind: LIGHT.POINT }]);
      expect(layers()).toEqual([]);
      expect(draws()).toHaveLength(2);
    });

    it('draws one depth pass per mapped light, into its own layer, before the scene', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd, createEffects(), [], [spot(), spot(false), spot()]);
      expect(layers()).toEqual([0, 1]);
      // Two depth passes, then the world.
      expect(draws()).toHaveLength(3);
      expect(calls.filter(c => c[0] == 'clear')).toHaveLength(2 + 1);
      const scene = calls.findIndex(c => c[0] == 'viewport' && c[3] == 320);
      const drawn = (a: Call[]) => a.filter(c => c[0] == 'drawArrays' && c[3] != 3).length;
      expect([drawn(calls.slice(0, scene)), drawn(calls.slice(scene))]).toEqual([2, 1]);
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

  describe('dust', () => {
    /** The motes of a fresh effects, scattered round a player at the eye of the test frames. */
    const dusty = () => {
      let n = 7;
      const fx = createEffects(() => (n = (n * 1103515245 + 12345) % 2147483648) / 2147483648);
      fx.update({ id: 0, x: 1, y: 0, z: 1, vy: 0, yaw: 0, pitch: 0, ground: true }, 0, 1 / 60);
      return fx;
    };
    const spot = (): Light => ({
      kind: LIGHT.SPOT,
      p: [2, 1.6, 2],
      d: [1, 0, 0],
      cone: 0.9,
      range: 10,
      color: [1, 1, 1],
      shadow: true,
    });
    const specks = (fx: ReturnType<typeof createEffects>) =>
      lit(fx, [1, 1.6, 1], [0, 0, -1]).length / 4;

    it('draws each mote the flashlight shows as a small unlit box, after the world', () => {
      const fx = dusty();
      const n = specks(fx);
      expect(n).toBeGreaterThan(2);
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd, fx);
      const data = calls
        .filter(c => c[0] == 'bufferSubData' && c[2] != 0)
        .at(-1)![3] as Float32Array;
      expect(data.length).toBe(n * 36 * STRIDE);
      for (let i = 0; i < data.length; i += STRIDE) {
        expect(data[i + 8]).toBe(-2);
      }
    });

    it('keeps them out of the depth passes', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd, createEffects(), [], [spot()]);
      const [depth, world] = draws();
      expect(depth[1]).toBe(world[1]);
      calls.length = 0;
      const fx = dusty();
      frame(rd, fx, [], [spot()]);
      const [d2, w2] = draws();
      expect(d2[1]).toBe(depth[1]);
      expect(w2[1]).toBe(depth[1] + specks(fx) * 36);
    });
  });
});
