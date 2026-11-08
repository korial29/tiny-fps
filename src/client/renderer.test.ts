// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STILL } from '../shared/physics';
import { TEX } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { build } from '../shared/world';
import type { Brush, WorldDef } from '../shared/world';
import { createEffects } from './effects';
import { LIGHT } from './lights';
import type { Light } from './lights';
import { SHINE, STRIDE } from './mesh';
import { LAYERS } from './textures';
import {
  FOG_LAYER,
  FOG_RISE,
  HAZE,
  MAX_PIXELS,
  MAX_TINTS,
  SHADOW,
  backing,
  city,
  createRenderer,
  daylight,
  fogOf,
  fogRef,
  palette,
  scenery,
  sunProj,
} from './render';
import type * as Traffic from './traffic';
import { duo } from '../../test/teams';

// The traffic is off unless a test turns it on: the draws below are counted to the vertex.
const cars = vi.hoisted(() => ({ on: false }));
vi.mock('./traffic', async importOriginal => {
  const real = await importOriginal<typeof Traffic>();
  return {
    ...real,
    traffic: (def: WorldDef) => {
      const drive = real.traffic(def);
      return (...args: Parameters<typeof drive>) => cars.on && drive(...args);
    },
  };
});

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
            return name == 'getExtension'
              ? ext()
              : name == 'getUniformLocation'
                ? { u: args[1] }
                : {};
          },
  });

const SUN = {
  dir: [0.6, 0.6, 0.53] as [number, number, number],
  color: [2.5, 2.3, 2] as [number, number, number],
};
/** What the renderer makes of it: a unit direction. */
const SUN_DIR = SUN.dir.map(v => v / Math.hypot(...SUN.dir)) as [number, number, number];
const SKY: WorldDef['sky'] = [
  [0.2, 0.4, 0.9],
  [0.7, 0.8, 0.9],
];
const brush = (over: Partial<Brush> = {}): Brush => ({
  min: [0, -10, 0],
  max: [4, 0, 4],
  top: TEX.TILE,
  side: TEX.BRICK,
  ...over,
});
const worldOf = (over: Partial<WorldDef> = {}) =>
  build({
    brushes: [brush()],
    teams: duo([[1, 0, 1, 0]]),
    floor: -20,
    sun: SUN,
    sky: SKY,
    ...over,
  });
const ROOM = worldOf();
/** The brush, the distant city, the zones: everything the renderer draws of the map. */
const FLOOR_VERTS = scenery(ROOM).length / STRIDE;

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
    lights = [] as Light[],
  ) => rd.frame([1, 1.6, 1], 0, 0, [], new Map(), fx, lights);

  it('builds a fragment shader with one specular row per layer and no stray JS values', () => {
    createRenderer(canvas, ROOM);
    const src = calls.filter(c => c[0] == 'shaderSource').map(c => String(c[2]));
    const frag = src.find(s => s.includes('sampler2DArray'))!;
    const rows = frag.match(/const vec2 SP\[(\d+)\]=vec2\[\]\((.*)\);/)!;
    expect(Number(rows[1])).toBe(LAYERS + 2);
    expect(rows[2].match(/vec2\(/g)).toHaveLength(LAYERS + 2);
    expect(frag).not.toMatch(/undefined|NaN|\[object/);
  });

  describe('post-processing', () => {
    const named = (name: string) => calls.filter(c => c[0] == name);
    const FLAT = K('TEXTURE_2D');

    it('asks for a context with no antialiasing and no depth: the scene target has both', () => {
      createRenderer(canvas, ROOM);
      expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledWith('webgl2', {
        antialias: false,
        depth: false,
      });
    });

    it('draws the scene into the multisampled target, resolves it, then draws the post passes, the last on the canvas', () => {
      const rd = createRenderer(canvas, ROOM);
      calls.length = 0;
      frame(rd);
      const blit = calls.findIndex(c => c[0] == 'blitFramebuffer');
      const post = calls.flatMap((c, i) =>
        i > blit && c[0] == 'drawArrays' && c[3] == 3 ? [i] : [],
      );
      expect(blit).toBeGreaterThan(0);
      expect(post.length).toBeGreaterThan(0);
      expect(post[0]).toBeGreaterThan(blit);
      // The scene: cleared and drawn into a target of its own, before the resolve, after the sun's
      // depth pass, the sky and the world.
      const scene = calls.slice(0, blit);
      expect(scene.filter(c => c[0] == 'drawArrays')).toHaveLength(3);
      const target = scene
        .filter(c => c[0] == 'bindFramebuffer' && c[1] == K('FRAMEBUFFER'))
        .at(-1)!;
      expect(target[2]).not.toBeNull();
      expect(scene.indexOf(target)).toBeLessThan(scene.map(c => c[0]).lastIndexOf('clear'));
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
      let blitted = false;
      const out: {
        to: unknown;
        size: number[];
        mode: number;
        step: number[];
        from: unknown[];
      }[] = [];
      for (const [name, ...a] of calls) {
        if (name == 'blitFramebuffer') {
          blitted = true;
        } else if (name == 'clear') {
          blitted = false;
        } else if (name == 'bindFramebuffer') {
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
        } else if (name == 'drawArrays' && a[2] == 3 && blitted) {
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

    it('gives the final pass the speed lines of the effects, and only it', () => {
      const rd = createRenderer(canvas, ROOM);
      const fx = createEffects();
      fx.lines = 0.7;
      calls.length = 0;
      frame(rd, fx);
      const lines = calls.filter(c => (c[1] as { u?: string } | undefined)?.u == 'L');
      expect(lines.map(c => c[2])).toEqual([0.7]);
      // Set before the last pass of the frame, which draws on the canvas.
      const last = calls.map(c => c[0] == 'drawArrays' && c[3] == 3).lastIndexOf(true);
      expect(calls.indexOf(lines[0])).toBeLessThan(last);
      expect(calls.indexOf(lines[0])).toBeGreaterThan(
        calls.map(c => c[0]).lastIndexOf('blitFramebuffer'),
      );
    });

    it('blooms the bright parts at half size, then blurs them at a quarter and an eighth', () => {
      const rd = createRenderer(canvas, ROOM);
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
      const rd = createRenderer(canvas, ROOM);
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
      const rd = createRenderer(canvas, ROOM);
      frame(rd);
      const last = calls.filter(c => c[0] == 'bindTexture' && c[1] == FLAT).slice(-3);
      expect(last.map(c => c[2])).toEqual([null, null, null]);
      const units = calls.filter(c => c[0] == 'activeTexture').slice(-4);
      expect(units.map(c => (c[1] as number) - K('TEXTURE0'))).toEqual([3, 2, 1, 0]);
    });

    it('allocates the targets at the backing size, 16-bit float with the extension', () => {
      createRenderer(canvas, ROOM);
      expect(named('getExtension').map(c => c[1])).toContain('EXT_color_buffer_float');
      expect(named('texStorage2D')[0]).toEqual(['texStorage2D', FLAT, 1, K('RGBA16F'), 320, 200]);
      expect(named('renderbufferStorageMultisample').map(c => c.slice(2))).toEqual([
        [4, K('RGBA16F'), 320, 200],
        [4, K('DEPTH_COMPONENT24'), 320, 200],
      ]);
    });

    it('falls back to 8 bits without the extension', () => {
      float = null;
      createRenderer(canvas, ROOM);
      expect(named('texStorage2D').every(c => c[3] == K('RGBA8'))).toBe(true);
      expect(named('renderbufferStorageMultisample')[0][3]).toBe(K('RGBA8'));
    });

    it('scales the targets with the pixel ratio and the pixel budget', () => {
      vi.stubGlobal('devicePixelRatio', 2);
      resize(1920, 1080);
      createRenderer(canvas, ROOM);
      const [w, h] = backing(1920, 1080, 2);
      expect(named('texStorage2D')[0].slice(4)).toEqual([w, h]);
      expect(w * h).toBeLessThanOrEqual(MAX_PIXELS);
    });

    it('reallocates the targets, and frees the old ones, when the size changes', () => {
      const rd = createRenderer(canvas, ROOM);
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
      const rd = createRenderer(canvas, ROOM);
      expect(named('texStorage2D')).toHaveLength(0);
      frame(rd);
      expect(named('texStorage2D')).toHaveLength(0);
      resize(320, 200);
      frame(rd);
      expect(named('texStorage2D').length).toBeGreaterThan(0);
    });

    it('rebuilds the post program and the targets when the context is restored', () => {
      const rd = createRenderer(canvas, ROOM);
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

  it('draws the sun depth pass, the sky and the world, and nothing blended', () => {
    const rd = createRenderer(canvas, ROOM);
    frame(rd);
    expect(draws()).toEqual([
      [0, FLOOR_VERTS],
      [0, FLOOR_VERTS],
    ]);
    expect(calls.filter(c => c[0] == 'enable').map(c => c[1])).not.toContain(K('BLEND'));
    expect(calls.filter(c => c[0] == 'depthMask')).toHaveLength(0);
  });

  describe('body', () => {
    const SOLID = 36 * STRIDE;
    const body = (
      draw = vi.fn((out: number[]) => void out.push(...new Array<number>(SOLID).fill(0))),
    ) => ({
      id: 7,
      update: vi.fn(),
      pose: vi.fn(),
      muzzle: () => [0, 0, 0] as [number, number, number],
      spun: () => 0,
      aim: vi.fn(),
      draw,
    });

    it('is drawn last, over a cleared depth, and casts no shadow', () => {
      const rd = createRenderer(canvas, ROOM);
      const b = body();
      const fx = createEffects();
      rd.frame([1, 1.6, 1], 0.5, -0.2, [], new Map([[7, '#ff0000']]), fx, [], b);
      // In the colour of the own player's team.
      expect(b.draw).toHaveBeenCalledWith(
        expect.any(Array),
        [1, 1.6, 1],
        0.5,
        -0.2,
        fx.roll,
        [1, 0, 0],
      );
      expect(draws()).toEqual([
        [0, FLOOR_VERTS],
        [0, FLOOR_VERTS],
        [FLOOR_VERTS, 36],
      ]);
      const scene = calls.flatMap((c, i) => (c[0] == 'drawArrays' && c[3] != 3 ? [i] : []));
      const clears = calls.flatMap((c, i) =>
        c[0] == 'clear' && c[1] == K('DEPTH_BUFFER_BIT') ? [i] : [],
      );
      // The world, then a depth clear, then the body.
      expect(clears.at(-1)).toBeGreaterThan(scene[1]);
      expect(clears.at(-1)).toBeLessThan(scene[2]);
    });

    it('is not drawn, and costs no clear, when it has nothing to show', () => {
      const rd = createRenderer(canvas, ROOM);
      rd.frame([1, 1.6, 1], 0, 0, [], new Map(), createEffects(), [], body(vi.fn()));
      const depthClears = calls.filter(c => c[0] == 'clear' && c[1] == K('DEPTH_BUFFER_BIT'));
      expect(draws()).toHaveLength(2);
      // The sun's pass and the scene's own.
      expect(depthClears).toHaveLength(1);
    });
  });

  /** The calls that set the uniform `name`. */
  const set = (name: string) =>
    calls.filter(c => (c[1] as { u?: string } | undefined)?.u == name && /^uniform/.test(c[0]));

  describe('sky', () => {
    const sky = () =>
      calls.findIndex(c => c[0] == 'drawArrays' && c[3] == 3 && c[1] == K('TRIANGLES'));

    it('is a fullscreen triangle at depth 1, drawn first in the scene, with its own mode uniform', () => {
      const rd = createRenderer(canvas, ROOM);
      const vert = calls
        .filter(c => c[0] == 'shaderSource')
        .map(c => String(c[2]))
        .find(src => src.includes('J[3]'))!;
      expect(vert).toContain('gl_Position=vec4(q,1,1)');
      calls.length = 0;
      frame(rd);
      const clear = calls.map(c => c[0]).lastIndexOf('clear');
      const world = calls.findIndex(
        c => c[0] == 'drawArrays' && c[3] == FLOOR_VERTS && calls.indexOf(c) > clear,
      );
      expect(sky()).toBeGreaterThan(clear);
      expect(sky()).toBeLessThan(world);
      // Between the clear and the sky, nothing is drawn; the mode is on for the sky and off after.
      expect(calls.slice(clear, sky()).some(c => c[0] == 'drawArrays')).toBe(false);
      const mode = set('Y').filter(c => c[0] == 'uniform1f' && c.length == 3);
      expect(mode.slice(0, 2).map(c => c[2])).toEqual([1, 0]);
      expect(calls.indexOf(mode[0])).toBeLessThan(sky());
      expect(calls.indexOf(mode[1])).toBeGreaterThan(sky());
      expect(calls.indexOf(mode[1])).toBeLessThan(world);
    });

    it('passes the depth test at the cleared depth, so it needs no depth write tricks', () => {
      createRenderer(canvas, ROOM);
      expect(calls.filter(c => c[0] == 'depthFunc').at(-1)![1]).toBe(K('LEQUAL'));
    });

    it('gets the view rays of the camera: right and up scaled by the field of view, then forward', () => {
      const rd = createRenderer(canvas, ROOM);
      rd.frame([0, 1.6, 0], 0, 0, [], new Map(), createEffects(), []);
      const rays = Array.from(set('J').at(-1)![2] as number[]);
      const t = Math.tan((70 * Math.PI) / 360);
      [t * 1.6, 0, 0, 0, t, 0, 0, 0, -1].forEach((v, i) => expect(rays[i]).toBeCloseTo(v, 4));
    });

    it('widens with the field of view of the effects: the rays and the projection', () => {
      const rd = createRenderer(canvas, ROOM);
      const fx = createEffects();
      fx.fov = 10;
      rd.frame([0, 1.6, 0], 0, 0, [], new Map(), fx, []);
      const rays = Array.from(set('J').at(-1)![2] as number[]);
      expect(rays[4]).toBeCloseTo(Math.tan((80 * Math.PI) / 360), 4);
      // The matrix row for y is 1 / the same tangent.
      expect(Array.from(set('m').at(-1)![3] as number[])[5]).toBeCloseTo(1 / rays[4], 4);
    });

    it('is not drawn into the shadow map', () => {
      const rd = createRenderer(canvas, ROOM);
      frame(rd);
      const depth = calls.findIndex(c => c[0] == 'framebufferTextureLayer');
      expect(set('Y').every(c => calls.indexOf(c) > depth)).toBe(true);
      expect(set('Z')[0][2]).toBe(-1);
    });
  });

  describe('sun', () => {
    const layers = () => calls.filter(c => c[0] == 'framebufferTextureLayer');

    it('draws one depth pass per frame, into layer 0, with the sun matrix around the eye', () => {
      const rd = createRenderer(canvas, ROOM);
      frame(rd);
      expect(layers().map(c => c[5])).toEqual([0]);
      const pass = calls.findIndex(c => c[0] == 'framebufferTextureLayer');
      const m = calls.slice(pass).find(c => (c[1] as { u?: string }).u == 'm')!;
      expect(Array.from(m[3] as Float32Array)).toEqual(Array.from(sunProj(SUN_DIR, [1, 1.6, 1])));
      expect(calls.find(c => c[0] == 'viewport')).toEqual(['viewport', 0, 0, SHADOW, SHADOW]);
      frame(rd);
      expect(layers()).toHaveLength(2);
    });

    it('moves with the eye, and the scene reads the same matrix', () => {
      const rd = createRenderer(canvas, ROOM);
      rd.frame([30, 1.6, -5], 0, 0, [], new Map(), createEffects(), []);
      const w = Array.from(set('W').at(-1)![3] as Float32Array);
      expect(w).toEqual(Array.from(sunProj(SUN_DIR, [30, 1.6, -5])));
    });

    it('is cast by the other players too, drawn after the brushes', () => {
      const rd = createRenderer(canvas, ROOM);
      const p: PlayerState = {
        id: 1,
        x: 2,
        y: 0,
        z: 2,
        vy: 0,
        yaw: 0,
        pitch: 0,
        ground: true,
        ...STILL,
      };
      rd.frame([1, 1.6, 1], 0, 0, [p], new Map(), createEffects(), []);
      const [depth, world] = draws();
      expect(depth[1]).toBeGreaterThan(FLOOR_VERTS);
      expect(depth[1]).toBe(world[1]);
    });

    it('is cast by the bases and the flags too, drawn with the brushes and before the other players', () => {
      const rd = createRenderer(canvas, ROOM);
      frame(rd);
      const [bare] = draws();
      expect(bare[1]).toBe(FLOOR_VERTS);
      calls.length = 0;
      rd.frame([1, 1.6, 1], 0, 0, [], new Map(), createEffects(), [], undefined, {
        bases: [
          [0, 0, 0],
          [4, 0, 4],
        ],
        flags: [{ team: 0, at: [0, 0, 0] }],
      });
      const [depth, world] = draws();
      // The base pads and rings, a pole and its cloth: a few hundred vertices more than the room.
      expect(depth[1]).toBeGreaterThan(FLOOR_VERTS + 300);
      expect(depth[1]).toBe(world[1]);
    });

    it('draws the racks and the health packs that are there with the other things, and they cast shadows', () => {
      const rd = createRenderer(canvas, ROOM);
      const bases: [number, number, number][] = [
        [0, 0, 0],
        [4, 0, 4],
      ];
      const scene = (
        racks: ([number, number, number] | undefined)[],
        packs: [number, number, number][],
      ) => {
        calls.length = 0;
        rd.frame([1, 1.6, 1], 0, 0, [], new Map(), createEffects(), [], undefined, {
          bases,
          flags: [],
          racks,
          packs,
        });
        return draws()[0][1] - FLOOR_VERTS;
      };
      // The two bases alone.
      const none = scene([undefined, undefined], []);
      const pack = scene([undefined, undefined], [[2, 0, 2]]) - none;
      const rack = scene([[1, 0, 1], undefined], []) - none;
      expect(pack).toBeGreaterThan(50);
      expect(rack).toBeGreaterThan(300);
      // An ammo pack is drawn with the others, and one more is one more.
      const ammoPack = (n: number) => {
        calls.length = 0;
        rd.frame([1, 1.6, 1], 0, 0, [], new Map(), createEffects(), [], undefined, {
          bases,
          flags: [],
          racks: [undefined, undefined],
          packs: [],
          ammo: Array.from({ length: n }, (_, i): [number, number, number] => [2, 0, 2 + i]),
        });
        return draws()[0][1] - FLOOR_VERTS - none;
      };
      expect(ammoPack(1)).toBeGreaterThan(100);
      expect(ammoPack(2)).toBe(2 * ammoPack(1));
      // Each one more is one more.
      expect(
        scene(
          [undefined, undefined],
          [
            [2, 0, 2],
            [3, 0, 3],
          ],
        ) - none,
      ).toBe(2 * pack);
      const [depth, world] = draws();
      expect(depth[1]).toBe(world[1]);
    });

    it('draws the plasma balls and flashes after everything that casts a shadow: lit by themselves, in the colour pass only', () => {
      const rd = createRenderer(canvas, ROOM);
      frame(rd);
      calls.length = 0;
      const draw = vi.fn((out: number[]) =>
        out.push(...Array.from({ length: 6 * STRIDE }, () => 0)),
      );
      rd.frame([1, 1.6, 1], 0, 0, [], new Map(), createEffects(), [], undefined, undefined, {
        flash: vi.fn(),
        burst: vi.fn(),
        orbs: vi.fn(),
        shock: vi.fn(),
        lightning: vi.fn(),
        charging: vi.fn(),
        crackle: vi.fn(),
        spit: vi.fn(),
        mount: vi.fn(),
        update: vi.fn(),
        draw,
        lights: () => [],
      });
      expect(draw).toHaveBeenCalledWith(expect.any(Array), [1, 1.6, 1]);
      const [depth, world] = draws();
      expect(depth[1]).toBe(FLOOR_VERTS);
      expect(world[1]).toBe(FLOOR_VERTS + 6);
    });

    it('uploads its direction and colour, and the daylight, with the world', () => {
      createRenderer(canvas, ROOM);
      expect(set('O').at(-1)![2]).toEqual(SUN_DIR);
      expect(set('X').at(-1)![2]).toEqual(SUN.color);
      expect(set('H').at(-1)![2]).toEqual(daylight(ROOM.def).flat());
    });

    it('has the shadow array a layer for the sun and one for each mapped light', () => {
      createRenderer(canvas, ROOM);
      const [storage] = calls.filter(c => c[0] == 'texStorage3D');
      expect(storage.slice(3)).toEqual([K('DEPTH_COMPONENT24'), SHADOW, SHADOW, 5]);
    });
  });

  describe('atmosphere', () => {
    const fogs = () => set('F').map(c => c[2] as number[]);
    const clear = () =>
      calls
        .filter(c => c[0] == 'clearColor')
        .at(-1)!
        .slice(1);

    it('has no fog when the world sets none, and clears with the horizon', () => {
      createRenderer(canvas, ROOM);
      expect(fogs().at(-1)).toEqual([...SKY[1], 0]);
      expect(clear()).toEqual([...SKY[1], 1]);
    });

    it('takes the fog density from the world, its colour pulled toward the horizon', () => {
      const fog: [number, number, number, number] = [0.5, 0.25, 0.125, 0.04];
      createRenderer(canvas, worldOf({ fog }));
      const got = fogs().at(-1)!;
      expect(got).toEqual(fogOf(worldOf({ fog }).def));
      expect(got[3]).toBe(0.04);
      for (const i of [0, 1, 2]) {
        expect(got[i]).toBeCloseTo(fog[i] + (SKY[1][i] - fog[i]) * HAZE);
      }
    });

    it('uploads the tint palette, white first and padded with white', () => {
      const tint: [number, number, number] = [0.5, 0.25, 1];
      const w = worldOf({ brushes: [brush({ tint })] });
      createRenderer(canvas, w);
      const pal = Array.from(set('G').at(-1)![2] as Float32Array);
      expect(pal).toHaveLength(MAX_TINTS * 3);
      expect(pal.slice(0, 6)).toEqual([1, 1, 1, ...tint]);
      // The caps of the distant towers follow, the rest is white.
      const used = palette(city(w)).flat().map(Math.fround);
      expect(used.length).toBeGreaterThan(6);
      expect(pal.slice(0, used.length)).toEqual(used);
      expect(pal.slice(used.length).every(v => v == 1)).toBe(true);
    });

    it('reflects the sky in the glass layer and in polished metal, and nowhere else', () => {
      createRenderer(canvas, ROOM);
      const frag = calls
        .filter(c => c[0] == 'shaderSource')
        .map(c => String(c[2]))
        .find(s => s.includes('sampler2DArray'))!;
      expect(frag).toContain(`abs(L-${TEX.GLASS}.)`);
      expect(frag).toContain(`abs(L-(${SHINE}))`);
      expect(frag).toMatch(/r=reflect\(-V,m\),k=K0\(r\)/);
      // The sky pass and the reflection are the one function.
      expect(frag.match(/K0\(/g)).toHaveLength(3);
    });

    it('declares the fog, palette and daylight uniforms in the shader', () => {
      createRenderer(canvas, ROOM);
      const frag = calls
        .filter(c => c[0] == 'shaderSource')
        .map(c => String(c[2]))
        .find(s => s.includes('sampler2DArray'))!;
      expect(frag).toContain(`G[${MAX_TINTS}]`);
      expect(frag).toContain('H[5]');
      expect(frag).not.toMatch(/undefined|NaN|\[object/);
    });

    it('sets the height of the fog layer to the lowest roof, and integrates the layer along the ray', () => {
      createRenderer(canvas, ROOM);
      const frag = calls
        .filter(c => c[0] == 'shaderSource')
        .map(c => String(c[2]))
        .find(s => s.includes('sampler2DArray'))!;
      expect(frag).toContain('uniform float U;');
      expect(frag).toContain(`${FOG_LAYER}*exp(${FOG_RISE}*(U-E.y))`);
      expect(set('U').map(c => c.slice(2))).toEqual([[fogRef(ROOM.def)]]);
    });
  });

  describe('traffic', () => {
    afterEach(() => {
      cars.on = false;
    });

    it('adds the cars in view to the dynamic vertices, before the beams and the body, and none when it is off', () => {
      const rd = createRenderer(canvas, ROOM);
      frame(rd);
      expect(draws()[1][1]).toBe(FLOOR_VERTS);
      calls.length = 0;
      cars.on = true;
      vi.spyOn(Date, 'now').mockReturnValue(161e3);
      rd.frame([1, 100, 1], 0, -Math.PI / 2, [], new Map(), createEffects(), []);
      const [depth, world] = draws();
      expect(depth[1]).toBeGreaterThan(FLOOR_VERTS);
      expect(world[1]).toBe(depth[1]);
      expect((depth[1] - FLOOR_VERTS) % 3).toBe(0);
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

    it('draws the sun pass alone, nothing more, for lights that cast nothing', () => {
      const rd = createRenderer(canvas, ROOM);
      frame(rd);
      expect(layers()).toEqual([0]);
      expect(draws()).toHaveLength(2);
      calls.length = 0;
      frame(rd, createEffects(), [spot(false), { ...spot(), kind: LIGHT.POINT }]);
      expect(layers()).toEqual([0]);
      expect(draws()).toHaveLength(2);
    });

    it('draws one depth pass per mapped light after the sun, into the next layer, before the scene', () => {
      const rd = createRenderer(canvas, ROOM);
      frame(rd, createEffects(), [spot(), spot(false), spot()]);
      expect(layers()).toEqual([0, 1, 2]);
      // Three depth passes, then the world.
      expect(draws()).toHaveLength(4);
      expect(calls.filter(c => c[0] == 'clear')).toHaveLength(3 + 1);
      const scene = calls.findIndex(c => c[0] == 'viewport' && c[3] == 320);
      const drawn = (a: Call[]) => a.filter(c => c[0] == 'drawArrays' && c[3] != 3).length;
      expect([drawn(calls.slice(0, scene)), drawn(calls.slice(scene))]).toEqual([3, 1]);
      expect(calls.find(c => c[0] == 'viewport')).toEqual(['viewport', 0, 0, SHADOW, SHADOW]);
      expect(calls.filter(c => c[0] == 'viewport').at(-1)).toEqual(['viewport', 0, 0, 320, 200]);
    });

    it('maps at most MAX_SHADOWS lights', () => {
      const rd = createRenderer(canvas, ROOM);
      frame(
        rd,
        createEffects(),
        Array.from({ length: 7 }, () => spot()),
      );
      expect(layers()).toEqual([0, 1, 2, 3, 4]);
    });

    it('unbinds the shadow map while writing it, and binds it back for the scene', () => {
      const rd = createRenderer(canvas, ROOM);
      calls.length = 0;
      frame(rd, createEffects(), [spot()]);
      const binds = calls.filter(c => c[0] == 'bindTexture').map(c => c[2]);
      expect(binds[0]).toBeNull();
      expect(binds[1]).not.toBeNull();
    });

    it('recreates the shadow map, the targets and their framebuffers when the context is restored', () => {
      const rd = createRenderer(canvas, ROOM);
      const count = (name: string) => calls.filter(c => c[0] == name).length;
      const made = count('createFramebuffer');
      expect(count('texStorage3D')).toBe(1);
      canvas.dispatchEvent(new Event('webglcontextlost'));
      calls.length = 0;
      frame(rd, createEffects(), [spot()]);
      expect(calls).toEqual([]);
      canvas.dispatchEvent(new Event('webglcontextrestored'));
      expect(count('texStorage3D')).toBe(1);
      expect(count('createFramebuffer')).toBe(made);
      frame(rd, createEffects(), [spot()]);
      expect(layers()).toEqual([0, 1]);
    });
  });
});
