import { describe, expect, it } from 'vitest';
import { IDLE, duo } from '../../test/teams';
import { AMMO_MAX, CUTS, GUN_COOLDOWN, GUN_MAG, RUN_SPEED, WALLRUN_TICKS } from './constants';
import { STRIKE, step } from './gun';
import { KITS, ROLE, kitOf, roleOf, rolesOf } from './kit';
import type { Kit } from './kit';
import { MAPS } from './maps';
import { STILL, move } from './physics';
import { decodeSnapshot, encodeSnapshot } from './protocol';
import { chosen } from './room';
import { EV, KEY, MODE, TEX } from './types';
import type { PlayerState } from './types';
import { build } from './world';
import type { Brush } from './world';

const [MARINE, NINJA] = [KITS[ROLE.MARINE], KITS[ROLE.NINJA]];
type Vec3 = [number, number, number];
const box = (min: Vec3, max: Vec3): Brush => ({ min, max, top: TEX.TILE, side: TEX.BRICK });
/** A ground at y = 0 and, at x = 1, a wall 20 m high along z. */
const yard = build({
  brushes: [box([-100, -5, -300], [100, 0, 300]), box([1, 0, -300], [2, 20, 300])],
  teams: duo([[-50, 0, 0, 0]]),
  floor: -50,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
});
const at = (x: number, y: number, over: Partial<PlayerState> = {}): PlayerState => ({
  id: 0,
  x,
  y,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: y == 0,
  ...STILL,
  ...over,
});
const go = (p: PlayerState, keys: number, kit: Kit) =>
  move(p, { seq: 0, keys, yaw: 0, pitch: 0 }, yard, 0, [], kit);

describe('the classes a map offers', () => {
  it('is the marine and the ninja in the city, the astronaut alone on the moon', () => {
    expect(rolesOf(MAPS.highline)).toEqual([ROLE.MARINE, ROLE.NINJA]);
    expect(rolesOf(MAPS.tranquility)).toEqual([ROLE.ASTRONAUT]);
    expect(roleOf(ROLE.NINJA, MAPS.tranquility)).toBe(ROLE.ASTRONAUT);
    expect(roleOf(ROLE.ASTRONAUT, MAPS.highline)).toBe(ROLE.MARINE);
    expect(roleOf(undefined, MAPS.highline)).toBe(ROLE.MARINE);
    expect(kitOf(ROLE.NINJA, MAPS.highline)).toBe(NINJA);
    expect(kitOf(ROLE.NINJA, MAPS.tranquility)).toBe(MARINE);
  });
});

describe('the ninja', () => {
  it('runs and sprints faster', () => {
    for (const [keys, top] of [
      [KEY.FORWARD, RUN_SPEED],
      [KEY.FORWARD | KEY.SPRINT, MARINE.sprint],
    ]) {
      const [m, n] = [at(-50, 0), at(-50, 0)];
      for (let k = 0; k < 600; k++) {
        go(m, keys, MARINE);
        go(n, keys, NINJA);
      }
      expect(-m.vz).toBeCloseTo(top, 3);
      expect(-n.vz).toBeCloseTo(top * 1.2, 3);
    }
  });

  it('jumps higher', () => {
    const apex = (kit: Kit) => {
      const p = at(-50, 0);
      let top = 0;
      go(p, KEY.JUMP, kit);
      for (let k = 0; k < 120; k++) {
        go(p, 0, kit);
        top = Math.max(top, p.y);
      }
      return top;
    };
    expect(apex(NINJA) / apex(MARINE)).toBeCloseTo(1.15 ** 2, 1);
  });

  it('runs along a wall twice as long', () => {
    const ticks = (kit: Kit) => {
      // In the air beside the wall, running along it.
      const p = at(0.55, 6, { mode: MODE.AIR, vz: -9, ground: false });
      let on = 0;
      for (let k = 0; k < 400 && !(p.ev & EV.WALLRUN_END); k++) {
        go(p, KEY.FORWARD, kit);
        on += +(p.mode === MODE.WALLRUN);
      }
      return on;
    };
    // The tick it starts on, then its time.
    expect(ticks(MARINE)).toBe(WALLRUN_TICKS + 1);
    expect(ticks(NINJA)).toBe(WALLRUN_TICKS * 2 + 1);
  });

  it('chains three dashes in the air where the marine has one, then waits the full cooldown on the ground', () => {
    const dashes = (kit: Kit, y: number, presses: number) => {
      // In the air as after a jump from the ground, the chain full.
      const p = at(-50, y, y ? { mode: MODE.AIR, ground: false, dashes: kit.dashes } : {});
      let n = 0;
      // A press every 17 ticks: DASH down one tick, up the next.
      for (let k = 0; k < presses * 17; k++) {
        go(p, KEY.FORWARD | (k % 17 == 0 ? KEY.DASH : 0), kit);
        n += +!!(p.ev & EV.DASH);
      }
      return n;
    };
    expect(dashes(MARINE, 60, 4)).toBe(1);
    expect(dashes(NINJA, 60, 4)).toBe(3);
    expect(dashes(NINJA, 0, 4)).toBe(3);
    // After the full cooldown on the ground, the chain is back.
    expect(dashes(NINJA, 0, 9)).toBe(6);
  });

  it('cuts twice as fast, and every cut still strikes once', () => {
    const cut = (kit: Kit) => {
      const p = at(-50, 0, { blade: true });
      let [strikes, at0, hit] = [0, -1, -1];
      for (let k = 0; k < 120; k++) {
        const s = step(
          p,
          { seq: k, keys: KEY.BLADE | (k == 1 ? KEY.FIRE : 0), yaw: 0, pitch: 0 },
          yard,
          0,
          true,
          [],
          kit,
        );
        at0 = at0 < 0 && p.swing ? k : at0;
        hit = s === STRIKE.CUT && hit < 0 ? k : hit;
        strikes += +(s === STRIKE.CUT);
      }
      return { strikes, after: hit - at0, strike: CUTS[p.cut ?? 0].strike };
    };
    const [m, n] = [cut(MARINE), cut(NINJA)];
    expect([m.strikes, n.strikes]).toEqual([1, 1]);
    expect(m.after).toBe(m.strike);
    // Half, give or take the tick it waits on the wind-up's top.
    expect(n.after).toBeLessThanOrEqual(Math.ceil(m.strike / 2) + 1);
  });

  it('carries half the ammo and fires the gun at half the rate', () => {
    const shoot = (kit: Kit) => {
      const p = at(-50, 0, { ammo: AMMO_MAX, mag: GUN_MAG });
      const s = [KEY.FIRE, 0].map((keys, k) =>
        step(p, { seq: k, keys, yaw: 0, pitch: 0 }, yard, 0, true, [], kit),
      );
      return { s, cool: p.cool, ammo: p.ammo };
    };
    const [m, n] = [shoot(MARINE), shoot(NINJA)];
    expect([m.s[1], n.s[1]]).toEqual([STRIKE.SHOT, STRIKE.SHOT]);
    expect([m.cool, n.cool]).toEqual([GUN_COOLDOWN, GUN_COOLDOWN * 2]);
    expect(n.ammo).toBeLessThan(AMMO_MAX / 2);
    expect(m.ammo).toBeGreaterThan(AMMO_MAX / 2);
  });

  it('sends his chain of dashes and his long cooldown on the wire', () => {
    const p = { ...at(-50, 0, { dashes: 3, cool: 14, foe: 5, pressed: true }), ack: 0, by: 0 };
    const back = decodeSnapshot(encodeSnapshot({ tick: 1, players: [p], ...IDLE }))!.players[0];
    expect([back.dashes, back.cool, back.foe, back.pressed]).toEqual([3, 14, 5, true]);
    for (const dashes of [0, 1, 2]) {
      const q = decodeSnapshot(encodeSnapshot({ tick: 1, players: [{ ...p, dashes }], ...IDLE }))!;
      expect(q.players[0].dashes).toBe(dashes);
    }
  });
});

describe('chosen, what a player picked', () => {
  it('keeps only what the game knows, the man as no field', () => {
    expect(chosen({ body: 1, tone: 5, hair: 4, role: 1 })).toEqual({
      body: 1,
      tone: 5,
      hair: 4,
      role: 1,
    });
    expect(chosen({ body: 0, tone: 0, hair: 3, role: 0 })).toEqual({ tone: 0, hair: 3, role: 0 });
    // The man has four haircuts, a skin index is whole and in range, a class is a ROLE.
    expect(chosen({ hair: 4, tone: 6, role: 3 })).toEqual({});
    expect(chosen({ tone: 1.5, hair: -1, role: '1', body: 2 })).toEqual({});
  });
});
