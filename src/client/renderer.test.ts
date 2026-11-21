// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STILL, spawn } from '../shared/physics';
import { ROLE } from '../shared/kit';
import { TEX } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { build } from '../shared/world';
import type { Brush, WorldDef } from '../shared/world';
import { createEffects } from './effects';
import { LIGHT } from './lights';
import type { Light } from './lights';
import { STRIDE } from './mesh';
import { filled } from './store';
import { LAYERS } from './textures';
import { PORTRAIT, MAX_PIXELS, SHADOW, backing, createRenderer, scenery } from './render';
import type * as Traffic from './traffic';
import { duo } from '../../test/teams';
import { Verts } from './verts';

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
  /**
   * The draws of the frame's own vertices, or with `kept` the others (store.ts's pieces): those are
   * drawn with a turn or a place in R, or posed by the shader (Sm).
   */
  const draws = (kept = false) => {
    const out: [number, number][] = [];
    let [still, posed, next] = [true, false, false];
    for (const c of calls) {
      const at = (c[1] as { u?: string } | undefined)?.u;
      if (c[0] == 'uniform4fv' && at == 'R') {
        still = (c[2] as number[]).join() == '0,0,0,1,0,0,0,1';
      } else if (c[0] == 'uniform1i' && at == 'Sm') {
        posed = c[2] != 0;
      } else if (c[0] == 'drawArrays' && c[3] != 3 && (still && !posed) != kept) {
        // The map and what moves on it are two programs (fragOf()): a range drawn on with nothing
        // drawn or cleared between is the same range.
        const last = out[out.length - 1];
        if (next && last[0] + last[1] == c[2]) {
          last[1] += c[3] as number;
        } else {
          out.push([c[2], c[3]] as [number, number]);
        }
        next = true;
      } else if (c[0] == 'drawArrays' || c[0] == 'clear') {
        next = false;
      }
    }
    return out;
  };
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
    expect(Number(rows[1])).toBe(LAYERS + 3);
    expect(rows[2].match(/vec2\(/g)).toHaveLength(LAYERS + 3);
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

  it('does not build Hunter outfit meshes when the first Hunter comes close', () => {
    const rd = createRenderer(canvas, ROOM);
    const p = { ...spawn(1, ROOM, 0, 0), ...STILL, ammo: -1 };
    const eye: [number, number, number] = [p.x, p.y + 1.6, p.z + 2];
    const draw = () => rd.frame(eye, 0, 0, [p], new Map(), createEffects(), []);
    draw(); // Warm the regular runner's pieces shared with the Hunter.
    const regular = filled;
    rd.wear(new Map(), new Map([[p.id, { role: ROLE.HUNTER }]]));
    const before = filled;
    expect(before).toBeGreaterThan(regular);
    draw();
    expect(filled).toBe(before);
  });

  it('draws the map and the sky with its program, what moves with the bodies’, each value of a uniform sent to both', () => {
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
    const linked = calls.length;
    rd.frame([1, 1.6, 1], 0, 0, [p], new Map(), createEffects(), []);
    // Which program each colour-pass draw ran in, by the `#define` its fragment shader was given.
    const src = new Map<unknown, string>();
    const kind = new Map<unknown, string>();
    for (const c of calls.slice(0, linked)) {
      if (c[0] == 'shaderSource') {
        src.set(c[1], String(c[2]));
      } else if (c[0] == 'attachShader' && src.get(c[2])?.includes('sampler2DArray')) {
        kind.set(c[1], src.get(c[2])!.split('\n')[1]);
      }
    }
    expect([...kind.values()]).toEqual(['#define LAND', '#define FLESH']);
    // The map's program is in use when a frame starts.
    let [on, colour] = [
      kind.get(
        calls
          .slice(0, linked)
          .filter(c => c[0] == 'useProgram')
          .at(-1)![1],
      )!,
      false,
    ];
    const ran: [string, number, number][] = [];
    for (const c of calls.slice(linked)) {
      if (c[0] == 'useProgram') {
        on = kind.get(c[1]) ?? '';
      } else if (c[0] == 'viewport') {
        colour = c[3] == 320;
      } else if (c[0] == 'drawArrays' && colour && on) {
        ran.push([on.slice(8), c[2] as number, c[3] as number]);
      }
    }
    expect(ran[0]).toEqual(['LAND', 0, FLOOR_VERTS]);
    expect(ran.filter(r => r[0] == 'FLESH').length).toBeGreaterThan(1);
    expect(ran.find(r => r[0] == 'FLESH' && r[1] == FLOOR_VERTS)![2]).toBeGreaterThan(0);
    // The sky, last, with the map's.
    expect(ran.at(-1)).toEqual(['LAND', 0, 3]);
    // The eye reaches each program before its first draw.
    const eye = calls
      .slice(linked)
      .filter(c => c[0] == 'uniform3fv' && (c[1] as { u: string }).u == 'E');
    expect(eye.length).toBeGreaterThanOrEqual(2);
  });

  describe('body', () => {
    const SOLID = 36 * STRIDE;
    const body = (
      draw = vi.fn((out: number[]) => void out.push(...new Array<number>(SOLID).fill(0))),
    ) => ({
      id: 7,
      update: vi.fn(),
      wear: vi.fn(),
      pose: vi.fn(),
      muzzle: () => [0, 0, 0] as [number, number, number],
      spun: () => 0,
      parried: vi.fn(),
      steps: 0,
      phase: 0,
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
        expect.any(Verts),
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

  describe('traffic', () => {
    afterEach(() => {
      cars.on = false;
    });

    it('draws the cars in view as pieces of the store, in the shadow and the scene alike, and none when it is off', () => {
      const rd = createRenderer(canvas, ROOM);
      frame(rd);
      expect(draws()[1][1]).toBe(FLOOR_VERTS);
      expect(draws(true)).toEqual([]);
      calls.length = 0;
      cars.on = true;
      vi.spyOn(Date, 'now').mockReturnValue(161e3);
      rd.frame([1, 100, 1], 0, -Math.PI / 2, [], new Map(), createEffects(), []);
      // Not in the frame's own vertices: each car is a piece (store.ts), in whole triangles.
      const [depth, world] = draws();
      expect(depth[1]).toBe(FLOOR_VERTS);
      expect(world[1]).toBe(depth[1]);
      const pieces = draws(true);
      expect(pieces.length).toBeGreaterThan(0);
      expect(pieces.slice(0, pieces.length / 2)).toEqual(pieces.slice(pieces.length / 2));
      expect(pieces.every(([, n]) => n % 3 == 0)).toBe(true);
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
      const binds = calls
        .filter(c => c[0] == 'bindTexture' && c[1] == K('TEXTURE_2D_ARRAY'))
        .map(c => c[2]);
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

describe('Renderer.portrait, the picture of a character card', () => {
  const calls: Call[] = [];
  let canvas: HTMLCanvasElement;
  const size = (w: number, h: number) => {
    Object.defineProperty(canvas, 'clientWidth', { value: w, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: h, configurable: true });
  };
  const me: PlayerState = { ...STILL, ...spawn(0, ROOM, 0, 0), id: 4 };
  beforeEach(() => {
    calls.length = 0;
    canvas = document.createElement('canvas');
    size(320, 200);
    vi.stubGlobal('devicePixelRatio', 1);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
      kind: string,
    ) {
      return kind == 'webgl2' ? fakeGl(calls, () => ({})) : { drawImage: draw };
    } as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  const draw = vi.fn();
  const card = () => Object.assign(document.createElement('canvas'), { width: 300, height: 400 });

  it('draws the player alone, far over the map, and copies the middle of the frame into the card', () => {
    const rd = createRenderer(canvas, ROOM);
    draw.mockClear();
    calls.length = 0;
    const into = card();
    expect(rd.portrait(into, me, 1, '#e23b3b')).toBe(true);
    // The scene was drawn with a runner in it: more than the map's vertices.
    const scenes = calls.filter(c => c[0] == 'drawArrays' && (c[3] as number) > FLOOR_VERTS);
    expect(scenes.length).toBeGreaterThan(0);
    // The eye is up there with him, not on the map.
    const eye = calls.filter(c => c[0] == 'uniform3fv' && (c[1] as { u: string }).u == 'E').pop()!;
    expect((eye[2] as number[])[1]).toBeCloseTo(PORTRAIT.y + PORTRAIT.eye);
    // A 3:4 card out of a 320 by 200 frame: the 150 pixels in the middle, the whole height.
    expect(draw).toHaveBeenCalledExactlyOnceWith(canvas, 85, 0, 150, 200, 0, 0, 300, 400);
  });

  it('backs the camera off for the taller Hunter portrait', () => {
    const rd = createRenderer(canvas, ROOM);
    calls.length = 0;
    expect(rd.portrait(card(), me, 0, '#e23b3b', { role: ROLE.HUNTER })).toBe(true);
    const eye = calls.filter(c => c[0] == 'uniform3fv' && (c[1] as { u: string }).u == 'E').pop()!;
    expect((eye[2] as number[])[1]).toBeCloseTo(PORTRAIT.y + 1.19);
  });

  it('leaves the runners of the match as they were', () => {
    const rd = createRenderer(canvas, ROOM);
    const other: PlayerState = { ...me, id: 1 };
    rd.frame([1, 1.6, 1], 0, 0, [other], new Map(), createEffects(), []);
    expect(rd.steps(1)).toBeDefined();
    rd.portrait(card(), me, 0, '#e23b3b');
    expect(rd.steps(1)).toBeDefined();
    // The model was a runner of the picture only.
    expect(rd.steps(4)).toBeUndefined();
  });

  it('draws nothing before the canvas has a size', () => {
    size(320, 0);
    const rd = createRenderer(canvas, ROOM);
    draw.mockClear();
    expect(rd.portrait(card(), me, 0, '#e23b3b')).toBe(false);
    expect(draw).not.toHaveBeenCalled();
  });
});
