// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from '../shared/level';
import { HALL } from '../shared/map';
import { ITEM, TEX } from '../shared/types';
import type { MapDef } from '../shared/types';
import { TRAIL, createEffects, fade, puff } from './effects';
import type { Puff } from './effects';
import { LIGHT } from './lights';
import type { Light } from './lights';
import { METAL, STRIDE } from './mesh';
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
    expect(Number(rows[1])).toBe(LAYERS + 2);
    expect(rows[2].match(/vec2\(/g)).toHaveLength(LAYERS + 2);
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

    it('draws the scene into the multisampled target, resolves it, then draws the post passes, the last on the canvas', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      calls.length = 0;
      frame(rd);
      const blit = calls.findIndex(c => c[0] == 'blitFramebuffer');
      const post = calls.flatMap((c, i) => (c[0] == 'drawArrays' && c[3] == 3 ? [i] : []));
      expect(blit).toBeGreaterThan(0);
      expect(post.length).toBeGreaterThan(0);
      expect(post[0]).toBeGreaterThan(blit);
      // The scene: cleared and drawn (world and gun) into a target of its own, before the resolve.
      const scene = calls.slice(0, blit);
      expect(scene.filter(c => c[0] == 'drawArrays')).toHaveLength(2);
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

  describe('smoke', () => {
    const cloud = (x: number, z: number, t = 0.5): Puff => ({
      p: [x, 1.5, z],
      v: [0, 0, 0],
      r: 0.3,
      yaw: 0,
      t,
      life: 2,
    });
    const smoky = (...puffs: Puff[]) => {
      const fx = createEffects();
      fx.smoke.push(...puffs);
      return fx;
    };
    const named = (name: string) => calls.filter(c => c[0] == name);

    it('draws nothing blended without smoke', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd);
      expect(named('enable').map(c => c[1])).not.toContain(K('BLEND'));
      expect(named('depthMask')).toHaveLength(0);
      expect(draws()).toHaveLength(2);
    });

    it('draws it after the opaque scene with blending on and depth writes off, then the gun', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      expect(named('blendFunc')[0].slice(1)).toEqual([K('SRC_ALPHA'), K('ONE_MINUS_SRC_ALPHA')]);
      calls.length = 0;
      frame(rd);
      const [world, gun] = draws();
      calls.length = 0;
      frame(rd, smoky(cloud(2, 0), cloud(2, 3)));
      const [w, smoke, g] = draws();
      expect(w).toEqual(world);
      // Two billboards of six vertices, right after the world, before the gun.
      expect(smoke).toEqual([world[1], 12]);
      expect(g).toEqual([world[1] + 12, gun[1]]);
      const at = (name: string, ...args: unknown[]) =>
        calls.findIndex(c => c[0] == name && args.every((a, i) => c[i + 1] == a));
      const drawn = calls
        .map((c, i) => (c[0] == 'drawArrays' && c[3] == 12 ? i : -1))
        .find(i => i > 0)!;
      expect(at('enable', K('BLEND'))).toBeLessThan(drawn);
      expect(at('depthMask', false)).toBeLessThan(drawn);
      expect(at('depthMask', true)).toBeGreaterThan(drawn);
      expect(at('disable', K('BLEND'))).toBeGreaterThan(drawn);
      // The gun's depth clear comes after the smoke has been drawn.
      const clears = calls.map((c, i) => (c[0] == 'clear' ? i : -1)).filter(i => i >= 0);
      expect(clears.at(-1)).toBeGreaterThan(drawn);
      expect(clears.filter(i => i < drawn)).toHaveLength(1);
    });

    it('keeps it out of the depth passes', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      const light: Light = {
        kind: LIGHT.SPOT,
        p: [2, 1.6, 2],
        d: [1, 0, 0],
        cone: 0.9,
        range: 10,
        color: [1, 1, 1],
        shadow: true,
      };
      frame(rd, createEffects(), [], [light]);
      const [depth] = draws();
      calls.length = 0;
      frame(rd, smoky(cloud(2, 0)), [], [light]);
      expect(draws()[0]).toEqual(depth);
    });

    /** The billboards of the last frame: centre, alpha and the layer of each vertex. */
    const quads = () => {
      const data = calls.filter(c => c[0] == 'bufferSubData').at(-1)![3] as Float32Array;
      const out: { c: number[]; a: number[]; n: number[]; uv: number[][] }[] = [];
      let cur: number[][] = [];
      for (let i = 0; i < data.length; i += STRIDE) {
        if (data[i + 8] == -3) {
          cur.push(Array.from(data.slice(i, i + STRIDE)));
          if (cur.length == 6) {
            out.push({
              c: [0, 1, 2].map(n => cur.reduce((s, v) => s + v[n], 0) / 6),
              a: cur.map(v => v[9]),
              n: cur[0].slice(3, 6),
              uv: cur.map(v => v.slice(6, 8)),
            });
            cur = [];
          }
        }
      }
      return out;
    };

    it('builds one camera-facing quad per puff, with its opacity, far to near', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      const [near, far, mid] = [cloud(1, 2), cloud(1, -5), cloud(1, -2, 1.5)];
      // Looking toward -z from [1, 1.6, 1].
      frame(rd, smoky(near, far, mid));
      const q = quads();
      expect(q.map(b => b.c[2])).toEqual([-5, -2, 2].map(z => expect.closeTo(z, 4)));
      expect(q.map(b => b.a[0])).toEqual([far, mid, near].map(p => expect.closeTo(fade(p), 5)));
      for (const b of q) {
        expect(b.a.every(a => a == b.a[0])).toBe(true);
        // The normal points back at the viewer, the corners are the unit square's.
        expect(b.n).toEqual([-0, -0, 1].map(n => expect.closeTo(n, 5)));
        expect(new Set(b.uv.map(String))).toEqual(new Set(['-1,-1', '1,-1', '1,1', '-1,1']));
      }
    });

    it('turns the quads with the camera, and sizes them with the puff', () => {
      const rd = createRenderer(canvas, compile(ROOM));
      const fx = smoky(cloud(1, -4));
      rd.frame([1, 1.6, 1], 0, 0, [], new Map(), fx, [], [], [], []);
      const width = () => {
        const data = calls.filter(c => c[0] == 'bufferSubData').at(-1)![3] as Float32Array;
        const xs = Array.from({ length: data.length / STRIDE }, (_, i) => i)
          .filter(i => data[i * STRIDE + 8] == -3)
          .map(i => data[i * STRIDE]);
        return Math.max(...xs) - Math.min(...xs);
      };
      expect(quads()[0].n[2]).toBeCloseTo(1);
      expect(width()).toBeCloseTo(2 * 1.6 * puff(fx.smoke[0]), 4);
      calls.length = 0;
      rd.frame([1, 1.6, 1], Math.PI / 2, 0, [], new Map(), fx, [], [], [], []);
      expect(quads()[0].n).toEqual([1, 0, 0].map(n => expect.closeTo(n, 5)));
      calls.length = 0;
      const big = smoky({ ...cloud(1, -4), r: 0.6 });
      rd.frame([1, 1.6, 1], 0, 0, [], new Map(), big, [], [], [], []);
      expect(width()).toBeCloseTo(2 * 1.6 * puff(big.smoke[0]), 4);
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

  describe('view model and particles', () => {
    /** What the last frame wrote after the level: the dynamic tail, as vertices of STRIDE floats. */
    const tail = () =>
      calls.filter(c => c[0] == 'bufferSubData' && c[2] != 0).at(-1)?.[3] as Float32Array;
    const vertex = (v: Float32Array, i: number) =>
      Array.from(v.slice(i * STRIDE, (i + 1) * STRIDE));
    const NEAR = 4158;
    const STILL = 576 + 924 + 66 + 144;
    const room = (fx = createEffects(), lights = [] as Light[]) => {
      const rd = createRenderer(canvas, compile(ROOM));
      frame(rd, fx, [], lights);
      return tail();
    };
    const extent = (v: Float32Array, from: number, n: number, axis: number) => {
      const xs = Array.from({ length: n }, (_, i) => v[(from + i) * STRIDE + axis]);
      return [Math.min(...xs), Math.max(...xs)];
    };

    it('draws the chaingun with 4158 vertices, and the flash on top of them', () => {
      room();
      expect(draws()[1][1]).toBe(NEAR);
      calls.length = 0;
      const fx = createEffects();
      fx.flash = 0.05;
      room(fx);
      expect(draws()[1][1]).toBe(NEAR + 3 * 36);
    });

    it('shines the gun like metal, and the barrels and clamps turn with the spin, the rest not', () => {
      const [a, b] = [0, 1.2].map(spin => {
        calls.length = 0;
        const fx = createEffects();
        fx.spin = spin;
        return room(fx);
      });
      const [ga, gb] = [a, b].map(v => v.length / STRIDE - NEAR);
      // The gun is the end of the tail.
      expect([ga, gb]).toEqual([0, 0]);
      for (let i = 0; i < NEAR; i++) {
        const same = vertex(a, i).every((x, k) => Math.abs(x - vertex(b, i)[k]) < 1e-6);
        if (i < STILL) {
          expect(same).toBe(true);
        }
      }
      let moved = 0;
      for (let i = STILL; i < NEAR; i++) {
        moved += +(vertex(a, i)[0] != vertex(b, i)[0] || vertex(a, i)[1] != vertex(b, i)[1]);
      }
      expect(moved).toBeGreaterThan(2000);
      // The parts that spin are all there is behind the still ones: barrels and clamps.
      expect(NEAR - STILL).toBe(1800 + 648);
      const layers = new Set(Array.from({ length: NEAR }, (_, i) => vertex(a, i)[8]));
      expect([...layers].sort((a, b) => a - b)).toEqual([-1, METAL]);
    });

    it('draws a spark as a streak from its head back along its velocity, as long as the speed says', () => {
      const lengths = [5, 10].map(speed => {
        const fx = createEffects();
        fx.sparks.push({ p: [2, 1, 2], v: [0, 0, -speed], life: 1, c: [1, 0.5, 0.2] });
        calls.length = 0;
        const v = room(fx);
        const [z0, z1] = extent(v, 0, 36, 2);
        // The head is at the spark, the tail a streak behind it.
        expect(z0).toBeCloseTo(2);
        return z1 - z0;
      });
      expect(lengths[0]).toBeCloseTo(5 * TRAIL);
      expect(lengths[1]).toBeCloseTo(2 * lengths[0]);
    });

    it('lights the head of a streak and dims its tail, unlit', () => {
      const fx = createEffects();
      fx.sparks.push({ p: [2, 1, 2], v: [0, 0, -10], life: 1, c: [1, 0.5, 0.2] });
      const v = room(fx);
      const head = Array.from({ length: 36 }, (_, i) => vertex(v, i)).filter(x => x[2] < 2.01);
      const back = Array.from({ length: 36 }, (_, i) => vertex(v, i)).filter(x => x[2] > 2.39);
      expect(head.length).toBeGreaterThan(5);
      expect(back.length).toBeGreaterThan(5);
      for (const x of head) {
        expect([x[6], x[7], x[9], x[8]]).toEqual([1, 0.5, expect.closeTo(0.2), -2]);
      }
      for (const x of back) {
        expect(x[6]).toBeCloseTo(0.25);
        expect(x[8]).toBe(-2);
      }
    });

    it('streaks a spark that falls straight down, and one that does not move', () => {
      const fx = createEffects();
      fx.sparks.push(
        { p: [2, 1, 2], v: [0, -8, 0], life: 1 },
        { p: [3, 1, 3], v: [0, 0, 0], life: 1 },
      );
      const v = room(fx);
      const [y0, y1] = extent(v, 0, 36, 1);
      expect(y0).toBeCloseTo(1);
      expect(y1).toBeCloseTo(1 + 8 * TRAIL);
      // At rest it is a short bar, standing, 4 cm long.
      const [s0, s1] = extent(v, 36, 36, 1);
      expect([s0, s1]).toEqual([expect.closeTo(0.96), expect.closeTo(1)]);
      expect(v.every(Number.isFinite)).toBe(true);
    });

    it('draws each live casing as a brass bar that shines, and none for a free slot', () => {
      const fx = createEffects();
      const empty = room(fx).length;
      calls.length = 0;
      const c = fx.casings[3];
      Object.assign(c, { p: [2, 0.01, 2], yaw: 0, tilt: 0, size: 0.01, life: 2, rest: true });
      const v = room(fx);
      expect(v.length - empty).toBe(36 * STRIDE);
      const [z0, z1] = extent(v, 0, 36, 2);
      expect(z1 - z0).toBeCloseTo(2 * 2.8 * 0.01);
      const [x0, x1] = extent(v, 0, 36, 0);
      expect(x1 - x0).toBeCloseTo(0.02);
      expect(vertex(v, 0)[8]).toBe(METAL);
      expect(vertex(v, 0)[6]).toBeGreaterThan(vertex(v, 0)[9] * 3);
    });

    it('stands a tumbling casing on end, and shrinks it over its last half second', () => {
      const fx = createEffects();
      Object.assign(fx.casings[0], {
        p: [2, 1, 2],
        yaw: 0,
        tilt: Math.PI / 2,
        size: 0.01,
        life: 2,
      });
      const [y0, y1] = extent(room(fx), 0, 36, 1);
      expect(y1 - y0).toBeCloseTo(0.056);
      calls.length = 0;
      fx.casings[0].life = 0.25;
      const [z0, z1] = extent(room(fx), 0, 36, 1);
      expect(z1 - z0).toBeCloseTo(0.028);
    });

    it('draws a blot of two slabs across each other for each splat, and shrinks it over its last second', () => {
      const fx = createEffects();
      fx.splats.push({ p: [2, 0.004, 2], r: 0.2, yaw: 0, life: 6 });
      const v = room(fx);
      expect(v.length / STRIDE).toBe(NEAR + 72);
      const [x0, x1] = extent(v, 0, 36, 0);
      expect(x1 - x0).toBeCloseTo(0.4);
      expect(extent(v, 0, 72, 1)).toEqual([expect.closeTo(0.002), expect.closeTo(0.006)]);
      // The second slab is turned by an eighth of a turn.
      const [z0, z1] = extent(v, 36, 36, 2);
      expect(z1 - z0).toBeGreaterThan(0.3);
      expect(vertex(v, 0).slice(6, 10)).toEqual([
        expect.closeTo(0.3),
        expect.closeTo(0.03),
        -1,
        expect.closeTo(0.03),
      ]);
      calls.length = 0;
      fx.splats[0].life = 0.5;
      const [y0, y1] = extent(room(fx), 0, 36, 0);
      expect(y1 - y0).toBeCloseTo(0.2);
    });

    it('draws a gib with its own half sizes, and shrinks all three over its last half second', () => {
      const fx = createEffects();
      fx.gibs.push({
        p: [2, 0.5, 2],
        v: [0, 0, 0],
        yaw: 0,
        half: [0.1, 0.02, 0.05],
        size: 0.02,
        c: [0.5, 0.1, 0.1],
        life: 5,
        floor: 0,
        rest: true,
        gore: false,
      });
      const v = room(fx);
      const size = (w: Float32Array) =>
        [0, 1, 2].map(a => extent(w, 0, 36, a)).map(([lo, hi]) => hi - lo);
      expect(size(v)).toEqual([expect.closeTo(0.2), expect.closeTo(0.04), expect.closeTo(0.1)]);
      calls.length = 0;
      fx.gibs[0].life = 0.25;
      expect(size(room(fx))).toEqual([
        expect.closeTo(0.1),
        expect.closeTo(0.02),
        expect.closeTo(0.05),
      ]);
    });

    it('keeps casings, splats and streaks out of the depth passes', () => {
      const spot = (): Light => ({
        kind: LIGHT.SPOT,
        p: [2, 1.6, 2],
        d: [1, 0, 0],
        cone: 0.9,
        range: 10,
        color: [1, 1, 1],
        shadow: true,
      });
      room(createEffects(), [spot()]);
      const [depth] = draws();
      calls.length = 0;
      const fx = createEffects();
      Object.assign(fx.casings[0], { p: [2, 0.5, 2], size: 0.01, life: 2 });
      fx.splats.push({ p: [2, 0.004, 2], r: 0.2, yaw: 0, life: 6 });
      fx.sparks.push({ p: [2, 1, 2], v: [0, 0, -5], life: 1 });
      room(fx, [spot()]);
      const [d2, w2] = draws();
      expect(d2[1]).toBe(depth[1]);
      expect(w2[1]).toBe(depth[1] + 36 + 72 + 36);
    });
  });
});
