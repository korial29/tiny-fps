// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STILL } from '../shared/physics';
import { TEX } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { build } from '../shared/world';
import type { Brush, WorldDef } from '../shared/world';
import { createEffects } from './effects';
import type { Light } from './lights';
import { STRIDE } from './mesh';
import { SHADOW, createRenderer, daylight, scenery, sunAt, sunProj } from './render';
import type * as Traffic from './traffic';
import { duo } from '../../test/teams';
import { Verts } from './verts';
import { record } from '../../test/draws';

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
            record(calls, [name, ...args], FLOOR_VERTS);
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

  /** The calls that set the uniform `name`. */
  const set = (name: string) =>
    calls.filter(c => (c[1] as { u?: string } | undefined)?.u == name && /^uniform/.test(c[0]));

  describe('sky', () => {
    const sky = () =>
      calls.findIndex(c => c[0] == 'drawArrays' && c[3] == 3 && c[1] == K('TRIANGLES'));

    it('is a fullscreen triangle at depth 1, drawn after the world (shaded only where nothing is in front), with its own mode uniform', () => {
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
      expect(world).toBeGreaterThan(clear);
      expect(sky()).toBeGreaterThan(world);
      // The mode is on for the sky alone: set after the world, off right after the sky.
      const mode = set('Y').filter(c => c[0] == 'uniform1f' && c.length == 3);
      expect(mode.slice(0, 2).map(c => c[2])).toEqual([1, 0]);
      expect(calls.indexOf(mode[0])).toBeGreaterThan(world);
      expect(calls.indexOf(mode[0])).toBeLessThan(sky());
      expect(calls.indexOf(mode[1])).toBeGreaterThan(sky());
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
      expect(Array.from(m[3] as Float32Array)).toEqual(
        Array.from(sunProj(SUN_DIR, sunAt([1, 1.6, 1], 0))),
      );
      expect(calls.find(c => c[0] == 'viewport')).toEqual(['viewport', 0, 0, SHADOW, SHADOW]);
      frame(rd);
      expect(layers()).toHaveLength(2);
    });

    it('moves with the eye, and the scene reads the same matrix', () => {
      const rd = createRenderer(canvas, ROOM);
      rd.frame([30, 1.6, -5], 0.7, 0, [], new Map(), createEffects(), []);
      const w = Array.from(set('W').at(-1)![3] as Float32Array);
      // Ahead of the eye, the way it looks.
      expect(w).toEqual(Array.from(sunProj(SUN_DIR, sunAt([30, 1.6, -5], 0.7))));
      expect(w).not.toEqual(Array.from(sunProj(SUN_DIR, [30, 1.6, -5])));
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
      // His rigid pieces, from the store, in the shadow's pass and the scene's alike.
      const pieces = draws(true);
      expect(pieces.length).toBeGreaterThan(0);
      expect(pieces.slice(0, pieces.length / 2)).toEqual(pieces.slice(pieces.length / 2));
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
        solids: vi.fn(),
        flash: vi.fn(),
        laser: vi.fn(),
        burst: vi.fn(),
        impact: vi.fn(),
        blast: vi.fn(),
        tesla: vi.fn(),
        ring: vi.fn(),
        arc: vi.fn(),
        orbs: vi.fn(),
        shock: vi.fn(),
        lightning: vi.fn(),
        charging: vi.fn(),
        crackle: vi.fn(),
        spit: vi.fn(),
        gore: vi.fn(),
        strike: vi.fn(),
        mount: vi.fn(),
        update: vi.fn(),
        draw,
        lights: () => [],
      });
      expect(draw).toHaveBeenCalledWith(expect.any(Verts), [1, 1.6, 1]);
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
});
