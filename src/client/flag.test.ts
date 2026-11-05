import { describe, expect, it } from 'vitest';
import { FLAG_REACH, TEAM_COLOR } from '../shared/constants';
import { STILL } from '../shared/physics';
import { FLAG, TEAM } from '../shared/types';
import type { FlagState, PlayerState } from '../shared/types';
import { POLE, base, flag, flagDraws, teamRgb } from './flag';
import type { FlagDraw } from './flag';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';

interface Vertex {
  p: Vec3;
  n: Vec3;
  rgb: Vec3;
  layer: number;
}
/** The vertices of what a function drew. */
const draw = (f: (out: number[]) => void): Vertex[] => {
  const out: number[] = [];
  f(out);
  expect(out.length % STRIDE).toBe(0);
  expect(out.every(Number.isFinite)).toBe(true);
  return Array.from({ length: out.length / STRIDE }, (_, i) => {
    const v = out.slice(i * STRIDE, (i + 1) * STRIDE);
    return {
      p: v.slice(0, 3) as Vec3,
      n: v.slice(3, 6) as Vec3,
      rgb: [v[6], v[7], v[9]],
      layer: v[8],
    };
  });
};
const RED = teamRgb(TEAM.RED);
const BLUE = teamRgb(TEAM.BLUE);
const AT: Vec3 = [10, 5, -20];
const range = (vs: Vertex[], axis: number) => {
  const a = vs.map(v => v.p[axis]);
  return [Math.min(...a), Math.max(...a)];
};

const flagState = (over: Partial<FlagState>): FlagState => ({
  state: FLAG.HOME,
  by: 0,
  x: 0,
  y: 0,
  z: 0,
  left: 0,
  ...over,
});
const player = (over: Partial<PlayerState>): PlayerState => ({
  id: 3,
  x: 1,
  y: 2,
  z: 3,
  vy: 0,
  yaw: 0.5,
  pitch: 0,
  ground: true,
  ...STILL,
  ...over,
});

describe('teamRgb', () => {
  it('reads the team colour: red is mostly red, blue mostly blue, all within 0..1', () => {
    for (const team of [TEAM.RED, TEAM.BLUE]) {
      expect(teamRgb(team)).toHaveLength(3);
      expect(teamRgb(team).every(c => c >= 0 && c <= 1)).toBe(true);
    }
    expect(RED[0]).toBeGreaterThan(Math.max(RED[1], RED[2]) * 2);
    expect(BLUE[2]).toBeGreaterThan(Math.max(BLUE[0], BLUE[1]) * 1.5);
    expect(TEAM_COLOR).toHaveLength(2);
  });
});

describe('flagDraws', () => {
  const bases: Vec3[] = [
    [0, 10, 0],
    [50, 12, 0],
  ];

  it('puts a flag at home on its base', () => {
    expect(flagDraws([flagState({}), flagState({})], bases, () => undefined)).toEqual([
      { team: 0, at: bases[0] },
      { team: 1, at: bases[1] },
    ]);
  });

  it('puts a dropped flag where it lies, marked as dropped', () => {
    const f = flagState({ state: FLAG.DROPPED, x: 7, y: 8, z: 9, left: 4 });
    expect(flagDraws([f, flagState({})], bases, () => undefined)[0]).toEqual({
      team: 0,
      at: [7, 8, 9],
      dropped: true,
    });
  });

  it('puts a carried flag on its carrier, with the way he looks and runs', () => {
    const f = flagState({ state: FLAG.CARRIED, by: 3 });
    const p = player({ vx: 4, vz: -2 });
    const [d] = flagDraws([flagState({}), f], bases, id => (id === 3 ? p : undefined));
    expect(d).toEqual({ team: 0, at: bases[0] });
    const [, e] = flagDraws([flagState({}), f], bases, id => (id === 3 ? p : undefined));
    expect(e).toEqual({ team: 1, at: [1, 2, 3], by: { yaw: 0.5, vx: 4, vz: -2 } });
  });

  it('leaves a flag out whose carrier is not drawn', () => {
    const f = flagState({ state: FLAG.CARRIED, by: 9 });
    expect(flagDraws([f, flagState({})], bases, () => undefined)).toEqual([
      { team: 1, at: bases[1] },
    ]);
  });
});

describe('base', () => {
  const vs = draw(out => base(out, AT, RED, 0));

  it('is a pad of the team colour under a glowing ring of the radius a flag is touched within', () => {
    const glowing = vs.filter(v => v.layer === -2);
    const lit = vs.filter(v => v.layer === -1);
    expect(glowing.length).toBeGreaterThan(30);
    expect(lit.length).toBeGreaterThan(30);
    for (const v of vs) {
      expect(Math.hypot(v.p[0] - AT[0], v.p[2] - AT[2])).toBeLessThanOrEqual(FLAG_REACH + 1e-6);
      expect(v.p[1]).toBeGreaterThan(AT[1]);
      expect(v.p[1]).toBeLessThan(AT[1] + 0.1);
      // Every face looks up.
      expect(v.n[1]).toBeCloseTo(1, 6);
    }
    // The ring reaches the edge of the reach circle.
    expect(Math.max(...glowing.map(v => Math.hypot(v.p[0] - AT[0], v.p[2] - AT[2])))).toBeCloseTo(
      FLAG_REACH,
      6,
    );
    // Red in a red base: the red channel leads on the ring and on the pad.
    for (const v of [...glowing, ...lit]) {
      expect(v.rgb[0]).toBeGreaterThan(v.rgb[2]);
    }
    expect(glowing[0].rgb[0]).toBeGreaterThan(1);
  });

  it('is blue in a blue base, and the ring pulses with the clock', () => {
    const b = draw(out => base(out, AT, BLUE, 0)).filter(v => v.layer === -2);
    expect(b[0].rgb[2]).toBeGreaterThan(b[0].rgb[0]);
    const bright = (t: number) =>
      draw(out => base(out, AT, RED, t)).find(v => v.layer === -2)!.rgb[0];
    const levels = [0, 0.3, 0.6, 0.9, 1.2].map(bright);
    expect(Math.max(...levels) / Math.min(...levels)).toBeGreaterThan(1.2);
    expect(bright(0)).toBe(bright(0));
  });
});

describe('flag at home', () => {
  const home: FlagDraw = { team: TEAM.RED, at: AT };
  const vs = draw(out => flag(out, home, RED, 0.4));

  it('stands upright on its foot, a pole as tall as POLE with its cloth at the top', () => {
    const [lo, hi] = range(vs, 1);
    expect(lo).toBeGreaterThanOrEqual(AT[1] - 1e-6);
    // The bead over the tip, a few centimetres.
    expect(hi).toBeGreaterThan(AT[1] + POLE);
    expect(hi).toBeLessThan(AT[1] + POLE + 0.2);
    const cloth = vs.filter(v => v.layer === -1 && v.rgb[0] === RED[0]);
    expect(cloth.length).toBeGreaterThan(60);
    // The cloth hangs from the tip and stays within its length and height of it.
    for (const v of cloth) {
      expect(v.p[1]).toBeLessThanOrEqual(AT[1] + POLE + 0.05);
      expect(v.p[1]).toBeGreaterThanOrEqual(AT[1] + POLE - 0.7);
      expect(Math.hypot(v.p[0] - AT[0], v.p[2] - AT[2])).toBeLessThan(1.3);
    }
    expect(vs.filter(v => v.layer === -2).length).toBeGreaterThan(0);
  });

  it('is in the team colour', () => {
    const cloth = vs.filter(v => v.layer === -1 && v.rgb[0] === RED[0] && v.rgb[1] === RED[1]);
    expect(cloth.length).toBeGreaterThan(60);
    const blue = draw(out => flag(out, { team: TEAM.BLUE, at: AT }, BLUE, 0.4));
    expect(blue.filter(v => v.rgb[2] === BLUE[2] && v.rgb[0] === BLUE[0]).length).toBeGreaterThan(
      60,
    );
  });

  it('draws both sides of the cloth, facing opposite ways, so it is lit from the front and the back', () => {
    const cloth = vs.filter(v => v.layer === -1 && v.rgb[0] === RED[0] && v.rgb[1] === RED[1]);
    const ns = cloth.map(v => v.n);
    // Sideways facing: the cloth is a vertical sheet along the wind, its normals horizontal.
    const horizontal = ns.filter(n => Math.abs(n[1]) < 0.5);
    expect(horizontal.length).toBeGreaterThan(cloth.length * 0.9);
    // Opposite normals, about as many of each: one side for each.
    const [a] = horizontal;
    const same = horizontal.filter(n => n[0] * a[0] + n[2] * a[2] > 0).length;
    expect(same).toBeGreaterThan(horizontal.length * 0.4);
    expect(same).toBeLessThan(horizontal.length * 0.6);
  });

  it('waves: the cloth is not the same at another time, and the pole is', () => {
    const later = draw(out => flag(out, home, RED, 0.7));
    expect(later).toHaveLength(vs.length);
    const moved = vs.filter((v, i) => v.p.some((c, k) => Math.abs(c - later[i].p[k]) > 0.01));
    expect(moved.length).toBeGreaterThan(20);
    // The pole (and the bead) stay.
    const still = vs.filter((v, i) => v.p.every((c, k) => c === later[i].p[k]));
    expect(still.length).toBeGreaterThan(20);
  });

  it('blows the two teams the other way round, so the bases read as apart', () => {
    const side = (team: number) => {
      const cloth = draw(out => flag(out, { team, at: AT }, RED, 0)).filter(
        w => w.layer === -1 && w.rgb[0] === RED[0] && w.rgb[1] === RED[1],
      );
      return cloth.reduce((m, w) => m + (w.p[0] - AT[0]) / cloth.length, 0);
    };
    expect(side(0)).toBeGreaterThan(0.3);
    expect(side(1)).toBeLessThan(-0.3);
  });

  it('is cheap: a few hundred vertices', () => {
    expect(vs.length).toBeLessThan(500);
  });
});

describe('flag carried', () => {
  /** The carrier is at AT looking along yaw; forward(yaw) is (-sin, -cos). */
  const carried = (yaw: number, vx: number, vz: number, t = 0.4) =>
    draw(out => flag(out, { team: TEAM.BLUE, at: AT, by: { yaw, vx, vz } }, BLUE, t));
  const cloth = (vs: Vertex[]) =>
    vs.filter(v => v.layer === -1 && v.rgb[0] === BLUE[0] && v.rgb[1] === BLUE[1]);

  it('rides on the back, reaching over the head, behind the way he looks', () => {
    const vs = carried(0, 0, 0);
    // Looking toward -z: the back is +z.
    const pole = vs.filter(v => v.layer === -1 && v.rgb[0] !== BLUE[0]);
    expect(pole.length).toBeGreaterThan(10);
    for (const v of pole) {
      expect(v.p[2]).toBeGreaterThan(AT[2] + 0.2);
      expect(v.p[2]).toBeLessThan(AT[2] + 0.5);
    }
    const [lo, hi] = range(vs, 1);
    expect(lo).toBeGreaterThan(AT[1] + 0.4);
    expect(hi).toBeGreaterThan(AT[1] + 2.2);
    // Turn him around and the flag turns with him.
    const back = carried(Math.PI, 0, 0).filter(v => v.layer === -1 && v.rgb[0] !== BLUE[0]);
    for (const v of back) {
      expect(v.p[2]).toBeLessThan(AT[2] - 0.2);
    }
  });

  it('trails the cloth against his run, further when he is fast', () => {
    const reach = (vs: Vertex[], dx: number, dz: number) =>
      Math.max(...cloth(vs).map(v => (v.p[0] - AT[0]) * dx + (v.p[2] - AT[2]) * dz));
    // Running +x: the cloth streams to -x, so nothing of it is ahead of the pole top much.
    const east = carried(0, 8, 0);
    const west = carried(0, -8, 0);
    expect(reach(east, -1, 0)).toBeGreaterThan(0.8);
    expect(reach(west, 1, 0)).toBeGreaterThan(0.8);
    expect(reach(east, 1, 0)).toBeLessThan(0.1);
    // Standing, it hangs behind him; slowly it is shorter than at speed.
    const still = carried(0, 0, 0);
    expect(reach(still, 0, 1)).toBeGreaterThan(0.5);
    const slow = carried(0, 2, 0);
    expect(reach(slow, -1, 0)).toBeLessThan(reach(east, -1, 0));
  });

  it('flutters harder at speed than standing', () => {
    const amp = (vs: Vertex[], vx: number) => {
      const later = carried(0, vx, 0, 0.7);
      return Math.max(...cloth(vs).map((v, i) => Math.abs(v.p[2] - cloth(later)[i].p[2])));
    };
    expect(amp(carried(0, 9, 0), 9)).toBeGreaterThan(amp(carried(0, 0, 0), 0));
  });
});

describe('flag dropped', () => {
  const lying: FlagDraw = { team: TEAM.RED, at: AT, dropped: true };
  const vs = draw(out => flag(out, lying, RED, 0.2));

  it('lies low on the ground, the pole as long as a standing one, with a ring where it is touched', () => {
    const [lo, hi] = range(vs, 1);
    expect(lo).toBeGreaterThanOrEqual(AT[1]);
    expect(hi).toBeLessThan(AT[1] + 1);
    const ring = vs.filter(v => v.layer === -2 && Math.abs(v.n[1] - 1) < 1e-6);
    expect(ring.length).toBeGreaterThan(30);
    expect(Math.max(...ring.map(v => Math.hypot(v.p[0] - AT[0], v.p[2] - AT[2])))).toBeCloseTo(
      FLAG_REACH,
      6,
    );
    // The pole reaches 2.3 m from the foot, as far as a standing one is tall, give or take its tilt.
    const reach = Math.max(
      ...vs
        .filter(v => v.layer === -1 && v.rgb[0] !== RED[0])
        .map(v => Math.hypot(v.p[0] - AT[0], v.p[1] - AT[1], v.p[2] - AT[2])),
    );
    expect(reach).toBeGreaterThan(2.2);
    expect(reach).toBeLessThan(POLE + 0.1);
  });

  it('lies the same way each frame at one place, and another way at another', () => {
    expect(draw(out => flag(out, lying, RED, 0.2))).toEqual(vs);
    /** The direction the pole points in, seen from above: from the foot to its far end. */
    const way = (at: Vec3) => {
      const pole = draw(out => flag(out, { ...lying, at }, RED, 0.2)).filter(
        v => v.layer === -1 && v.rgb[0] !== RED[0],
      );
      const far = pole.reduce((m, v) => (dist(v, at) > dist(m, at) ? v : m));
      return Math.atan2(far.p[2] - at[2], far.p[0] - at[0]);
    };
    const dist = (v: Vertex, at: Vec3) => Math.hypot(v.p[0] - at[0], v.p[2] - at[2]);
    expect(Math.abs(way(AT) - way([AT[0] + 3.3, AT[1], AT[2] - 1.7]))).toBeGreaterThan(0.1);
  });
});
