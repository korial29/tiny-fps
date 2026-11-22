import { describe, expect, it } from 'vitest';
import { ROLE } from '../shared/kit';
import { mask } from './mask';
import { DOWN_TICKS, TICK_HZ } from '../shared/constants';
import { STILL } from '../shared/physics';
import { LIMB, MODE, NOBODY, SIDE } from '../shared/types';
import type { PlayerState, Rover } from '../shared/types';
import { REAR, RIFLE_HOLD, foregrip, axes as frameOf, grip, railgun, rifle, tip } from './gun';
import { FIST, inv } from './body';
import { SCALE, SHELL } from './helmet';
import { GLOSS, SHINE, STRIDE, add, basis } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, REST, solve, turn } from './rig';
import { FRY, animate, dissolve, fried, seatOf, soldier, stance } from './soldier';
import type { Runner } from './soldier';
import { hunter } from './hunter';
import { PACK, pack } from './pack';

const DT = 1 / 60;
const man = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 5,
  y: 1,
  z: -3,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...o,
});

/** Vertices of a model, as [x, y, z, layer, r, g, b] after the position and normal. */
const rows = (v: number[]) =>
  Array.from({ length: v.length / STRIDE }, (_, i) => {
    const k = i * STRIDE;
    return [v[k], v[k + 1], v[k + 2], v[k + 8], v[k + 6], v[k + 7], v[k + 9]];
  });

/** A runner that has held the state `o` for `n` frames, run along -z when it has a speed, ending at z = -3. */
const hold = (o: Partial<PlayerState>, n = 90) => {
  const book = new Map<number, Runner>();
  let p = man({ ...o, z: -3 - (o.vz ?? 0) * DT * (n - 1) });
  for (let i = 0; i < n; i++) {
    animate(book, [p], DT);
    p = man({ ...o, z: p.z + (o.vz ?? 0) * DT });
  }
  return book.get(1)!;
};

describe('a runner the rail gun’s bolt puts down', () => {
  it('comes apart over FRY seconds from the moment he goes down, and only when fried', () => {
    const down = (left: number, fry = true) =>
      fried({ ...STILL, fried: fry, down: left } as PlayerState);
    expect(down(DOWN_TICKS)).toBe(0);
    expect(down(DOWN_TICKS - (FRY * TICK_HZ) / 2)).toBeCloseTo(0.5, 6);
    expect(down(1)).toBe(1);
    expect(down(DOWN_TICKS / 2, false)).toBe(0);
    expect(down(0)).toBe(0);
  });

  it('glows, drifts up and thins to nothing', () => {
    const tris = 400;
    const make = () =>
      Array.from({ length: tris * 3 }, () => [0, 1, 0, 0, 1, 0, 0.5, 0.2, -1, 0.1]).flat();
    const whole = make();
    dissolve(whole, 0, 0);
    expect(whole).toEqual(make());
    const half = [1, 2, 3, ...make()];
    dissolve(half, 3, 0.5);
    // The vertices before `from` are not touched.
    expect(half.slice(0, 3)).toEqual([1, 2, 3]);
    const n = (half.length - 3) / (3 * STRIDE);
    expect(n).toBeGreaterThan(tris * 0.4);
    expect(n).toBeLessThan(tris * 0.6);
    for (let o = 3; o < half.length; o += STRIDE) {
      expect(half[o + 8]).toBe(-2);
      expect(half[o + 1]).toBeGreaterThanOrEqual(1);
    }
    const gone = make();
    dissolve(gone, 0, 1);
    expect(gone).toHaveLength(0);
  });
});

describe('a runner with the rail gun', () => {
  it('puts it away on a wall-run, and takes it back while its bolt goes out', () => {
    for (const zapping of [false, true]) {
      const r = hold({
        mode: MODE.WALLRUN,
        ground: false,
        y: 1.2,
        wall: SIDE.EAST,
        vz: -8,
        rail: 100,
        railed: true,
        zapping,
      });
      const out: number[] = [];
      soldier(out, r, [0.1, 0.8, 0.2], 3);
      const shine = out.filter((v, i) => i % STRIDE == 8 && v == SHINE).length;
      expect(shine > 0).toBe(zapping);
      const { s } = stance(r);
      const [at] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R]);
      expect(Math.hypot(...s.pos[J.HAND_L].map((v, i) => v - at[i])) < 0.1).toBe(zapping);
    }
  });

  it('holds it in both hands, the left round the front grip, standing, running and looking up or down', () => {
    for (const [vz, pitch] of [
      [0, 0],
      [0, -0.5],
      [0, 0.5],
      [-6, 0],
      [-9, 0],
    ]) {
      const p = {
        id: 1,
        x: 0,
        y: 0,
        z: 0,
        vy: 0,
        yaw: 0,
        ground: true,
        ...STILL,
        vz,
        pitch,
        rail: 100,
        railed: true,
      } as PlayerState;
      const book = new Map<number, Runner>();
      for (let i = 0; i < 60; i++) {
        animate(book, [p], 1 / 60);
      }
      const { s } = stance(book.get(p.id)!);
      const [at] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R]);
      const q = s.rot[J.HAND_L];
      const [fing, x] = [turn(q, [0, -1, 0]), turn(q, [1, 0, 0])];
      const palm = [0, 1, 2].map(i => s.pos[J.HAND_L][i] + fing[i] * 0.078 + x[i] * 0.022);
      expect(Math.hypot(...palm.map((v, i) => v - at[i]))).toBeLessThan(0.01);
    }
  });

  it('wears a helmet when asked, in the team colour, on the head, and not on a head that is cut off', () => {
    const r = hold({}, 5);
    const [bare, capped] = [[], []] as number[][];
    soldier(bare, r, [0.9, 0.1, 0.1], 1);
    soldier(capped, r, [0.9, 0.1, 0.1], 1, true);
    expect(capped.length).toBeGreaterThan(bare.length);
    // Every added vertex is near a joint: the helmet, and the space suit's pack, hose and armour
    // plates.
    const { pos } = solve(r.gait.pose());
    const off = (i: number, j: number) =>
      Math.hypot(...[0, 1, 2].map(k => capped[i + k] - pos[j][k]));
    for (let i = bare.length; i < capped.length; i += STRIDE) {
      expect(Math.min(...pos.map((_, j) => off(i, j)))).toBeLessThan(0.35);
    }
    // A head the katana took off wears no helmet and no hose: the body keeps its pack and armour.
    const cut = hold({ down: 200, hp: 0, lost: LIMB.HEAD }, 30);
    expect(cut.cut?.limb).toBe(LIMB.HEAD);
    const [a, b, suit] = [[], [], []] as number[][];
    soldier(a, cut, [0.9, 0.1, 0.1], 1);
    const sk = soldier(b, cut, [0.9, 0.1, 0.1], 1, true)!;
    pack(suit, sk.pos[J.CHEST], sk.rot[J.CHEST], [0.9, 0.1, 0.1], 1);
    // The armour is cut out of the stump's skin: it comes after it, so the rest is at least as much.
    expect(b.length).toBeGreaterThanOrEqual(a.length + suit.length);
  });
});

describe('the ninja', () => {
  it('wears his own armour on an armoured map, over the black suit, and the face guard', () => {
    const team = [0.15, 0.4, 1];
    const [marine, ninja, bare] = [[], [], []] as number[][];
    soldier(marine, hold({}, 5), team, 3, false, true);
    const r = hold({}, 5);
    r.look = { role: ROLE.NINJA };
    soldier(ninja, r, team, 3, false, true);
    soldier(bare, hold({}, 5), team, 3);
    const guard: number[] = [];
    mask(guard, [0, 0, 0], [0, 0, 0, 1]);
    // Fewer plates than the marine, but some: his vest, his bracers, his shin guards and his shoulder pads, in the team's colour.
    expect(ninja.length).toBeGreaterThan(bare.length + guard.length);
    expect(marine.length).toBeGreaterThan(ninja.length);
    // Heights from his feet.
    const plated = (v: number[], lo: number, hi: number) => {
      let [n, feet] = [0, Infinity];
      for (let i = 0; i < v.length; i += STRIDE) {
        feet = Math.min(feet, v[i + 1]);
      }
      for (let i = 0; i < v.length; i += STRIDE) {
        const y = v[i + 1] - feet;
        // Glossy: a plate, not the suit's stripes.
        n += +(y > lo && y < hi && v[i + 8] == GLOSS && v[i + 6] == team[0]);
      }
      return n;
    };
    // Under the knee pads.
    expect(plated(ninja, 0.2, 0.3)).toBeGreaterThan(0);
    expect(plated(marine, 0.2, 0.3)).toBe(0);
    expect(plated(ninja, 1.25, 1.5)).toBeGreaterThan(0);
    // No plate on his thighs (his bracers hang lower than their tops), and none of the marine's belly plates' gloss on his back's sides.
    expect(plated(ninja, 0.6, 0.8)).toBe(0);
    expect(plated(marine, 0.6, 0.8)).toBeGreaterThan(0);
    // Black where the other wears his team's colour: far more of him is dark.
    const dark = (v: number[]) => {
      let n = 0;
      for (let i = 0; i < v.length; i += STRIDE) {
        n += +(v[i + 6] < 0.1 && v[i + 7] < 0.1 && v[i + 9] < 0.1);
      }
      return n / (v.length / STRIDE);
    };
    expect(dark(ninja)).toBeGreaterThan(0.35);
    expect(dark(ninja)).toBeGreaterThan(dark(bare) * 2);
  });

  it('is cheap far away: his guard and pads coarse, under 12 000 vertices (the user, 2026-11-14: lags)', () => {
    const team = [0.15, 0.4, 1];
    const r = hold({}, 5);
    r.look = { role: ROLE.NINJA };
    const [far, near] = [[], []] as number[][];
    soldier(far, r, team, 0, false, true);
    soldier(near, r, team, 1, false, true);
    // Each piece of a runner costs its vertices every frame, at every level: 23 000 before.
    expect(far.length / STRIDE).toBeLessThan(12000);
    expect(far.length * 2).toBeLessThan(near.length);
  });

  it('draws the xenomorph far away under 11 000 vertices and a quarter of its near ones (the user, 2026-11-16: lags)', () => {
    const r = hold({}, 5);
    r.look = { role: ROLE.XENO };
    const [far, near] = [[], []] as number[][];
    soldier(far, r, [1, 0.2, 0.2], 0, true, false);
    soldier(near, r, [1, 0.2, 0.2], 1, true, false);
    // 23 000 before: 13 rows of ribs, every toe's knuckle and pad, the pipes up its neck.
    expect(far.length / STRIDE).toBeLessThan(11000);
    expect(far.length * 4).toBeLessThan(near.length);
  });
});

describe('the Hunter', () => {
  it('draws the complete Hunter model at the player’s feet instead of the Marine skin', () => {
    const r = hold({}, 5);
    r.look = { role: ROLE.HUNTER };
    const out: number[] = [];
    soldier(out, r, [0.15, 0.4, 1], 0);
    const expected = Object.entries(hunter(0))
      .filter(([name]) => !name.startsWith('Quills') && name !== 'Visor grille')
      .reduce((n, [, part]) => n + part.length, 0);
    const heights = Array.from({ length: out.length / STRIDE }, (_, i) => out[i * STRIDE + 1]);
    expect(out.length).toBeGreaterThanOrEqual(expected);
    expect(Math.min(...heights)).toBeCloseTo(r.p.y, 2);
    // The lowered mask seats the crown 2.255 m above the planted feet.
    expect(Math.max(...heights) - r.p.y).toBeCloseTo(2.255, 2);
  });
});

describe('armour without a helmet (Highline)', () => {
  it('wears plates in the team colour, no helmet, no pack, and no white', () => {
    const r = hold({}, 5);
    const team = [0.15, 0.4, 1];
    const [bare, armored, space] = [[], [], []] as number[][];
    soldier(bare, r, team, 3);
    soldier(armored, r, team, 3, false, true);
    soldier(space, r, team, 3, true);
    expect(armored.length).toBeGreaterThan(bare.length);
    // No helmet: nothing added over the head's top.
    const head = solve(r.gait.pose()).pos[J.HEAD];
    const top = (v: number[]) => {
      let m = -Infinity;
      for (let i = 0; i < v.length; i += STRIDE) {
        m = Math.max(m, v[i + 1]);
      }
      return m;
    };
    expect(top(armored)).toBeLessThan(head[1] + 0.25);
    expect(top(space)).toBeGreaterThan(top(armored));
    // The glossy plates in the team colour; the space suit's white.
    const glossy = (v: number[]) => {
      const c: number[][] = [];
      for (let i = 0; i < v.length; i += STRIDE) {
        if (v[i + 8] == GLOSS) {
          c.push([v[i + 6], v[i + 7], v[i + 9]]);
        }
      }
      return c;
    };
    expect(glossy(armored).some(([r0, g, b]) => b > r0 * 2 && b > g)).toBe(true);
    expect(glossy(armored).some(([r0, g, b]) => r0 > 0.8 && g > 0.8 && b > 0.8)).toBe(false);
    expect(glossy(space).some(([r0, g, b]) => r0 > 0.8 && g > 0.8 && b > 0.8)).toBe(true);
  });
});

describe('riding a rover', () => {
  const rover = (o: Partial<Rover> = {}): Rover => ({
    x: 5,
    y: 1.35,
    z: -3,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0.5,
    pitch: 0.1,
    roll: -0.2,
    wy: 0,
    wp: 0,
    wr: 0,
    steer: 0.3,
    driver: NOBODY,
    rider: NOBODY,
    ...o,
  });
  const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const rides = (o: Partial<PlayerState> = {}) => man({ mode: MODE.RIDE, ground: false, ...o });

  it('finds the seat of who rides by the ids of the rovers: the driver, the rider, nobody on foot or unknown', () => {
    const rs = [
      rover({ driver: 4, rider: 9 }),
      rover({ yaw: -1, steer: -0.1, driver: 1, rider: 2 }),
    ];
    expect(seatOf(rides({ id: 1 }), rs)).toEqual({
      yaw: -1,
      pitch: 0.1,
      roll: -0.2,
      steer: -0.1,
      s: 0,
    });
    expect(seatOf(rides({ id: 2 }), rs)).toEqual({
      yaw: -1,
      pitch: 0.1,
      roll: -0.2,
      steer: -0.1,
      s: 1,
    });
    expect(seatOf(rides({ id: 9 }), rs)).toEqual({
      yaw: 0.5,
      pitch: 0.1,
      roll: -0.2,
      steer: 0.3,
      s: 1,
    });
    expect(seatOf(rides({ id: 3 }), rs)).toBeUndefined();
    expect(seatOf(rides({ id: 1 }))).toBeUndefined();
    expect(seatOf(man({ id: 1 }), rs)).toBeUndefined();
  });

  it('seats a runner in his rover from the first frame, where his state is, facing the nose', () => {
    const book = new Map<number, Runner>();
    const p = rides({ yaw: 2 });
    animate(book, [p], DT, undefined, undefined, [rover({ rider: 1 })]);
    const r = book.get(1)!;
    expect(r.seat?.s).toBe(1);
    const { s, yaw } = stance(r);
    expect(yaw).toBeCloseTo(0.5, 6);
    // Seated: the head a metre over the seat point, not 1.7 m.
    expect(s.pos[J.HEAD][1] - p.y).toBeLessThan(1.05);
    expect(s.pos[J.HEAD][1] - p.y).toBeGreaterThan(0.7);
    expect(Math.hypot(s.pos[J.PELVIS][0] - p.x, s.pos[J.PELVIS][2] - p.z)).toBeLessThan(0.3);
    // Out of it, he is on his feet again.
    for (let i = 0; i < 60; i++) {
      animate(book, [man()], DT, undefined, undefined, [rover()]);
    }
    expect(book.get(1)!.seat).toBeUndefined();
    expect(stance(book.get(1)!).s.pos[J.HEAD][1] - 1).toBeGreaterThan(1.45);
  });

  it('keeps both hands of the driver on the yoke and his weapons away, while a rider holds his', () => {
    const draw = (o: Partial<PlayerState>, seat: Partial<Rover>) => {
      const book = new Map<number, Runner>();
      animate(book, [rides(o)], DT, undefined, undefined, [rover(seat)]);
      const out: number[] = [];
      const s = soldier(out, book.get(1)!, [0.1, 0.8, 0.2])!;
      return { n: out.length / STRIDE, s };
    };
    const bare = draw({}, { driver: 1 }).n;
    for (const o of [
      { ammo: 5 },
      { railed: true, rail: 3 },
      { rifled: true },
      { blade: true, wield: true },
    ]) {
      const driver = draw(o, { driver: 1 });
      expect(driver.n).toBe(bare);
      // On the grips, either side of the column.
      expect(dist(driver.s.pos[J.HAND_L], driver.s.pos[J.HAND_R])).toBeLessThan(0.45);
      expect(dist(driver.s.pos[J.HAND_L], driver.s.pos[J.HAND_R])).toBeGreaterThan(0.25);
      expect(draw(o, { rider: 1 }).n).toBeGreaterThan(bare + 50);
    }
  });

  it("holds a rider's gun out from his seated eye, not from where a standing one would be", () => {
    const book = new Map<number, Runner>();
    let p = rides({ ammo: 5, yaw: 0.5 });
    const rs = [rover({ rider: 1, pitch: 0, roll: 0 })];
    animate(book, [p], DT, undefined, undefined, rs);
    for (let i = 0; i < 20; i++) {
      p = { ...p, shots: p.shots + (i == 5 ? 1 : 0) };
      animate(book, [p], DT, undefined, undefined, rs);
    }
    const { s } = stance(book.get(1)!);
    const hand = s.pos[J.HAND_R][1] - p.y;
    expect(hand).toBeGreaterThan(0.6);
    expect(hand).toBeLessThan(1.05);
    // By the head, not over it.
    expect(hand).toBeLessThan(s.pos[J.HEAD][1] - p.y + 0.12);
  });
});

describe('a runner shouldering a long gun (the user, 2026-11-10: it hung across the belly)', () => {
  /** The rail gun and the laser rifle: what the state holds, the model, and the middle of its butt plate in it. */
  const GUNS = [
    {
      name: 'rail gun',
      kind: 2,
      o: { rail: 100, railed: true },
      model: railgun(1),
      butt: [0, 0.0747, 0.392],
    },
    {
      name: 'laser rifle',
      kind: 3,
      o: { rifle: 60, rifled: true },
      model: rifle(1),
      butt: [0, 0.036, 0.336],
    },
  ];
  const POSES: [string, Partial<PlayerState>][] = [
    ['standing', {}],
    ['turned', { yaw: 2.2 }],
    ['running', { vz: -6 }],
    ['crouched', { mode: MODE.CROUCH }],
    ['crouched and moving', { mode: MODE.CROUCH, vz: -3 }],
    ['looking up', { pitch: 0.6 }],
    ['looking far up', { pitch: 1.1 }],
    ['looking down', { pitch: -0.6 }],
    ['looking far down', { pitch: -1.1 }],
    ['in the air', { mode: MODE.AIR, ground: false, vy: 2 }],
  ];
  const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
  const far = (a: number[], b: number[]) => Math.hypot(...sub(a, b));
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  /** The angle between two directions, radians. */
  const off = (a: number[], b: number[]) =>
    Math.acos(Math.min(1, dot(a, b) / Math.hypot(...a) / Math.hypot(...b)));
  /** The runner in the pose `o` through `n` more frames, firing on each when asked: his solved stance each frame. */
  const frames = (o: Partial<PlayerState>, fires: boolean, n = 24) => {
    const r = hold(o);
    const book = new Map([[1, r]]);
    return Array.from({ length: n }, (_, i) => {
      const p = { ...r.p, z: r.p.z + (o.vz ?? 0) * DT, shots: r.p.shots + +(fires && i % 6 == 0) };
      animate(book, [p], DT);
      return { p, s: stance(r).s };
    });
  };
  /** The gun in the right hand: a point of its model in the world, and its barrel's way. */
  const gunOf = (s: ReturnType<typeof solve>, kind: number) => {
    const q = s.rot[J.HAND_R];
    const [at, ax] = [grip(s.pos[J.HAND_R], q), frameOf(q)];
    const put = ([x, y, z]: number[]) =>
      at.map((v, i) => v + ax[0][i] * x + ax[1][i] * y - ax[2][i] * z);
    // The rail gun's barrel lies on the long axis, the rifle's along the model's forward.
    return { put, barrel: kind == 2 ? sub(tip(at, ax, 2), put(REAR)) : ax[2] };
  };
  /** `v` in the frame of joint `j`, from the point `o`. */
  const local = (s: ReturnType<typeof solve>, j: number, o: number[], v: number[]) =>
    turn(inv(s.rot[j]), sub(v, o) as Vec3);
  /**
   * Whether the point `v` is in the trunk, the helmet or the pack. The trunk in the chest's frame
   * from the middle of the shoulders at rest: as wide as them, from the hips to the top of the shoulders,
   * its front the armour's as drawn (15 cm ahead in the middle, 9 at the shoulder joints).
   */
  const inBody = (s: ReturnType<typeof solve>, v: number[]) => {
    // The shoulders' line at rest is 17 cm over the chest joint: an arm reaching out moves its own.
    const [x, y, z] = local(s, J.CHEST, add(s.pos[J.CHEST], turn(s.rot[J.CHEST], [0, 0.17, 0])), v);
    const trunk =
      Math.abs(x) < 0.2 &&
      y > -0.5 &&
      y < 0.08 &&
      z < 0.1 &&
      z > -0.075 - 0.075 * (1 - (x / 0.2) ** 2);
    const h = local(s, J.HEAD, s.pos[J.HEAD], v).map((a, i) => (a - SHELL.c[i]) / SCALE);
    const helmet = h.every((a, i) => Math.abs(a) < SHELL.r[i]) && h[1] > SHELL.rim - SHELL.c[1];
    const c = local(s, J.CHEST, s.pos[J.CHEST], v);
    return trunk || helmet || c.every((a, i) => Math.abs(a - PACK.c[i]) < PACK.r[i]);
  };
  /** Where the rig's rest puts the shoulder joint `j`: on its collarbone, unturned from the chest. */
  const socket = (s: ReturnType<typeof solve>, j: number) =>
    add(s.pos[j - 1], turn(s.rot[J.CHEST], REST[j]));
  /** The checks of a shouldered gun in the stance `s`, its barrel meant along `way`. */
  const shouldered = (s: ReturnType<typeof solve>, g: (typeof GUNS)[number], way: number[]) => {
    const { put, barrel } = gunOf(s, g.kind);
    // The butt plate in the hollow of the right shoulder, a hand's width from the joint at most.
    expect(far(put(g.butt), s.pos[J.ARM_R])).toBeLessThan(0.18);
    expect(off(barrel, way)).toBeLessThan(0.06);
    // The right hand is on the grip, which the gun is drawn from: the arm reaches it, not stretched.
    expect(far(s.pos[J.HAND_R], s.pos[J.ARM_R])).toBeLessThan(0.54);
    // The left is round the front grip, the rifle's handguard in its palm.
    const [at] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R], g.kind);
    const q = s.rot[J.HAND_L];
    const [fing, x] = [turn(q, [0, -1, 0]), turn(q, [1, 0, 0])];
    const [reach, palm] = g.kind == 3 ? RIFLE_HOLD : FIST;
    expect(
      far(
        s.pos[J.HAND_L].map((v, i) => v + fing[i] * reach + x[i] * palm),
        at,
      ),
    ).toBeLessThan(0.01);
    // Both elbows down: under the shoulder, or under the hand when it aims up over it.
    for (const j of [J.ARM_L, J.ARM_R]) {
      expect(s.pos[j + 1][1]).toBeLessThan(Math.max(s.pos[j][1], s.pos[j + 2][1]));
      // No arm stretches to its grip (the user, 2026-11-10): the shoulder is where the rig has
      // it, the collarbone not turned, the bones are their length and the elbow is bent.
      expect(far(s.pos[j], socket(s, j))).toBeLessThan(0.005);
      expect(far(s.pos[j], s.pos[j + 1])).toBeCloseTo(Math.hypot(...REST[j + 1]), 6);
      expect(far(s.pos[j + 1], s.pos[j + 2])).toBeCloseTo(Math.hypot(...REST[j + 2]), 6);
      const bend = off(sub(s.pos[j], s.pos[j + 1]), sub(s.pos[j + 2], s.pos[j + 1]));
      expect(bend).toBeGreaterThan(1.3);
      expect(bend).toBeLessThan(2.35);
    }
    // The butt in the pocket: before the joint, against the chest plate, a little inside it.
    const [bx, by, bz] = local(s, J.CHEST, s.pos[J.ARM_R], put(g.butt));
    expect(Math.abs(bx + 0.025)).toBeLessThan(0.03);
    expect(Math.abs(by + 0.01)).toBeLessThan(0.03);
    expect(bz).toBeLessThan(-0.1);
    expect(bz).toBeGreaterThan(-0.2);
    // Nothing of the gun in the trunk, the helmet or the pack.
    const inside = rows(g.model).filter(v => inBody(s, put(v))).length;
    expect(inside).toBe(0);
  };

  for (const g of GUNS) {
    for (const [name, o] of POSES) {
      for (const fires of [false, true]) {
        it(`holds the ${g.name} ${name}${fires ? ', firing' : ''}: the butt in the shoulder, the barrel along the look, a hand on each grip, clear of the body`, () => {
          for (const { p, s } of frames({ ...o, ...g.o }, fires)) {
            shouldered(s, g, basis(p.yaw, p.pitch)[2]);
          }
        });
      }
    }

    it(`carries the ${g.name} at the low ready in a sprint, the butt still in the shoulder, and brings it up to fire`, () => {
      for (const { p, s } of frames({ vz: -9, ...g.o }, false)) {
        // The barrel down and across to the left of the look.
        shouldered(s, g, basis(p.yaw + 0.35, -0.6)[2]);
      }
      for (const { p, s } of frames({ vz: -9, ...g.o }, true).slice(1)) {
        shouldered(s, g, basis(p.yaw, p.pitch)[2]);
      }
    });

    it(`follows the look with the ${g.name}, not the last shot: fired at the floor, then looking up`, () => {
      const book = new Map<number, Runner>();
      const at = (i: number) => man({ ...g.o, pitch: i < 30 ? -0.7 : 0.4, shots: Math.min(i, 30) });
      for (let i = 0; i < 120; i++) {
        animate(book, [at(i)], DT);
      }
      const { barrel } = gunOf(stance(book.get(1)!).s, g.kind);
      expect(off(barrel, basis(0, 0.4)[2])).toBeLessThan(0.06);
    });

    it(`keeps the muzzle of the ${g.name} as drawn, from the feet, for its shots to leave from`, () => {
      const r = hold({ ...g.o, yaw: 0.7, pitch: 0.2 });
      const s = soldier([], r, [0.1, 0.8, 0.2])!;
      const q = s.rot[J.HAND_R];
      const m = tip(grip(s.pos[J.HAND_R], q), frameOf(q), g.kind);
      expect(far(r.tip!, sub(m, [r.p.x, r.p.y, r.p.z]))).toBeLessThan(1e-9);
      // None with the gun, or with no gun in hand.
      const armed = hold({ ammo: 30 });
      soldier([], armed, [0.1, 0.8, 0.2]);
      expect(armed.tip).toBeUndefined();
    });
  }
});
