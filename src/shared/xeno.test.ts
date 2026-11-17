import { describe, expect, it } from 'vitest';
import { IDLE, duo } from '../../test/teams';
import {
  ARMOR_MAX,
  BLOW,
  CLING_WALK,
  CUTS,
  GLORY_DASH,
  GLORY_FAR,
  EXEC,
  GLORY_HP,
  GLORY_PUSH,
  GLORY_TICKS,
  RUN_SPEED,
  SPRINT_SPEED,
  STING,
  TAILS,
  TAIL_LEAP,
  XENO_CLAW,
  HP_MAX,
  DASH_COOLDOWN,
  DASH_SPEED,
  DASH_TICKS,
  POUNCE_HP,
  POUNCE_STUN,
  TACKLE_COOLDOWN,
  XENO_DASH,
  XENO_HP,
  XENO_PACE,
  WALL_KICK_SPEED,
  HEAVY_MAX,
  TAIL_HP,
} from './constants';
import { swingOf } from './blade';
import { STRIKE, step } from './gun';
import { KITS, ROLE } from './kit';
import { ROOFTOPS } from './map';
import { STILL, move } from './physics';
import { FRAG, decodeSnapshot, encodeSnapshot } from './protocol';
import { Room } from './room';
import { glory, pouncing } from './tackle';
import { CUT, KEY, LIMB, MODE, TEX } from './types';
import type { Conn, Input, PlayerState } from './types';
import { build } from './world';
import type { Brush } from './world';

const [MARINE, XENO] = [KITS[ROLE.MARINE], KITS[ROLE.XENO]];
/** Its walk on a wall. */
const WALK = XENO.run * CLING_WALK;
type Vec3 = [number, number, number];
const box = (min: Vec3, max: Vec3): Brush => ({ min, max, top: TEX.TILE, side: TEX.BRICK });
/** A ground at y = 0, a block 5 m high from x = 1 to 4 and z = -10 to 10, and far off a tower 30 m high. */
const pit = build({
  brushes: [
    box([-100, -5, -100], [100, 0, 100]),
    box([1, 0, -10], [4, 5, 10]),
    box([-60, 0, -10], [-50, 30, 10]),
  ],
  teams: duo([[-20, 0, 50, 0]]),
  floor: -50,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
});
/** Yaws that look toward +x and -x. */
const [EAST, WEST] = [(3 * Math.PI) / 2, Math.PI / 2];
const at = (x: number, y: number, over: Partial<PlayerState> = {}): PlayerState => ({
  id: 0,
  x,
  y,
  z: 0,
  vy: 0,
  yaw: EAST,
  pitch: 0,
  ground: y == 0,
  ...STILL,
  ...over,
});
const go = (p: PlayerState, keys: number, yaw = p.yaw, pitch = 0, kit = XENO) =>
  move(p, { seq: 0, keys, yaw, pitch }, pit, 0, [], kit);
/** Running: forward with the sprint, which a wall is taken hold of with. */
const RUN = KEY.FORWARD | KEY.SPRINT;
/** One step of the xenomorph's weapons on the open ground. */
const hit = (p: PlayerState, keys: number, yaw = 0) =>
  step(p, { seq: 0, keys, yaw, pitch: 0 }, pit, 0, true, [], XENO);

describe('its speed and its jumps', () => {
  it('runs a little faster than a man, gets there as fast, and jumps twice as high', () => {
    const top = (kit: typeof XENO, keys: number) => {
      const p = at(-20, 0, { z: 50, yaw: 0 });
      let t = 0;
      for (let k = 0; k < 400; k++) {
        go(p, keys, 0, 0, kit);
        t = -p.vz < (keys & KEY.SPRINT ? kit.sprint : kit.run) - 0.01 ? k : t;
      }
      return [-p.vz, t];
    };
    const [[xr, xt], [mr, mt]] = [top(XENO, KEY.FORWARD), top(MARINE, KEY.FORWARD)];
    expect(xr).toBeCloseTo(XENO_PACE * mr, 4);
    expect(xt).toBe(mt);
    const [[xs, xst], [ms, mst]] = [top(XENO, RUN), top(MARINE, RUN)];
    expect(xs).toBeCloseTo(XENO_PACE * ms, 4);
    // A little only (the user, 2026-11-16): twice a man's speed left no one a chance.
    expect(XENO_PACE).toBeLessThan(1.5);
    expect(xst).toBe(mst);
    const peak = (kit: typeof XENO) => {
      const p = at(-20, 0, { z: 50 });
      go(p, KEY.JUMP, 0, 0, kit);
      let y = 0;
      for (let k = 0; k < 120; k++) {
        go(p, 0, 0, 0, kit);
        y = Math.max(y, p.y);
      }
      return y;
    };
    expect(peak(XENO) / peak(MARINE)).toBeCloseTo(2, 1);
  });
});

describe('the xenomorph on a wall', () => {
  it('clings to a wall it walks into, climbs it and pulls itself up onto its top', () => {
    const p = at(0, 0);
    const modes = new Set<number>();
    for (let k = 0; k < 200 && !(p.mode === MODE.GROUND && p.y > 4); k++) {
      go(p, RUN);
      modes.add(p.mode);
    }
    expect([...modes]).toEqual(expect.arrayContaining([MODE.CLING, MODE.CLIMB]));
    expect(p.mode).toBe(MODE.GROUND);
    expect(p.y).toBe(5);
    expect(p.x).toBeGreaterThan(1);
    // The marine walks into the same wall and stays at its foot.
    const m = at(0, 0);
    for (let k = 0; k < 200; k++) {
      go(m, RUN, EAST, 0, MARINE);
      expect(m.mode).not.toBe(MODE.CLING);
    }
    expect(m.y).toBe(0);
  });

  it('takes hold of a wall only running into it: forward without the sprint walks into it', () => {
    const p = at(0, 0);
    for (let k = 0; k < 100; k++) {
      go(p, KEY.FORWARD);
      expect(p.mode).not.toBe(MODE.CLING);
    }
    expect(p.y).toBe(0);
    go(p, RUN);
    expect(p.mode).toBe(MODE.CLING);
    const q = at(0.2, 2, { mode: MODE.AIR, ground: false });
    go(q, KEY.FORWARD);
    expect(q.mode).not.toBe(MODE.CLING);
    go(q, RUN);
    expect(q.mode).toBe(MODE.CLING);
    // On the wall, the sprint can go: it climbs on.
    const y = q.y;
    go(q, KEY.FORWARD);
    expect([q.mode, q.y > y]).toEqual([MODE.CLING, true]);
  });

  it('takes hold of a wall it faces in the air, not one beside it', () => {
    const p = at(0.2, 2, { mode: MODE.AIR, ground: false });
    go(p, RUN);
    expect(p.mode).toBe(MODE.CLING);
    // Along the wall, looking along it: no hold.
    const q = at(0.2, 2, { mode: MODE.AIR, ground: false, yaw: 0 });
    go(q, RUN, 0);
    expect(q.mode).not.toBe(MODE.CLING);
  });

  it('goes down and along it, stays put with no key, lets go on crouch and kicks off on a jump', () => {
    const p = at(0.2, 3, { mode: MODE.AIR, ground: false });
    go(p, RUN);
    expect(p.mode).toBe(MODE.CLING);
    const y = p.y;
    go(p, 0);
    expect(p.y).toBe(y);
    go(p, KEY.BACK);
    expect(p.y).toBeCloseTo(y - WALK / 60, 4);
    // Facing +x, the right is +z; looking away from the wall, the right is -z.
    const z = p.z;
    go(p, KEY.RIGHT);
    expect(p.z).toBeGreaterThan(z);
    go(p, KEY.RIGHT, WEST);
    expect(p.z).toBeCloseTo(z, 5);
    expect(p.mode).toBe(MODE.CLING);
    // A jump looking away and up, out of the wall as the turned view sees it: off it, and down.
    go(p, KEY.JUMP, WEST, 1.2);
    expect(p.mode).toBe(MODE.AIR);
    expect(p.vx).toBeLessThan(-5);
    expect(p.vy).toBeLessThan(0);
    // It does not take hold of the wall it kicked off before it lands.
    for (let k = 0; k < 5; k++) {
      go(p, RUN, EAST);
      expect(p.mode).not.toBe(MODE.CLING);
    }
    const q = at(0.2, 3, { mode: MODE.AIR, ground: false });
    go(q, RUN);
    go(q, KEY.CROUCH);
    expect(q.mode).toBe(MODE.AIR);
  });

  it('takes its wall for a floor: W goes where the look heads on it, A and D across (the user, 2026-11-16)', () => {
    // On the wall east of it, +z is along it to the right; yaw π looks toward +z.
    const on = () => {
      const p = at(0.2, 3, { mode: MODE.AIR, ground: false });
      go(p, RUN);
      expect(p.mode).toBe(MODE.CLING);
      return p;
    };
    const SOUTH = Math.PI;
    let p = on();
    let [y, z] = [p.y, p.z];
    go(p, KEY.FORWARD, SOUTH);
    expect(p.z - z).toBeCloseTo(WALK / 60, 4);
    expect(p.y).toBeCloseTo(y, 5);
    // Looking that way, the right is down the wall and the left up it.
    [y, z] = [p.y, p.z];
    go(p, KEY.RIGHT, SOUTH);
    expect(p.y - y).toBeCloseTo(-WALK / 60, 4);
    expect(p.z).toBeCloseTo(z, 5);
    go(p, KEY.LEFT, SOUTH);
    expect(p.y).toBeCloseTo(y, 4);
    // Half way between the wall and along it: up and along at once, no faster than straight up.
    p = on();
    [y, z] = [p.y, p.z];
    go(p, KEY.FORWARD, (EAST + 2 * Math.PI + SOUTH) / 2 - Math.PI);
    const [dy, dz] = [p.y - y, p.z - z];
    expect(dy).toBeGreaterThan(0.03);
    expect(dz).toBeGreaterThan(0.03);
    expect(Math.sqrt(dy * dy + dz * dz)).toBeCloseTo(WALK / 60, 4);
    // Two keys at once go no faster than one.
    p = on();
    [y, z] = [p.y, p.z];
    go(p, KEY.FORWARD | KEY.RIGHT);
    expect(Math.sqrt((p.y - y) ** 2 + (p.z - z) ** 2)).toBeCloseTo(WALK / 60, 4);
  });

  it('walks on a wall, and with the sprint key runs as on a floor (the user, 2026-11-16)', () => {
    // Up the tower from a stand on it: a walk, slower than a man runs.
    const p = at(-49.8, 2, { mode: MODE.AIR, ground: false, yaw: WEST });
    go(p, RUN, WEST);
    expect(p.mode).toBe(MODE.CLING);
    let y = p.y;
    go(p, KEY.FORWARD, WEST);
    expect((p.y - y) * 60).toBeCloseTo(WALK, 3);
    expect(WALK).toBeLessThan(RUN_SPEED);
    // The sprint key: its run at once, then its sprint got to as on a floor, faster than a man's.
    y = p.y;
    go(p, RUN, WEST);
    expect((p.y - y) * 60).toBeCloseTo(XENO.run, 3);
    expect(XENO.sprint).toBeGreaterThan(SPRINT_SPEED);
    const g = at(-20, 0, { z: 50, yaw: 0 });
    let [t, tg] = [0, 0];
    for (let k = 0; k < 90; k++) {
      y = p.y;
      go(p, RUN, WEST);
      go(g, RUN, 0);
      t = (p.y - y) * 60 < XENO.sprint - 0.01 ? k : t;
      tg = -g.vz < XENO.sprint - 0.01 ? k : tg;
    }
    expect(p.mode).toBe(MODE.CLING);
    expect((p.y - y) * 60).toBeCloseTo(XENO.sprint, 3);
    expect(Math.abs(t - tg)).toBeLessThanOrEqual(8);
    // The sprint let go, it falls back to its walk.
    for (let k = 0; k < 45; k++) {
      y = p.y;
      go(p, KEY.FORWARD, WEST);
    }
    expect(p.mode).toBe(MODE.CLING);
    expect((p.y - y) * 60).toBeCloseTo(WALK, 3);
  });

  it('runs on up a wall at the speed it ran into it', () => {
    const p = at(-30, 0, { yaw: EAST });
    let v = 0;
    for (let k = 0; k < 300 && p.mode !== MODE.CLING; k++) {
      v = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
      go(p, RUN);
    }
    expect(p.mode).toBe(MODE.CLING);
    expect(v).toBeGreaterThan(XENO.run + 1);
    const y = p.y;
    go(p, RUN);
    expect((p.y - y) * 60).toBeGreaterThan(v - 0.1);
  });

  it('leaps where the view turned over onto the wall looks (the user, 2026-11-16, after Aliens versus Predator)', () => {
    const jump = (yaw: number, pitch: number) => {
      const p = at(0.2, 3, { mode: MODE.AIR, ground: false });
      go(p, RUN);
      expect(p.mode).toBe(MODE.CLING);
      go(p, KEY.JUMP, yaw, pitch);
      expect(p.mode).toBe(MODE.AIR);
      return [p.vx, p.vy, p.vz];
    };
    // Looking at the wall, the view looks up it: up, pushed off it.
    let [vx, vy, vz] = jump(EAST, 0);
    expect(vy).toBeGreaterThan(8);
    expect(vx).toBeLessThanOrEqual(-WALL_KICK_SPEED / 2 + 1e-4);
    expect(Math.abs(vz)).toBeLessThan(1e-4);
    // Looking along it (toward +z), along it.
    [vx, vy, vz] = jump(Math.PI, 0);
    expect(vz).toBeGreaterThan(8);
    expect(Math.abs(vy)).toBeLessThan(1);
    // Looking away from it, down it.
    [vx, vy, vz] = jump(WEST, 0);
    expect(vy).toBeLessThan(-8);
    expect(vx).toBeLessThan(0);
  });

  it('walks down off the wall onto the floor', () => {
    const p = at(0.2, 0.5, { mode: MODE.AIR, ground: false });
    go(p, RUN);
    expect(p.mode).toBe(MODE.CLING);
    for (let k = 0; k < 20 && p.mode === MODE.CLING; k++) {
      go(p, KEY.BACK);
    }
    expect(p.mode).toBe(MODE.GROUND);
    expect(p.y).toBe(0);
  });

  it('climbs a tower as high as it goes, with no time limit', () => {
    const p = at(-49.5, 0, { yaw: WEST });
    for (let k = 0; k < 500 && p.y < 29; k++) {
      go(p, RUN, WEST);
    }
    expect(p.y).toBeGreaterThan(29);
  });
});

describe('the dash (the user, 2026-11-16: a man’s, further and three in a row, no charged pounce)', () => {
  /** Metres a dash on the open ground carries the kit, from a stand, until it stops. */
  const reach = (kit = XENO) => {
    const p = at(-20, 0, { z: 50, yaw: 0 });
    go(p, KEY.DASH, 0, 0, kit);
    for (let k = 0; k < DASH_COOLDOWN; k++) {
      go(p, 0, 0, 0, kit);
    }
    return 50 - p.z;
  };

  it('dashes on a press, as a man does, XENO_DASH as fast: further, and nothing charges', () => {
    const p = at(-20, 0, { z: 50, yaw: 0 });
    go(p, KEY.DASH, 0);
    expect([p.mode, p.dash, p.charge ?? 0]).toEqual([MODE.GROUND, DASH_COOLDOWN, 0]);
    expect(-p.vz).toBeCloseTo(DASH_SPEED * XENO_DASH, 3);
    expect(pouncing(p)).toBe(true);
    // Held: no more than the one dash, and no leap when let go.
    for (let k = 0; k < 40; k++) {
      go(p, KEY.DASH, 0);
    }
    go(p, 0, 0);
    expect([p.mode, p.charge ?? 0]).toEqual([MODE.GROUND, 0]);
    expect(reach() - reach(MARINE)).toBeGreaterThan(1);
    // A step of the burst stays under the player's radius: it cannot tunnel through a thin brush.
    expect((DASH_SPEED * XENO_DASH) / 60).toBeLessThan(0.4);
  });

  it('dashes toward the keys held (the double tap of A or D)', () => {
    for (const [keys, side] of [
      [KEY.RIGHT, 1],
      [KEY.LEFT, -1],
    ]) {
      const p = at(-20, 0, { z: 50, yaw: 0 });
      go(p, keys | KEY.DASH, 0);
      expect(p.vx * side).toBeCloseTo(DASH_SPEED * XENO_DASH, 3);
      expect(Math.abs(p.vz)).toBeLessThan(1e-3);
    }
  });

  it('chains three dashes in a row, on the ground and in the air, then waits the cooldown', () => {
    const chain = (y: number) => {
      const p = at(-20, y, { z: 50, yaw: 0, dashes: 3 });
      p.mode = y ? MODE.AIR : MODE.GROUND;
      let dashes = 0;
      for (let k = 0; k < 70; k++) {
        go(p, k % 2 ? 0 : KEY.DASH, 0);
        dashes += +(p.dash === DASH_COOLDOWN);
      }
      return dashes;
    };
    expect(chain(0)).toBe(3);
    expect(chain(20)).toBe(3);
    // The marine dashes once in the air.
    const m = at(-20, 20, { z: 50, yaw: 0, mode: MODE.AIR, ground: false, dashes: 1 });
    let n = 0;
    for (let k = 0; k < 70; k++) {
      go(m, k % 2 ? 0 : KEY.DASH, 0, 0, MARINE);
      n += +(m.dash === DASH_COOLDOWN);
    }
    expect(n).toBe(1);
  });

  it('goes on the wire: the cling and the charge', () => {
    const p = {
      ...at(0.2, 3, { mode: MODE.CLING, wall: 1, charge: 20, hp: XENO_HP }),
      ack: 0,
      by: 0,
    };
    const back = decodeSnapshot(encodeSnapshot({ tick: 1, players: [p], ...IDLE }))!.players[0];
    expect([back.mode, back.wall, back.charge, back.hp]).toEqual([MODE.CLING, 1, 20, XENO_HP]);
    for (const mode of Object.values(MODE)) {
      const q = decodeSnapshot(encodeSnapshot({ tick: 1, players: [{ ...p, mode }], ...IDLE }))!;
      expect(q.players[0].mode).toBe(mode);
    }
  });
});

describe('the claws and the tail', () => {
  it('swipes left then right while FIRE goes on', () => {
    const p = at(-20, 0, { z: 50, yaw: 0 });
    const cuts: number[] = [];
    let strikes = 0;
    for (let k = 0; k < 60; k++) {
      strikes += +(hit(p, KEY.FIRE) === STRIKE.CUT);
      if (cuts.at(-1) !== p.cut) {
        cuts.push(p.cut!);
      }
    }
    expect(cuts.slice(0, 3)).toEqual([BLOW.CLAW_L, BLOW.CLAW_R, BLOW.CLAW_L]);
    expect(strikes).toBeGreaterThanOrEqual(3);
  });

  it('strikes with the tail on the right button as the keys say: a stab, a sweep, a lash', () => {
    for (const [keys, cut] of [
      [KEY.FORWARD, STING.STAB],
      [KEY.LEFT, STING.SWEEP_L],
      [KEY.RIGHT, STING.SWEEP_R],
      [0, STING.LASH],
      [KEY.BACK, STING.LASH],
    ]) {
      const p = at(-20, 0, { z: 50, yaw: 0 });
      hit(p, KEY.BLADE | keys);
      expect([p.cut, p.swing]).toEqual([cut, TAILS[cut].ticks]);
      // A tap: it runs on to its strike, slower than any cut of the katana.
      let n = 1;
      while (hit(p, 0) !== STRIKE.CUT) {
        n++;
      }
      expect(n).toBe(TAILS[cut].strike);
      expect(n).toBeGreaterThan(Math.max(...CUTS.slice(0, 4).map(c => c.strike)));
    }
  });

  it('charges the tail at the top of its wind-up while the right button is held', () => {
    const p = at(-20, 0, { z: 50, yaw: 0 });
    const { hold, ticks } = TAILS[STING.STAB];
    for (let k = 0; k < hold + 40; k++) {
      hit(p, KEY.BLADE | KEY.FORWARD);
    }
    expect(p.swing).toBe(ticks - hold);
    expect(p.charge).toBe(39);
    // Let go: the heavy release, its own timer, the charge kept for its strength; no pounce from it.
    hit(p, 0);
    expect([p.heavy, p.charge, p.mode, p.dash]).toEqual([true, 39, MODE.GROUND, 0]);
    expect(p.swing).toBe(swingOf(p, TAILS).ticks);
    expect(swingOf(p, TAILS).reach).toBeGreaterThan(TAILS[STING.STAB].reach);
    let n = 1;
    while (hit(p, 0) !== STRIKE.CUT) {
      n++;
    }
    expect(n).toBe(swingOf(p, TAILS).strike);
    expect(p.charge).toBe(39);
    // Over, the charge is gone and the next strike starts.
    while (p.swing) {
      hit(p, 0);
    }
    expect([p.heavy, p.charge]).toEqual([false, 0]);
    hit(p, KEY.BLADE);
    expect([p.cut, p.swing]).toEqual([STING.LASH, TAILS[STING.LASH].ticks]);
    // DASH charges nothing: the tail strikes out of a dash.
    const q = at(-20, 0, { z: 50, yaw: 0 });
    hit(q, KEY.DASH);
    hit(q, KEY.DASH | KEY.BLADE);
    expect([q.swing, q.charge ?? 0]).toEqual([TAILS[STING.LASH].ticks, 0]);
  });

  it('turns a double click into its special: the spin for a sweep, the leap for a stab or a lash', () => {
    const p = at(-20, 0, { z: 50, yaw: 0 });
    hit(p, KEY.BLADE | KEY.SPECIAL | KEY.LEFT);
    expect(p.cut).toBe(STING.SPIN);
    const q = at(-20, 0, { z: 50, yaw: 0 });
    hit(q, KEY.BLADE | KEY.FORWARD);
    hit(q, KEY.BLADE | KEY.SPECIAL | KEY.FORWARD);
    expect([q.cut, q.swing, q.vy]).toEqual([STING.LEAP, TAILS[STING.LEAP].ticks, TAIL_LEAP]);
    let air = false;
    for (let k = 0; k < TAILS[STING.LEAP].strike - 1; k++) {
      hit(q, 0);
      air ||= q.mode === MODE.AIR;
    }
    expect(air).toBe(true);
    expect(hit(q, 0)).toBe(STRIKE.CUT);
  });

  it('takes nothing from the racks', () => {
    const { rack, blade, rifle } = ROOFTOPS.teams[0];
    const w = build(ROOFTOPS);
    for (const r of [rack!, blade!, rifle!]) {
      const p = at(r[0], r[1], { z: r[2] });
      step(p, { seq: 0, keys: 0, yaw: 0, pitch: 0 }, w, 0, true, [], XENO);
      expect([p.ammo, p.blade, p.rifle]).toEqual([-1, false, -1]);
    }
    const m = at(rack![0], rack![1], { z: rack![2] });
    step(m, { seq: 0, keys: 0, yaw: 0, pitch: 0 }, w, 0, true, [], MARINE);
    expect(m.ammo).toBeGreaterThan(0);
  });
});

describe('the xenomorph in a room', () => {
  type Pl = {
    info: { name: string; id: number; team: number };
    state: PlayerState;
    bank?: number;
    tackled: number;
  };
  type Inner = {
    players(): Pl[];
    punch(p: Pl, view?: number): void;
    cut(p: Pl, view?: number): void;
    tackle(p: Pl, view?: number): void;
    heal(players: Pl[]): void;
    apply(p: Pl, input: Input): void;
  };
  const room = (...roles: number[]) => {
    const r = new Room({}, ROOFTOPS);
    const sent: string[] = [];
    roles.forEach((role, k) => {
      const c: Conn = { send: (m: string | ArrayBuffer) => typeof m === 'string' && sent.push(m) };
      r.connect(c);
      r.receive(c, JSON.stringify({ t: 'join', name: `p${k}`, role }));
    });
    const inner = r as unknown as Inner;
    const ps = roles.map((_, k) => inner.players().find(p => p.info.name == `p${k}`)!);
    return { r, inner, ps, sent };
  };
  /** b a metre in front of a, a looking at him (toward -z). */
  const face = (a: PlayerState, b: PlayerState) => {
    Object.assign(a, { x: 20, y: 10, z: 51, yaw: 0, pitch: 0, mode: MODE.GROUND, stun: 0 });
    Object.assign(b, { x: 20, y: 10, z: 50, yaw: Math.PI, pitch: 0, mode: MODE.GROUND, stun: 0 });
  };

  it('spawns with its own health, and the marine with his', () => {
    const { ps } = room(ROLE.XENO, ROLE.MARINE);
    expect([ps[0].state.hp, ps[1].state.hp]).toEqual([XENO_HP, HP_MAX]);
  });

  it('takes XENO_CLAW a swipe, never stuns, and frags with its own kind', () => {
    const { inner, ps, sent } = room(ROLE.XENO, ROLE.MARINE);
    const [x, m] = ps;
    face(x.state, m.state);
    x.state.cut = BLOW.CLAW_L;
    inner.punch(x);
    expect([m.state.hp, m.state.stun]).toEqual([HP_MAX - XENO_CLAW, 0]);
    // The user, 2026-11-16: two swipes were a kill; a marine with no armour takes four.
    let swipes = 1;
    while (!m.state.down && swipes < 10) {
      x.state.cut = x.state.cut === BLOW.CLAW_L ? BLOW.CLAW_R : BLOW.CLAW_L;
      inner.punch(x);
      swipes++;
    }
    expect(swipes).toBe(4);
    const frag = sent.map(s => JSON.parse(s)).find(s => s.t == 'frag');
    expect(frag).toMatchObject({ by: x.info.id, who: m.info.id, how: FRAG.CLAW });
  });

  it('strikes with its tail as hard as it charged, never a kill on a fresh marine; the spin all round it', () => {
    // The user, 2026-11-16, after Aliens versus Predator: let go at once it takes little, a full
    // charge much, and none of it puts a marine with full health down.
    const lost = (charge: number, armor = 0) => {
      const r = room(ROLE.XENO, ROLE.MARINE);
      const [a, b] = r.ps;
      face(a.state, b.state);
      b.state.armor = armor;
      Object.assign(a.state, { cut: STING.STAB, swing: 1, heavy: charge > 0, charge });
      r.inner.cut(a);
      return [HP_MAX - b.state.hp, armor - b.state.armor, +(b.state.down > 0)];
    };
    expect(lost(0)).toEqual([TAIL_HP[0], 0, 0]);
    expect(lost(HEAVY_MAX / 2)).toEqual([(TAIL_HP[0] + TAIL_HP[1]) / 2, 0, 0]);
    expect(lost(HEAVY_MAX)).toEqual([TAIL_HP[1], 0, 0]);
    expect(TAIL_HP[1]).toBeLessThan(HP_MAX);
    // His armour takes it first.
    expect(lost(HEAVY_MAX, ARMOR_MAX)).toEqual([TAIL_HP[1] - ARMOR_MAX, ARMOR_MAX, 0]);
    // Out of a stab's reach, no; the charged one reaches further.
    const reach = TAILS[STING.STAB].reach;
    const far = (heavy: boolean) => {
      const r = room(ROLE.XENO, ROLE.MARINE);
      const [a, b] = r.ps;
      face(a.state, b.state);
      b.state.z = a.state.z - reach - 0.3 - 0.4;
      Object.assign(a.state, { cut: STING.STAB, swing: 1, heavy, charge: +heavy * HEAVY_MAX });
      r.inner.cut(a);
      return b.state.hp < HP_MAX;
    };
    expect([far(false), far(true)]).toEqual([false, true]);
    // A foe behind it: the lash misses him, the spin does not; no special kills either.
    const behind = (cut: number) => {
      const r = room(ROLE.XENO, ROLE.MARINE);
      const [a, b] = r.ps;
      face(a.state, b.state);
      b.state.z = a.state.z + 1.5;
      Object.assign(a.state, { cut, swing: 1 });
      r.inner.cut(a);
      return HP_MAX - b.state.hp;
    };
    expect([behind(STING.LASH), behind(STING.SPIN)]).toEqual([0, TAILS[STING.SPIN].hp]);
    expect(Math.max(TAILS[STING.SPIN].hp, TAILS[STING.LEAP].hp)).toBeLessThan(HP_MAX);
  });

  it('burns who strikes it with a blade or a fist with its acid, not another xenomorph', () => {
    const { inner, ps } = room(ROLE.MARINE, ROLE.XENO, ROLE.XENO);
    const [m, x] = ps;
    face(m.state, x.state);
    m.state.cut = BLOW.HOOK;
    inner.punch(m);
    expect(m.state.hp).toBe(HP_MAX - 1);
    expect(x.state.hp).toBe(XENO_HP - 1);
    // The katana too.
    face(m.state, x.state);
    Object.assign(m.state, { blade: true, wield: true, cut: 0, swing: 1 });
    inner.cut(m);
    expect(m.state.hp).toBe(HP_MAX - 2);
    expect(x.state.hp).toBeLessThan(XENO_HP - 1);
  });

  it('pins an enemy its dash reaches: health, a long stumble, his flag dropped; then its burst is over', () => {
    const { inner, ps } = room(ROLE.XENO, ROLE.MARINE);
    const [x, m] = ps;
    face(x.state, m.state);
    Object.assign(x.state, { dash: DASH_COOLDOWN, vx: 0, vz: -12 });
    inner.tackle(x);
    expect(m.state.hp).toBe(HP_MAX - POUNCE_HP);
    expect(m.state.stun).toBe(POUNCE_STUN);
    expect(pouncing(x.state)).toBe(false);
    expect(x.state.dash).toBe(DASH_COOLDOWN - DASH_TICKS);
    // Once: the burst is spent, and the next dash of a chain pins only TACKLE_COOLDOWN later.
    inner.tackle(x);
    x.state.dash = DASH_COOLDOWN;
    inner.tackle(x);
    expect(m.state.hp).toBe(HP_MAX - POUNCE_HP);
    x.tackled -= TACKLE_COOLDOWN;
    inner.tackle(x);
    expect(m.state.hp).toBe(HP_MAX - 2 * POUNCE_HP);
  });

  it('glory kills on E a foe it faces, close, at any health: both held GLORY_TICKS, then his head eaten', () => {
    const { inner, ps, sent } = room(ROLE.XENO, ROLE.MARINE);
    const [x, m] = ps;
    face(x.state, m.state);
    let seq = 0;
    const go = (p: Pl, keys: number, yaw: number) => {
      p.bank = 99;
      inner.apply(p, { seq: ++seq & 65535, keys, yaw, pitch: 0 });
    };
    const e = (yaw: number) => {
      go(x, KEY.USE, yaw);
      const held = x.state.lock ?? 0;
      go(x, 0, yaw);
      return held;
    };
    // At full health and armour (the user, 2026-11-16: whenever it wants), but out of its look,
    // then too far: nothing.
    Object.assign(m.state, { hp: HP_MAX, armor: ARMOR_MAX });
    expect(e(Math.PI)).toBe(0);
    m.state.z = 51 - GLORY_FAR - 0.3;
    expect(e(0)).toBe(0);
    // Six metres off, ahead (the user, 2026-11-16: from afar): held, and it dashes to a metre of
    // him over the lock's first GLORY_DASH ticks, fast, then stays.
    m.state.z = 45;
    go(x, KEY.USE, 0);
    expect([x.state.lock, x.state.foe, m.state.lock, m.state.foe]).toEqual([
      GLORY_TICKS,
      m.info.id,
      GLORY_TICKS,
      x.info.id,
    ]);
    expect(Math.hypot(x.state.vx, x.state.vz)).toBeGreaterThan(XENO.sprint);
    for (let k = 0; k < GLORY_DASH; k++) {
      go(x, 0, 0);
    }
    expect(x.state.z).toBeCloseTo(46, 3);
    expect([x.state.vx, x.state.vz]).toEqual([0, 0]);
    go(x, 0, 0);
    expect(x.state.z).toBeCloseTo(46, 3);
    const [mx, mz] = [m.state.x, m.state.z];
    for (let k = 0; k < GLORY_TICKS - 3 - GLORY_DASH; k++) {
      go(x, KEY.FORWARD | KEY.SPRINT, 0);
      go(m, KEY.BACK | KEY.SPRINT, Math.PI);
    }
    // Neither moves, and he cannot get away.
    expect([m.state.x, m.state.z, m.state.down]).toEqual([mx, mz, 0]);
    expect(m.state.lock).toBeGreaterThan(0);
    for (let k = 0; k < 2; k++) {
      go(x, 0, 0);
    }
    expect(m.state.down).toBeGreaterThan(0);
    expect([m.state.lost, x.state.lock, m.state.lock]).toEqual([LIMB.EATEN, 0, 0]);
    const frag = sent.map(s => JSON.parse(s)).find(s => s.t == 'frag');
    expect(frag).toMatchObject({ by: x.info.id, who: m.info.id, how: FRAG.GLORY });
  });

  it('dashes to its prey the same from a snapshot: the predictor replays it to the bit', () => {
    const s = {
      ...at(-20, 0, { z: 50, yaw: 0, lock: GLORY_TICKS - 5, foe: 1, vx: 0.5, vz: -19.25 }),
      ack: 0,
      by: 0,
    };
    const q = {
      ...s,
      ...decodeSnapshot(encodeSnapshot({ tick: 1, players: [s], ...IDLE }))!.players[0],
    };
    for (let k = 0; k < GLORY_DASH; k++) {
      for (const p of [s, q]) {
        step(p, { seq: k, keys: KEY.FORWARD, yaw: 0, pitch: 0 }, pit, 0, true, [], XENO);
      }
      expect([q.x, q.y, q.z, q.vx, q.vz]).toEqual([s.x, s.y, s.z, s.vx, s.vz]);
    }
    // It went on along its speed, keys or not, then stopped.
    expect(s.z).toBeCloseTo(50 - (19.25 * (GLORY_DASH - 5)) / 60, 3);
    expect([s.vx, s.vz]).toEqual([0, 0]);
  });

  it('glory kills from afar only what it sees: no prey behind a wall', () => {
    // The block of the pit stands from x = 1 to 4: a foe past it is hidden, one this side is not.
    const me = at(0, 0, { yaw: EAST });
    const foe = (x: number) => ({ ...at(x, 0), id: 7, hp: HP_MAX });
    expect(glory(me, [foe(6)], pit)).toBeUndefined();
    const q = at(-3, 0, { yaw: WEST });
    expect(glory(q, [foe(-3 - GLORY_FAR + 0.5)], pit)?.id).toBe(7);
    expect(glory(q, [foe(-3 - GLORY_FAR - 0.5)], pit)).toBeUndefined();
    // The katana's: close, and weak.
    expect(glory(q, [foe(-4)])).toBeUndefined();
    expect(glory(q, [{ ...foe(-4), hp: GLORY_HP }])?.id).toBe(7);
  });

  it('executes on E a weak foe ahead with the katana in hand: a dash, a cut down, a cut across that takes his head', () => {
    const { inner, ps, sent } = room(ROLE.MARINE, ROLE.MARINE);
    const [k, m] = ps;
    face(k.state, m.state);
    // Two metres off: the swordsman dashes in to EXEC.REACH.
    m.state.z = 49;
    k.bank = m.bank = 999;
    let seq = 0;
    const step = (p: typeof k, keys: number) =>
      inner.apply(p, { seq: ++seq, keys, yaw: p.state.yaw, pitch: 0 });
    const e = () => {
      step(k, KEY.USE | KEY.BLADE);
      step(k, KEY.BLADE);
    };
    m.state.hp = GLORY_HP;
    // Empty-handed: nothing.
    e();
    expect(m.state.lock ?? 0).toBe(0);
    Object.assign(k.state, { blade: true });
    m.state.hp = GLORY_HP + 1;
    e();
    expect(m.state.lock ?? 0).toBe(0);
    m.state.hp = GLORY_HP;
    step(k, KEY.USE | KEY.BLADE);
    expect([k.state.lock, m.state.lock]).toEqual([EXEC.TICKS, EXEC.TICKS]);
    expect([k.state.exec, m.state.exec]).toEqual([EXEC.KILLER, EXEC.VICTIM]);
    expect([k.state.foe, m.state.foe]).toEqual([m.info.id, k.info.id]);
    const cuts: [number, number, number][] = [];
    for (let t = 1; t < EXEC.TICKS; t++) {
      // He runs, it shoots: neither counts.
      step(m, KEY.BACK | KEY.SPRINT | KEY.FIRE);
      step(k, KEY.FIRE | KEY.LEFT);
      if (k.state.swing && (cuts.at(-1)?.[1] ?? -1) !== k.state.cut) {
        cuts.push([t, k.state.cut!, k.state.swing]);
      }
      if (t == GLORY_DASH) {
        // In front of him.
        expect(Math.hypot(k.state.x - m.state.x, k.state.z - m.state.z)).toBeCloseTo(EXEC.REACH, 1);
      }
      if (t < EXEC.TICKS - 1) {
        expect([m.state.down, m.state.hp, m.state.z]).toEqual([0, GLORY_HP, 49]);
      }
    }
    expect(cuts).toEqual([
      [EXEC.CUTS[0], CUT.SLASH, CUTS[CUT.SLASH].ticks],
      [EXEC.CUTS[1], CUT.RIGHT, CUTS[CUT.RIGHT].ticks],
    ]);
    // The lock's last tick is the strike of the cut across: his head goes, the body falls back.
    const c = CUTS[CUT.RIGHT];
    expect(c.ticks - k.state.swing!).toBe(c.strike);
    expect(m.state.down).toBeGreaterThan(0);
    expect([m.state.lost, m.state.lock ?? 0, k.state.lock ?? 0, k.state.exec]).toEqual([
      LIMB.HEAD,
      0,
      0,
      0,
    ]);
    expect(m.state.vz).toBeCloseTo(-GLORY_PUSH, 3);
    const frag = sent.map(s => JSON.parse(s)).find(s => s.t == 'frag');
    expect(frag).toMatchObject({ by: k.info.id, who: m.info.id, how: FRAG.GLORY });
  });

  it('ends an execution with neither hurt when the swordsman goes down in it', () => {
    const { inner, ps } = room(ROLE.MARINE, ROLE.MARINE);
    const [k, m] = ps;
    face(k.state, m.state);
    Object.assign(k.state, { blade: true, wield: true });
    m.state.hp = GLORY_HP;
    k.bank = m.bank = 99;
    inner.apply(k, { seq: 1, keys: KEY.USE | KEY.BLADE, yaw: 0, pitch: 0 });
    expect(m.state.exec).toBe(EXEC.VICTIM);
    k.state.down = 100;
    inner.apply(m, { seq: 1, keys: 0, yaw: Math.PI, pitch: 0 });
    expect([m.state.lock, m.state.exec, m.state.down, m.state.hp]).toEqual([0, 0, 0, GLORY_HP]);
  });

  it('ends a glory kill when the xenomorph goes down, the prey free; a dash into a weak foe only pins', () => {
    const { inner, ps } = room(ROLE.XENO, ROLE.MARINE);
    const [x, m] = ps;
    face(x.state, m.state);
    m.state.hp = GLORY_HP;
    x.bank = m.bank = 99;
    inner.apply(x, { seq: 1, keys: KEY.USE, yaw: 0, pitch: 0 });
    expect(m.state.lock).toBe(GLORY_TICKS);
    x.state.down = 100;
    inner.apply(m, { seq: 1, keys: 0, yaw: Math.PI, pitch: 0 });
    expect([m.state.lock, m.state.down, m.state.hp]).toEqual([0, 0, GLORY_HP]);
    // The dash.
    const two = room(ROLE.XENO, ROLE.MARINE);
    const [y, n] = two.ps;
    face(y.state, n.state);
    n.state.hp = GLORY_HP;
    Object.assign(y.state, { dash: DASH_COOLDOWN, vx: 0, vz: -12 });
    two.inner.tackle(y);
    expect([n.state.hp, n.state.down, n.state.stun]).toEqual([
      GLORY_HP - POUNCE_HP,
      0,
      POUNCE_STUN,
    ]);
  });

  it('wears no armour and heals up to its own health', () => {
    const { inner, ps } = room(ROLE.XENO);
    const [x] = ps;
    const [vx, vy, vz] = ROOFTOPS.vests![0];
    Object.assign(x.state, { x: vx, y: vy, z: vz, armor: 0 });
    inner.heal(inner.players());
    expect(x.state.armor ?? 0).toBe(0);
    const [px, py, pz] = ROOFTOPS.packs![0];
    Object.assign(x.state, { x: px, y: py, z: pz, hp: XENO_HP - 1 });
    inner.heal(inner.players());
    expect(x.state.hp).toBe(XENO_HP);
  });
});
