import { describe, expect, it } from 'vitest';
import { CUTS, DASH_COOLDOWN, EYE, LOW_EYE } from '../shared/constants';
import { STILL } from '../shared/physics';
import { CUT, MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { CAPSULE_HOLD, KATANA_LEFT, createBody } from './body';
import type { Body } from './body';
import {
  GUARD,
  RIFLE_GRIP,
  RIFLE_HOLD,
  LONG_HOLD,
  RIFLE_RISE,
  axes as gunAxes,
  foregrip,
  grip,
  loadFrame,
  swapOf,
} from './gun';
import { BEHIND, PARRY_IN, axes, ends } from './katana';
import { SHINE, STRIDE, add, basis, dot, sub, unit } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, turn } from './rig';
import { palette } from './skin';

const DT = 1 / 60;
const TEAM = [0.1, 0.8, 0.2];
const [, , , FLESH, , , , GLOVE] = palette(TEAM);
/** The vertical half of the field of view (70 degrees) and a wide screen. */
const [TAN, ASPECT, NEAR] = [Math.tan((35 * Math.PI) / 180), 16 / 9, 0.1];

const man = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...o,
});
const eyeOf = (p: PlayerState): Vec3 => [
  p.x,
  p.y + (p.mode == MODE.SLIDE || p.mode == MODE.CROUCH ? LOW_EYE : EYE),
  p.z,
];
const hang = man({
  mode: MODE.HANG,
  ground: false,
  y: 0.4,
  z: 5.43,
  wall: SIDE.NORTH,
  edge: 2.4,
});
const slide = man({ mode: MODE.SLIDE, vz: -8 });
const dash = man({ mode: MODE.AIR, ground: false, y: 0.3, vz: -16, dash: DASH_COOLDOWN - 2 });
const wall = man({ mode: MODE.WALLRUN, ground: false, y: 1.2, vz: -8, wall: SIDE.EAST });

/** A body that has watched `n` frames of `p`. */
const watch = (p: PlayerState, n: number, body = createBody()) => {
  for (let i = 0; i < n; i++) {
    body.update(p, DT);
  }
  return body;
};
const pose = (body: Body, p: PlayerState, pitch = 0) => body.pose(eyeOf(p), p.yaw, pitch)!;
/** A world point in the camera's right, up, forward. */
const local = (p: PlayerState, w: Vec3, pitch = 0): Vec3 => {
  const e = eyeOf(p);
  const d = [w[0] - e[0], w[1] - e[1], w[2] - e[2]];
  return basis(p.yaw, pitch).map(a => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]) as Vec3;
};
/** Whether a point in camera space is on a wide screen, and how far from the camera it must be to be drawn. */
const inside = ([x, y, z]: Vec3) =>
  z > 0 && Math.abs(x) < z * TAN * ASPECT && Math.abs(y) < z * TAN;
const seen = (l: Vec3) => inside(l) && l[2] > NEAR;
/** The hands, wrists in the camera's space. */
const hands = (p: PlayerState, body: Body, pitch = 0) => {
  const s = pose(body, p, pitch);
  return [J.HAND_L, J.HAND_R].map(j => local(p, s.pos[j], pitch));
};

interface Vert {
  at: Vec3;
  n: Vec3;
  c: number[];
}
/** The vertices drawn for a camera at the player's eye. */
const draw = (body: Body, p: PlayerState, pitch = 0, color = TEAM): Vert[] => {
  const out: number[] = [];
  body.draw(out, eyeOf(p), p.yaw, pitch, 0, color);
  expect(out.length % (3 * STRIDE)).toBe(0);
  return Array.from({ length: out.length / STRIDE }, (_, i) => {
    const v = out.slice(i * STRIDE, (i + 1) * STRIDE);
    return { at: [v[0], v[1], v[2]], n: [v[3], v[4], v[5]], c: [v[6], v[7], v[9]] };
  });
};
const away = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('the katana in both hands', () => {
  const blade = (o: Partial<PlayerState> = {}) =>
    man({ wield: true, blade: true, cut: CUT.THRUST, swing: 0, ...o });
  /** The cyan glow of the blade, its edge and its crackle (unlit, above 1). */
  const glow = (v: Vert[]) => v.filter(q => q.c[1] > 1.5);
  /** The raw vertices of a draw: for the layer, and for the trail (unlit with the normal up). */
  const raw = (body: Body, p: PlayerState) => {
    const out: number[] = [];
    body.draw(out, eyeOf(p), p.yaw, 0, 0, TEAM);
    return Array.from({ length: out.length / STRIDE }, (_, i) =>
      out.slice(i * STRIDE, (i + 1) * STRIDE),
    );
  };
  const trail = (body: Body, p: PlayerState) =>
    raw(body, p).filter(v => v[8] == -2 && v[3] == 0 && v[4] == 1 && v[5] == 0).length;
  /** A body that has stood with the katana for 60 frames, then been `ticks` ticks into a cut; and the player as of then. */
  const into = (cut: number, ticks: number, o: Partial<PlayerState> = {}) => {
    const body = watch(blade({ cut, ...o }), 60);
    let p = blade({ cut, ...o });
    for (let i = 0; i <= ticks; i++) {
      p = blade({ cut, swing: CUTS[cut].ticks - i, ...o });
      body.update(p, DT);
    }
    return { body, p };
  };
  /** The point of the blade in the camera's space, at `ticks` ticks into the cut. */
  const tipOf = (cut: number, ticks: number, o: Partial<PlayerState> = {}) => {
    const { body, p } = into(cut, ticks, o);
    const s = pose(body, p);
    return local(p, ends(s.pos[J.HAND_R], s.rot[J.HAND_R])[1]);
  };
  /** How far the left hand's grip is from its place on the handle, BEHIND the right hand's. */
  const leftOff = (body: Body, p: PlayerState) => {
    const s = pose(body, p);
    const [gr, ax] = [grip(s.pos[J.HAND_R], s.rot[J.HAND_R]), axes(s.rot[J.HAND_R])];
    const [fing, back] = [turn(s.rot[J.HAND_L], [0, -1, 0]), turn(s.rot[J.HAND_L], [1, 0, 0])];
    const gl = [0, 1, 2].map(
      i => s.pos[J.HAND_L][i] + fing[i] * KATANA_LEFT[0] + back[i] * KATANA_LEFT[1],
    ) as Vec3;
    return away(gl, gr.map((v, i) => v - BEHIND * ax[2][i]) as Vec3);
  };

  it('is not there without it, nor while down, and the gun is not drawn with it', () => {
    expect(glow(draw(watch(man(), 60), man()))).toHaveLength(0);
    expect(
      glow(draw(watch(man({ wield: true }), 60), man({ wield: true }))).length,
    ).toBeGreaterThan(200);
    const down = blade({ down: 60 });
    expect(watch(down, 60).pose(eyeOf(down), 0, 0)).toBeUndefined();
    // Wielding the katana with the gun in the bag: the same picture as without the gun.
    const [a, b] = [blade({ ammo: 30 }), blade()];
    expect(raw(watch(a, 60), a)).toHaveLength(raw(watch(b, 60), b).length);
  });

  it('rises from the bottom of the view, both fists on the grip low under it, more blade than hands', () => {
    const p = blade();
    const body = watch(p, 60);
    const s = pose(body, p);
    const tip = local(p, ends(s.pos[J.HAND_R], s.rot[J.HAND_R])[1]);
    expect(Math.abs(tip[0])).toBeLessThan(0.4);
    expect(tip[1]).toBeGreaterThan(0.45);
    expect(tip[2]).toBeGreaterThan(0.8);
    // The right fist at the bottom of the view, the left on the grip a hand below it, under the edge.
    const [l, r] = hands(p, body);
    expect(r[1]).toBeLessThan(-0.2);
    expect(l[1]).toBeLessThan(r[1]);
    expect(seen(r)).toBe(true);
    expect(seen(l)).toBe(false);
    expect(leftOff(body, p)).toBeLessThan(0.015);
    // Most of the blade's light is in the view: the straight wrists stand it up, its point out of the top.
    const g = glow(draw(body, p)).map(q => local(p, q.at));
    expect(g.filter(seen).length).toBeGreaterThan(g.length * 0.65);
  });

  it('keeps the wrists near straight and the elbows low in the guard', () => {
    const p = blade();
    const s = pose(watch(p, 60), p);
    for (const [arm, hand] of [
      [J.ARM_R, J.HAND_R],
      [J.ARM_L, J.HAND_L],
    ]) {
      const [e, w] = [s.pos[arm + 1], s.pos[hand]];
      // The left forearm near level, its wrist cocked under the grip: its elbow 2 cm up at most.
      expect(e[1]).toBeLessThan(w[1] + (hand == J.HAND_L ? 0.02 : 0));
      // The hand's axis carries on the forearm's line within 45 degrees.
      const fore = unit(w.map((v, i) => v - e[i]) as Vec3);
      const fing = turn(s.rot[hand], [0, -1, 0]);
      expect(fore[0] * fing[0] + fore[1] * fing[1] + fore[2] * fing[2]).toBeGreaterThan(
        Math.cos(Math.PI / 4),
      );
    }
  });

  it('moves the shoulders and the chest with the blade, not the forearms alone', () => {
    const guard = (() => {
      const p = blade();
      return pose(watch(p, 60), p);
    })();
    /** The chest's facing on the floor plane, radians to the left of the look. */
    const facing = (s: ReturnType<typeof pose>) => {
      const f = turn(s.rot[J.CHEST], [0, 0, -1]);
      return Math.atan2(-f[0], -f[2]);
    };
    // The slash raised over the head: the right shoulder up with the hands.
    const up = into(CUT.SLASH, Math.round(0.28 * CUTS[CUT.SLASH].ticks));
    const raised = pose(up.body, up.p);
    expect(raised.pos[J.ARM_R][1] - guard.pos[J.ARM_R][1]).toBeGreaterThan(0.03);
    // The cut from the left: the chest turned left in the wind-up, right in the follow-through.
    const [wind, after] = [8, 21].map(t => {
      const { body, p } = into(CUT.LEFT, t);
      return facing(pose(body, p));
    });
    expect(wind - facing(guard)).toBeGreaterThan(0.2);
    expect(after - facing(guard)).toBeLessThan(-0.2);
  });

  it('is held on the grip: the right hand is where the sword puts its grip, with the point at the end of the blade', () => {
    const p = blade();
    const body = watch(p, 60);
    const s = pose(body, p);
    const at = grip(s.pos[J.HAND_R], s.rot[J.HAND_R]);
    // The wrist is a hand's length from the grip, along the fingers.
    expect(away(s.pos[J.HAND_R], at)).toBeCloseTo(Math.hypot(0.078, 0.022), 2);
    // The farthest light from the grip is the point of the blade.
    const far = glow(draw(body, p)).reduce((m, q) => (away(q.at, at) > away(m.at, at) ? q : m));
    expect(away(far.at, ends(s.pos[J.HAND_R], s.rot[J.HAND_R])[1])).toBeLessThan(0.006);
  });

  it.each([
    [CUT.THRUST, 'thrusts: the point goes forward to the crosshair'],
    [CUT.LEFT, 'cuts from the left to the right'],
    [CUT.RIGHT, 'cuts from the right to the left'],
    [CUT.SLASH, 'slashes down through the middle'],
  ])('does cut %i: %s', (cut, _name) => {
    const { ticks, strike } = CUTS[cut];
    const path = Array.from({ length: ticks }, (_, i) => tipOf(cut, i));
    /** The tick at the share `k` of the swing. */
    const tick = (k: number) => Math.round(k * ticks);
    const at = path[strike];
    // Through the middle of the view at the strike, in front of the camera: within two ticks of it.
    const near = path.slice(strike - 2, strike + 3).map(v => Math.hypot(v[0], v[1]));
    expect(Math.min(...near)).toBeLessThan(0.15);
    expect(Math.abs(at[0])).toBeLessThan(0.4);
    expect(at[2]).toBeGreaterThan(1);
    if (cut == CUT.THRUST) {
      // Out: from the pull back to the strike, forward, and near its longest there.
      expect(path[strike][2]).toBeGreaterThan(path[tick(0.22)][2] + 0.15);
      expect(path[strike][2]).toBeGreaterThan(Math.max(...path.map(v => v[2])) - 0.12);
    } else if (cut == CUT.SLASH) {
      // Over the head, the blade upright, then down through the middle to far below the view.
      expect(path[tick(0.28)][1]).toBeGreaterThan(0.9);
      expect(path[tick(0.28)][2]).toBeLessThan(0.4);
      expect(path[strike - 2][1]).toBeGreaterThan(path[strike][1]);
      expect(path[strike][1]).toBeGreaterThan(path[strike + 2][1]);
      expect(path[tick(0.55)][1]).toBeLessThan(-0.7);
    } else {
      // On a diagonal: from high over the shoulder on one side, down across to low on the other.
      const sign = cut == CUT.LEFT ? 1 : -1;
      expect(sign * path[tick(0.24)][0]).toBeLessThan(-0.5);
      expect(path[tick(0.24)][1]).toBeGreaterThan(0.5);
      expect(sign * path[strike - 2][0]).toBeLessThan(sign * path[strike][0]);
      expect(sign * path[strike][0]).toBeLessThan(sign * path[strike + 2][0]);
      expect(path[strike - 2][1]).toBeGreaterThan(path[strike + 2][1]);
      expect(sign * path[tick(0.6)][0]).toBeGreaterThan(0.2);
      expect(path[tick(0.6)][1]).toBeLessThan(-0.2);
    }
    // And back at the guard at the end.
    const rest = tipOf(cut, CUTS[cut].ticks - 1);
    const guard = path[0];
    expect(away(rest, guard)).toBeLessThan(0.15);
  });

  it('brings the blade down across in the arc’s cut: from high on its side, through the middle, to low on the other', () => {
    for (const cut of [CUT.ARC_L, CUT.ARC_R]) {
      const { ticks, strike } = CUTS[cut];
      const path = Array.from({ length: ticks }, (_, i) => tipOf(cut, i));
      const tick = (k: number) => Math.round(k * ticks);
      const sign = cut == CUT.ARC_L ? 1 : -1;
      const show = (v: Vec3) => `cut ${cut}: ${v.map(c => c.toFixed(2))}`;
      // Raised high on its side in the wind-up.
      expect(sign * path[tick(0.3)][0], show(path[tick(0.3)])).toBeLessThan(-0.3);
      expect(path[tick(0.3)][1], show(path[tick(0.3)])).toBeGreaterThan(0.4);
      // Through the middle of the view at the strike, in front of the camera: within two ticks of it.
      const near = path.slice(strike - 2, strike + 3).map(v => Math.hypot(v[0], v[1]));
      expect(Math.min(...near), show(path[strike])).toBeLessThan(0.3);
      expect(path[strike][2]).toBeGreaterThan(0.8);
      // Down and across: falling and crossing over through the strike, low on the other side after.
      expect(path[strike - 2][1]).toBeGreaterThan(path[strike + 2][1]);
      expect(sign * path[strike - 2][0]).toBeLessThan(sign * path[strike + 2][0]);
      expect(sign * path[tick(0.65)][0], show(path[tick(0.65)])).toBeGreaterThan(0.2);
      expect(path[tick(0.65)][1], show(path[tick(0.65)])).toBeLessThan(-0.3);
    }
  });

  it('cuts with the arms and not the wrists: the right wrist straight, the left cocked at a set angle, through every cut', () => {
    for (const cut of Object.values(CUT)) {
      const body = watch(blade({ cut }), 60);
      const bends: number[] = [];
      const lefts: number[] = [];
      for (let i = 0; i < CUTS[cut].ticks; i++) {
        const p = blade({ cut, swing: CUTS[cut].ticks - i });
        body.update(p, DT);
        // The camera turns with a spin, as the game turns it.
        const s = body.pose(eyeOf(p), p.yaw + body.spun(), 0)!;
        // The forearm against the hand's axis, from the wrist to the knuckles, the left hand's too.
        const fore = sub(s.pos[J.HAND_R], s.pos[J.FOREARM_R]);
        const left = sub(s.pos[J.HAND_L], s.pos[J.FOREARM_L]);
        const cl = dot(unit(left), unit(turn(s.rot[J.HAND_L], [0, -1, 0])));
        lefts.push((Math.acos(Math.min(1, Math.max(-1, cl))) * 180) / Math.PI);
        const c = dot(unit(fore), unit(turn(s.rot[J.HAND_R], [0, -1, 0])));
        bends.push((Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI);
      }
      expect(Math.max(...bends), `cut ${cut}`).toBeLessThan(2);
      // The left wrist is cocked, its hand turned along the grip (KATANA_TILT): a set angle that
      // the cut hardly moves.
      expect(Math.min(...lefts), `cut ${cut}, left`).toBeGreaterThan(15);
      expect(Math.max(...lefts), `cut ${cut}, left`).toBeLessThan(30);
      expect(Math.max(...lefts) - Math.min(...lefts), `cut ${cut}, left`).toBeLessThan(8);
    }
  });

  it('keeps both hands on the grip through every cut, standing or running, the arms within their length', () => {
    for (const [cut, v] of [CUT.THRUST, CUT.LEFT, CUT.RIGHT, CUT.SLASH].flatMap(c => [
      [c, 0],
      [c, 6],
    ])) {
      const body = createBody();
      let z = 0;
      for (let i = 0; i < 60; i++) {
        body.update(blade({ cut, vz: -v, z: (z -= v * DT) }), DT);
      }
      for (let i = 0; i < CUTS[cut].ticks; i++) {
        const p = blade({ cut, swing: CUTS[cut].ticks - i, vz: -v, z: (z -= v * DT) });
        body.update(p, DT);
        // On the grip in the guard and all through the cut: within three centimetres, the left arm
        // reaching for a grip the straight right wrist holds (lock()).
        expect(leftOff(body, p)).toBeLessThan(0.03);
        const s = pose(body, p);
        for (const [h, a] of [
          [J.HAND_L, J.ARM_L],
          [J.HAND_R, J.ARM_R],
        ]) {
          expect(away(s.pos[h], s.pos[a])).toBeLessThan(0.56);
        }
      }
    }
  });

  it('keeps both hands on the grip on a run too, once it is drawn', () => {
    const p = blade({ vz: -8 });
    const body = createBody();
    for (let i = 0; i < 90; i++) {
      p.z -= 8 * DT;
      body.update(p, DT);
      if (i > 40) {
        expect(leftOff(body, p)).toBeLessThan(0.01);
      }
    }
    expect(glow(draw(body, p)).length).toBeGreaterThan(200);
  });

  it('draws the katana up from below when it is taken, and out of sight again when it goes', () => {
    const none = man();
    const body = watch(none, 60);
    const y = (p: PlayerState) => hands(p, body)[1][1];
    body.update(blade(), DT);
    const first = hands(blade(), body)[1][1];
    watch(blade(), 40, body);
    expect(hands(blade(), body)[1][1]).toBeGreaterThan(first + 0.2);
    watch(none, 40, body);
    expect(y(none)).toBeLessThan(-0.5);
    expect(glow(draw(body, none))).toHaveLength(0);
  });

  it('gives the hands to a ledge, a wall-run and a stumble, with no sword in them', () => {
    for (const o of [hang, wall, man({ stun: 40 })]) {
      const p = { ...o, wield: true, blade: true, cut: 0, swing: 0 };
      const body = watch(p, 60);
      const [l, r] = hands(p, body);
      const plain = watch(o, 60);
      const [pl, pr] = hands(o, plain);
      // The hand on the ledge, the wall or in the air goes where it goes empty-handed.
      expect(away(r, pr)).toBeLessThan(0.1);
      if (o != wall) {
        expect(away(l, pl)).toBeLessThan(0.1);
      }
      expect(glow(draw(body, p)).length).toBeLessThan(10);
    }
  });

  it('shows the cut in a trail of light: a ribbon through the cut, gone soon after', () => {
    const rest = blade();
    const body = watch(rest, 60);
    expect(trail(body, rest)).toBe(0);
    // Drawn every frame, as the game does: not at the wind-up, there at the strike.
    const seenAt: number[] = [];
    for (let i = 0; i < CUTS[CUT.LEFT].ticks; i++) {
      const p = blade({ cut: CUT.LEFT, swing: CUTS[CUT.LEFT].ticks - i });
      body.update(p, DT);
      seenAt.push(trail(body, p));
    }
    expect(seenAt[1]).toBe(0);
    expect(seenAt[7]).toBe(0);
    expect(seenAt[CUTS[CUT.LEFT].strike + 2]).toBeGreaterThan(30);
    // A quarter of a second after the last swing, the light is gone.
    for (let i = 0; i < 16; i++) {
      body.update(rest, DT);
      trail(body, rest);
    }
    expect(trail(body, rest)).toBe(0);
  });

  it('keeps the vertices finite and the geometry whole in every cut and state', () => {
    for (const o of [
      blade(),
      blade({ vz: -9 }),
      { ...slide, wield: true },
      { ...dash, wield: true },
    ]) {
      for (const cut of [0, 1, 2, 3]) {
        const body = watch({ ...o, cut }, 30);
        for (let i = 0; i < CUTS[cut].ticks; i += 3) {
          const p = { ...o, cut, swing: CUTS[cut].ticks - i };
          body.update(p, DT);
          const out: number[] = [];
          body.draw(out, eyeOf(p), p.yaw, 0.3, 0, TEAM);
          expect(out.length % (3 * STRIDE)).toBe(0);
          expect(out.every(Number.isFinite)).toBe(true);
        }
      }
    }
  }, 30_000);
});

describe('the fists chosen with a gun in the bag (the marine on 1)', () => {
  const count = (body: Body, p: PlayerState) => draw(body, p).length;

  it('draws no gun in his hands: the same picture as with no gun at all, from the start or after the gun', () => {
    const bare = man({ ammo: -1, fists: true });
    const none = count(watch(bare, 90), bare);
    for (const carried of [
      { ammo: 12 },
      { ammo: 12, rail: 30 },
      { ammo: 12, rifle: 30, clip: 20 },
    ]) {
      const gun = man(carried);
      const fists = man({ ...carried, fists: true });
      // The gun in hand is drawn: more than the bare hands.
      expect(count(watch(gun, 90), gun)).toBeGreaterThan(none);
      expect(count(watch(fists, 90), fists)).toBe(none);
      // Put away from the hand: it sinks out of the view and is gone.
      expect(count(watch(fists, 90, watch(gun, 90)), fists)).toBe(none);
      // The hands are where the bare ones are, not round a grip.
      const [a, b] = [hands(fists, watch(fists, 90)), hands(bare, watch(bare, 90))];
      expect(away(a[0], b[0])).toBeLessThan(1e-6);
      expect(away(a[1], b[1])).toBeLessThan(1e-6);
    }
  });
});

describe('the laser rifle in both hands', () => {
  const rifle = (o: Partial<PlayerState> = {}) =>
    man({ ammo: -1, rifle: 100, clip: 20, rifled: true, ...o });
  /** The poses the rifle is held in: looking level, down and up, crouched, on a run, as a shot kicks. */
  const POSES: [string, PlayerState, number, number][] = [
    ['level', rifle(), 0, 0],
    ['down', rifle(), -0.6, 0],
    ['up', rifle(), 0.5, 0],
    ['crouched', rifle({ mode: MODE.CROUCH }), 0, 0],
    ['crouched, up', rifle({ mode: MODE.CROUCH }), 0.5, 0],
    ['on a run', rifle({ vz: -6 }), 0, 0],
    ['firing', rifle(), 0, 1],
  ];

  it('holds the left hand under its handguard, the thumb along it and the hand across under it, in every pose', () => {
    for (const [name, p, pitch, kick] of POSES) {
      const body = createBody();
      for (let i = 0; i < 90; i++) {
        body.update(p, DT, kick);
      }
      const s = pose(body, p, pitch);
      const [at, g, across] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R], 3);
      const q = s.rot[J.HAND_L];
      const [fing, x, thumb] = [turn(q, [0, -1, 0]), turn(q, [1, 0, 0]), turn(q, [0, 0, -1])];
      const palm = add(
        add(s.pos[J.HAND_L], fing.map(v => v * RIFLE_HOLD[0]) as Vec3),
        x.map(v => v * RIFLE_HOLD[1]) as Vec3,
      );
      // Crouched the shoulder comes after the hand: it does not stop short of the handguard.
      expect(away(palm, at), name).toBeLessThan(0.005);
      expect(dot(thumb, g), name).toBeGreaterThan(0.9);
      expect(dot(fing, across!), name).toBeGreaterThan(0.9);
    }
  });

  it('carries the handguard in the palm, the fingers up its right side and the thumb closed on its left, none through it', () => {
    // The rifle's section where the hand is, in its own right and up, along its underside: the
    // handguard, a block GUARD round RIFLE_GRIP, under a body as wide.
    const [HALF, UNDER] = [GUARD[0] + 0.001, RIFLE_GRIP[1] - GUARD[1]];
    for (const [name, p, pitch, kick] of POSES) {
      const body = createBody();
      for (let i = 0; i < 90; i++) {
        body.update(p, DT, kick);
      }
      const s = pose(body, p, pitch);
      const at = grip(s.pos[J.HAND_R], s.rot[J.HAND_R], 3);
      const ax = gunAxes(s.rot[J.HAND_R], 3);
      const hand = draw(body, p, pitch)
        .filter(v => [GLOVE, FLESH].some(c => c.every((n, i) => v.c[i] == n)))
        .filter(v => away(v.at, s.pos[J.HAND_L]) < 0.16)
        .map(v => ax.map(a => dot(sub(v.at, at), a)))
        .filter(([, , f]) => f > 0.05)
        .map(([r, u, f]) => [r, u - RIFLE_RISE * (f + RIFLE_GRIP[2]), f]);
      /** How deep a point is in the rifle: negative outside. */
      const deep = ([r, u]: number[]) => Math.min(HALF - Math.abs(r), u - UNDER);
      expect(Math.max(...hand.map(deep)), name).toBeLessThan(0.008);
      // The palm on the block's underside, across its whole width.
      const under = hand.filter(([r, u]) => Math.abs(r) < HALF && u < UNDER);
      expect(Math.min(...under.map(([, u]) => UNDER - u)), name).toBeLessThan(0.003);
      expect(Math.max(...under.map(([r]) => r)), name).toBeGreaterThan(HALF - 0.005);
      expect(Math.min(...under.map(([r]) => r)), name).toBeLessThan(0.005 - HALF);
      // The fingers on the right flank and the thumb on the left one, both up past the block.
      for (const side of [1, -1]) {
        const on = hand.filter(
          ([r, u]) => r * side > HALF && r * side < HALF + 0.03 && u > UNDER + 0.01,
        );
        expect(Math.min(...on.map(([r]) => r * side - HALF)), name).toBeLessThan(0.003);
        expect(Math.max(...on.map(([, u]) => u)), name).toBeGreaterThan(UNDER + 0.03);
      }
    }
  });
});

describe('the rail gun in both hands', () => {
  it('holds the left hand round its front grip, the thumb up toward the barrel, looking level, down or up', () => {
    const body = watch(man({ rail: 100, railed: true }), 90);
    for (const pitch of [0, -0.6, 0.5]) {
      const s = body.pose([0, EYE, 0], 0, pitch)!;
      const [at, g] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R]);
      const q = s.rot[J.HAND_L];
      const [fing, x, thumb] = [turn(q, [0, -1, 0]), turn(q, [1, 0, 0]), turn(q, [0, 0, -1])];
      const palm = add(
        add(s.pos[J.HAND_L], fing.map(v => v * LONG_HOLD[0]) as Vec3),
        x.map(v => v * LONG_HOLD[1]) as Vec3,
      );
      expect(away(palm, at)).toBeLessThan(0.015);
      expect(dot(thumb, g)).toBeGreaterThan(0.7);
      expect(g[1]).toBeGreaterThan(0.6);
    }
  });
  it('closes the left hand round the capsule as it screws a new one in, not beside it', () => {
    for (const reload of [34, 30, 26, 21, 17, 13]) {
      const p = man({ rail: 100, railed: true, reload });
      const body = watch(p, 90);
      const s = pose(body, p);
      const [foot, [, , up]] = loadFrame(
        grip(s.pos[J.HAND_R], s.rot[J.HAND_R], 2),
        gunAxes(s.rot[J.HAND_R], 2),
        2,
        swapOf(p),
      );
      const q = s.rot[J.HAND_L];
      const hollow = add(
        add(s.pos[J.HAND_L], turn(q, [0, -1, 0]).map(v => v * CAPSULE_HOLD[0]) as Vec3),
        turn(q, [1, 0, 0]).map(v => v * CAPSULE_HOLD[1]) as Vec3,
      );
      // The capsule's axis through the hollow of the hand, between its base and its cap.
      const d = sub(hollow, foot);
      const t = dot(d, up);
      expect(t, `reload ${reload}`).toBeGreaterThan(0.02);
      expect(t, `reload ${reload}`).toBeLessThan(0.06);
      expect(Math.hypot(...sub(d, up.map(v => v * t) as Vec3)), `reload ${reload}`).toBeLessThan(
        0.006,
      );
    }
  });

  /** The polished metal drawn: the gun's, none when it is put away. */
  const metal = (body: Body, p: PlayerState) => {
    const out: number[] = [];
    body.draw(out, eyeOf(p), p.yaw, 0, 0, TEAM);
    return out.filter((_, i) => i % STRIDE == 8).filter(l => l == SHINE).length;
  };

  it('puts it away on a wall-run: a hand on the wall, the other swinging with the stride', () => {
    for (const side of [SIDE.EAST, SIDE.WEST]) {
      const p = { ...wall, wall: side, rail: 100, railed: true };
      const body = watch(p, 90);
      expect(metal(body, p)).toBe(0);
      // The hand away from the wall goes forward and back over a stride.
      const free = side == SIDE.EAST ? 0 : 1;
      const ahead: number[] = [];
      for (let i = 0; i < 60; i++) {
        body.update(p, DT);
        ahead.push(hands(p, body)[free][2]);
      }
      expect(Math.max(...ahead) - Math.min(...ahead)).toBeGreaterThan(0.15);
    }
  });

  it('puts the assault rifle away on a wall-run, freeing both hands for the wall animation', () => {
    for (const side of [SIDE.EAST, SIDE.WEST]) {
      const p = { ...wall, wall: side, ammo: -1, rifle: 100, clip: 20, rifled: true };
      const body = watch(p, 90);
      expect(metal(body, p)).toBe(0);
      const plain = watch({ ...wall, wall: side }, 90);
      const [left, right] = hands(p, body);
      const [plainLeft, plainRight] = hands({ ...wall, wall: side }, plain);
      expect(away(left, plainLeft)).toBeLessThan(0.1);
      expect(away(right, plainRight)).toBeLessThan(0.1);
    }
  });

  it('takes it back in both hands on a wall while its bolt goes out, the wall on either side', () => {
    for (const side of [SIDE.EAST, SIDE.WEST]) {
      const p = { ...wall, wall: side, rail: 100, railed: true, zapping: true };
      const body = watch(p, 90);
      expect(metal(body, p)).toBeGreaterThan(100);
      const s = pose(body, p);
      const [at] = foregrip(s.pos[J.HAND_R], s.rot[J.HAND_R]);
      const q = s.rot[J.HAND_L];
      const palm = add(
        add(s.pos[J.HAND_L], turn(q, [0, -1, 0]).map(v => v * LONG_HOLD[0]) as Vec3),
        turn(q, [1, 0, 0]).map(v => v * LONG_HOLD[1]) as Vec3,
      );
      // 15.4 mm with the grip held further into the hand (LONG_HOLD).
      expect(away(palm, at)).toBeLessThan(0.016);
    }
  });
});

describe('the parry', () => {
  it('lays the katana along the view’s diagonal, from the bottom right to the top left, and back', () => {
    const p = man({ blade: true, wield: true, ammo: -1 });
    /** On the screen (-1 to 1 each way): where the katana's line meets its bottom edge and its top edge, and the right fist. */
    const line = (body: Body) => {
      const s = pose(body, p);
      const [b, t] = ends(s.pos[J.HAND_R], s.rot[J.HAND_R]).map(v => {
        const [x, y, z] = local(p, v);
        return [x / (z * TAN * ASPECT), y / (z * TAN)];
      });
      const k = (t[1] - b[1]) / (t[0] - b[0]);
      return { bottom: b[0] + (-1 - b[1]) / k, top: b[0] + (1 - b[1]) / k, base: b };
    };
    const body = watch(p, 60);
    const guard = line(body);
    body.parried();
    body.update(p, PARRY_IN);
    const block = line(body);
    expect(block.bottom).toBeGreaterThan(0.4);
    expect(block.top).toBeLessThan(-0.5);
    // The guard (the blade ahead and up) is nothing like it.
    expect(guard.top).toBeGreaterThan(-0.2);
    // Back in the guard once it is over.
    body.update(p, 1);
    expect(line(body).top).toBeCloseTo(guard.top, 2);
  });
});
