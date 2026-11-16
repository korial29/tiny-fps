// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STILL } from '../shared/physics';
import { ROVER } from '../shared/rover';
import { ORBIT } from '../shared/constants';
import { MOON } from '../shared/moon';
import { SHIP } from '../shared/ship';
import { MODE, NOBODY, TEX } from '../shared/types';
import type { PlayerState, Rover } from '../shared/types';
import { build } from '../shared/world';
import type { Brush, World, WorldDef } from '../shared/world';
import { craft } from './craft';
import { createEffects } from './effects';
import { HEAVENS } from './moonscape';
import { teamRgb } from './flag';
import { BEAM_RANGE } from './lights';
import { SHINE, STRIDE } from './mesh';
import { headlights, rover } from './rover';
import {
  FOG_LAYER,
  FOG_RISE,
  HAZE,
  MAX_TINTS,
  ROVER_MID,
  ROVER_NEAR,
  SHIP_MID,
  SHIP_NEAR,
  city,
  createRenderer,
  fogOf,
  fogRef,
  palette,
  scenery,
} from './render';
import type * as Traffic from './traffic';
import { duo } from '../../test/teams';
import { pose } from '../../test/flesh';

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
    let [still, posed] = [true, false];
    for (const c of calls) {
      const at = (c[1] as { u?: string } | undefined)?.u;
      if (c[0] == 'uniform4fv' && at == 'R') {
        still = (c[2] as number[]).join() == '0,0,0,1,0,0,0,1';
      } else if (c[0] == 'uniform1i' && at == 'Sm') {
        posed = c[2] != 0;
      } else if (c[0] == 'drawArrays' && c[3] != 3 && (still && !posed) != kept) {
        out.push([c[2], c[3]] as [number, number]);
      }
    }
    return out;
  };

  /** The calls that set the uniform `name`. */
  const set = (name: string) =>
    calls.filter(c => (c[1] as { u?: string } | undefined)?.u == name && /^uniform/.test(c[0]));

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
      // The sky without the moon's globe: a reflection of it is not worth its cost on every pixel.
      expect(frag).toMatch(/r=reflect\(-V,m\),k=K1\(r,0\.\)/);
      // The sky pass and the crater fading into the globe are the one function, and its definition.
      expect(frag.match(/K0\(/g)).toHaveLength(3);
      // The globe is shaded only for a pixel that fades into it, and a crater cell looks at the
      // neighbours on its near side alone: 4 on the ground, 8 on the globe (the user's lag in orbit).
      expect(frag).toContain('if(fa>.002)o.rgb=mix(o.rgb,K0(-V,pv),fa)');
      expect(frag).toMatch(/vec3 ct\(vec2 q,float s\)\{[^}]*for\(int j=0;j<4;j\+\+\)/);
      expect(frag).toMatch(/vec4 cr\(vec3 p,float s\)\{[^}]*for\(int j=0;j<8;j\+\+\)/);
    });

    it('lets the sun’s shadow go past the sides of its window and past its depth: from high up, the ground under it is no dark square', () => {
      createRenderer(canvas, ROOM);
      const frag = calls
        .filter(c => c[0] == 'shaderSource')
        .map(c => String(c[2]))
        .find(s => s.includes('sampler2DArray'))!;
      expect(frag).toContain('max(max(abs(q.x-.5),abs(q.y-.5)),abs(q.z-.5))');
    });

    it('draws the moon’s globe past the relief from a little height, and fades the crater into it over the seam', () => {
      const ob = (w: World, y: number) => {
        const rd = createRenderer(canvas, w);
        calls.length = 0;
        rd.frame([80, y, 140], 0, 0, [], new Map(), createEffects(), []);
        return calls.find(c => (c[1] as { u?: string } | undefined)?.u == 'Ob')!.slice(2);
      };
      const moon = build({ ...ROOM.def, relief: MOON.relief, seam: ORBIT.SEAM });
      expect(ob(moon, 2)).toEqual([0, 0, 0, 0]);
      // Over the rim: the globe at its own height, the relief's edge fading into it.
      const [globe, fade, edge] = ob(moon, 90) as number[];
      expect(globe * 1_737_400).toBeCloseTo(90, 0);
      expect([fade, edge]).toEqual([0, 1]);
      // In orbit: seen from kilometres up, the crater gone into it.
      const high = ob(moon, ORBIT.SEAM + 300) as number[];
      expect(high[0] * 1_737_400).toBeGreaterThan(5_000);
      expect(high.slice(1, 3)).toEqual([1, 1]);
      // A map with no relief never has one.
      expect(ob(ROOM, ORBIT.SEAM + 300)).toEqual([0, 0, 0, 0]);
    });

    it('draws the moon’s stars in the sky, and its Earth wherever the eye is, at the same angle: they are infinitely far', () => {
      const sn = (w: World) => {
        calls.length = 0;
        createRenderer(canvas, w);
        return calls.find(c => (c[1] as { u?: string } | undefined)?.u == 'Sn')?.[2];
      };
      expect(sn(build(MOON))).toBe(1);
      expect(sn(ROOM)).toBe(0);
      const rd = createRenderer(canvas, build(MOON));
      for (const eye of [
        [80, 2, 200],
        [-150, 600, 400],
      ] as [number, number, number][]) {
        calls.length = 0;
        rd.frame(eye, 0, 0, [], new Map(), createEffects(), []);
        const moved = calls.filter(
          c =>
            (c[1] as { u?: string } | undefined)?.u == 'R' &&
            [4, 5, 6].some(k => (c[2] as number[])[k] !== 0),
        );
        expect(moved.length).toBeGreaterThan(0);
        expect([...(moved[0][2] as number[])].slice(4, 7)).toEqual(
          eye.map((v, k) => v - HEAVENS[k]),
        );
      }
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

  describe('rovers', () => {
    /** A rover at rest on the room's floor, its nose to -z. */
    const parked = (o: Partial<Rover> = {}): Rover => ({
      x: 2,
      y: ROVER.L0 + ROVER.WR - 0.08,
      z: 2,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      wy: 0,
      wp: 0,
      wr: 0,
      steer: 0,
      driver: NOBODY,
      rider: NOBODY,
      ...o,
    });
    const EYE: [number, number, number] = [2, 2, 8];
    const man = (o: Partial<PlayerState> = {}): PlayerState => ({
      id: 1,
      x: 2,
      y: 0,
      z: 2,
      vy: 0,
      yaw: 0,
      pitch: 0,
      ground: true,
      ...STILL,
      ...o,
    });
    const show = (
      rd: ReturnType<typeof createRenderer>,
      rovers?: Rover[],
      self?: PlayerState,
      others: PlayerState[] = [],
      eye = EYE,
    ) => {
      calls.length = 0;
      rd.frame(
        eye,
        0,
        0,
        others,
        new Map(),
        createEffects(),
        [],
        undefined,
        undefined,
        undefined,
        rovers,
        self,
      );
      return draws();
    };
    /** The dynamic vertices of the last frame. */
    const tail = () =>
      Array.from(calls.filter(c => c[0] == 'bufferSubData').at(-1)![3] as Float32Array);
    /** The vertices the shader poses (flesh.ts) in the frame's draws, as their uniforms gave them. */
    const posed = () => {
      const out: number[] = [];
      const u: Record<string, unknown[]> = {};
      for (const c of calls) {
        const at = (c[1] as { u?: string } | undefined)?.u;
        if (at && c[0].startsWith('uniform')) {
          u[at] = c.slice(2);
        } else if (c[0] == 'drawArrays' && u.Sm?.[0]) {
          const sc = Array.from(u.Sc[0] as number[]);
          pose(out, {
            m: { first: 0, count: c[3] as number },
            q: [0, 0, 0, 1],
            t: [0, 0, 0],
            k: 1,
            f: {
              kind: u.Sm[0] as number,
              at: u.Sb.slice(0, 3) as [number, number, number],
              d: u.Sq[0] as Float32Array,
              pal: u.Sp[0] as Float32Array,
              face: u.Sw[0] as Float32Array,
              plate: u.Sb[3] ? sc.slice(0, 3) : undefined,
              accent: sc.slice(3),
            },
          });
        }
      }
      return out;
    };
    /** The model as rover.ts draws it, as the buffer holds it. */
    const model = (r: Rover, spin: number, team: number, lod: number) => {
      const out: number[] = [];
      rover(out, r, ROOM, spin, teamRgb(team), lod);
      return Array.from(new Float32Array(out));
    };

    it('draws none without `rovers`, and the ones given in the dynamic tail, before the beams, in the shadow pass', () => {
      const rd = createRenderer(canvas, ROOM);
      expect(show(rd)).toEqual([
        [0, FLOOR_VERTS],
        [0, FLOOR_VERTS],
      ]);
      expect(tail()).toHaveLength(0);
      const r = parked();
      const [depth, world] = show(rd, [r]);
      const m = model(r, 0, 0, 2);
      expect(m.length).toBeGreaterThan(1000 * STRIDE);
      // Casting like the players: the depth pass draws them, and nothing that glows comes before.
      expect(depth[1]).toBe(FLOOR_VERTS + m.length / STRIDE);
      expect(world[1]).toBe(depth[1]);
      expect(tail()).toEqual(m);
      // Gone again with the list.
      expect(show(rd)[0][1]).toBe(FLOOR_VERTS);
    });

    it("paints the first half of the map's rovers red and the second blue", () => {
      const rd = createRenderer(canvas, ROOM);
      const rs = [0, 1, 2, 3].map(i => parked({ x: 2 + 6 * i }));
      show(rd, rs);
      expect(tail()).toEqual(rs.flatMap((r, i) => model(r, 0, +(i > 1), 2)));
    });

    it('picks the level of detail by the distance to the eye', () => {
      const rd = createRenderer(canvas, ROOM);
      const r = parked();
      const at = (d: number): [number, number, number] => [r.x, r.y, r.z + d];
      for (const [d, lod] of [
        [ROVER_NEAR - 1, 2],
        [ROVER_NEAR + 1, 1],
        [ROVER_MID - 1, 1],
        [ROVER_MID + 1, 0],
      ]) {
        show(rd, [r], undefined, [], at(d));
        expect(tail()).toEqual(model(r, 0, 0, lod));
      }
      expect(model(r, 0, 0, 0).length).toBeLessThan(model(r, 0, 0, 1).length);
      expect(model(r, 0, 0, 1).length).toBeLessThan(model(r, 0, 0, 2).length);
    });

    it("picks a ship's level of detail by the distance to the eye, further out than a rover's", () => {
      const rd = createRenderer(canvas, ROOM);
      const r: Rover = { ...parked({ y: SHIP.DROP }), ship: true, hp: 10, wreck: 0, nades: 2 };
      const at = (d: number): [number, number, number] => [r.x, r.y, r.z + d];
      /** The ship as craft.ts draws it between two flashes of its strobe, as the buffer holds it. */
      const ship = (lod: number) => {
        const out: number[] = [];
        craft(out, r, teamRgb(0), 0.5, lod);
        return Array.from(new Float32Array(out));
      };
      for (const [d, lod] of [
        [SHIP_NEAR - 1, 2],
        [SHIP_NEAR + 1, 1],
        [SHIP_MID - 1, 1],
        [SHIP_MID + 1, 0],
      ]) {
        show(rd, [r], undefined, [], at(d));
        // The strobe's bead, when it is lit, comes last.
        expect(tail().slice(0, ship(lod).length)).toEqual(ship(lod));
        expect(tail().length - ship(lod).length).toBeLessThan(40 * STRIDE);
      }
      expect(SHIP_NEAR).toBeGreaterThan(ROVER_NEAR);
      expect(SHIP_MID).toBeGreaterThan(ROVER_MID);
    });

    it('rolls the wheels by the way driven along the nose: forward, back again in reverse, not at all sideways or when put back', () => {
      const rd = createRenderer(canvas, ROOM);
      const drive = (r: Rover, spin: number) => {
        show(rd, [r]);
        expect(tail()).toEqual(model(r, spin, 0, 2));
      };
      drive(parked(), 0);
      // The nose looks to -z: half a metre that way is one radian of a wheel of radius 0.5.
      drive(parked({ z: 1.5 }), 0.5 / ROVER.WR);
      drive(parked({ z: 1 }), 1 / ROVER.WR);
      drive(parked({ z: 2.5 }), -0.5 / ROVER.WR);
      drive(parked({ z: 2.5, x: 3 }), -0.5 / ROVER.WR);
      drive(parked({ z: 2.5, x: 3 + 6 }), -0.5 / ROVER.WR);
      // Each rover has its own wheels.
      show(rd, [parked({ z: 2.5, x: 9 }), parked({ x: 5 })]);
      expect(tail()).toEqual([
        ...model(parked({ z: 2.5, x: 9 }), -0.5 / ROVER.WR, 0, 2),
        ...model(parked({ x: 5 }), 0, 1, 2),
      ]);
    });

    it('draws the own player only when he is given, whole, like the others, and he casts a shadow', () => {
      const rd = createRenderer(canvas, ROOM);
      const bare = show(rd, [])[0][1];
      const [depth, world] = show(rd, [], man({ id: 7 }));
      expect(depth[1]).toBeGreaterThan(bare + 500);
      expect(world[1]).toBe(depth[1]);
      expect(rd.steps(7)).toBe(0);
      const other = show(rd, [], undefined, [man({ id: 7 })])[0][1];
      expect(other).toBe(depth[1]);
      // Both: twice as many.
      expect(show(rd, [], man({ id: 7 }), [man({ id: 8, x: 3 })])[0][1] - bare).toBe(
        2 * (other - bare),
      );
      expect(show(rd, [])[0][1]).toBe(bare);
      expect(rd.steps(7)).toBeUndefined();
    });

    it('seats who rides in his rover: lower than standing, and leaning with it', () => {
      // A renderer each: a runner first seen is in its pose at once.
      const top = (r: Rover, p: PlayerState) => {
        const rd = createRenderer(canvas, ROOM);
        show(rd, [r], p);
        // His skin is posed by the shader (flesh.ts).
        const v = [...tail().slice(model(r, 0, 0, 2).length), ...posed()];
        let y = -Infinity;
        for (let i = 1; i < v.length; i += STRIDE) {
          y = Math.max(y, v[i]);
        }
        return y;
      };
      const p = man({ id: 7, y: 0.67 });
      const stands = top(parked(), p);
      const sits = top(parked({ driver: 7 }), { ...p, mode: MODE.RIDE });
      // Bare-handed, in his fighter's guard: lower than a man standing straight.
      expect(stands - p.y).toBeGreaterThan(1.62);
      expect(sits - p.y).toBeGreaterThan(0.95);
      expect(sits - p.y).toBeLessThan(1.3);
      // Nose down, his head goes down with the seat.
      const dives = top(parked({ driver: 7, pitch: -0.6 }), { ...p, mode: MODE.RIDE });
      expect(dives).toBeLessThan(sits - 0.1);
    });

    it('lights the headlights of a rover that has a driver, and of no other', () => {
      const rd = createRenderer(canvas, ROOM);
      const q = () => set('Q').at(-1)![2];
      show(rd, [parked(), parked({ x: 9, rider: 3 })]);
      expect(q()).toBe(0);
      const r = parked({ x: 9, driver: 3 });
      show(rd, [parked(), r]);
      expect(q()).toBe(1);
      const a = Array.from(set('A').at(-1)![2] as Float32Array).slice(0, 4);
      const [l, k] = headlights(r);
      expect(a).toEqual(
        Array.from(new Float32Array([...l.map((v, i) => (v + k[i]) / 2), BEAM_RANGE])),
      );
      // No shadow map for them: the sun's pass alone.
      expect(calls.filter(c => c[0] == 'framebufferTextureLayer')).toHaveLength(1);
    });

    it('raises dust behind a rover that goes fast on the ground, after its model, and none from one in the air or at rest', () => {
      const rd = createRenderer(canvas, ROOM);
      let clock = 1e6;
      const run = (o: Partial<Rover>) => {
        let n = 0;
        for (let i = 0; i < 8; i++) {
          vi.spyOn(performance, 'now').mockReturnValue((clock += 50));
          show(rd, [parked(o)]);
          n = tail().length - model(parked(o), 0, 0, 2).length;
        }
        return n;
      };
      expect(run({})).toBe(0);
      expect(run({ y: 6, vz: -15 })).toBe(0);
      const puffs = run({ vz: -15 });
      expect(puffs).toBeGreaterThan(0);
      // Smoke, which the depth pass throws away.
      const v = tail().slice(-puffs);
      expect(v.filter((_, i) => i % STRIDE == 8).every(l => l == -3)).toBe(true);
    });
  });
});
