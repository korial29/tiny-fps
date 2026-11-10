import { describe, expect, it } from 'vitest';
import { loaded } from '../../test/loaded';
import { EAST, at, yard } from '../../test/yard';
import {
  AMMO_MAX,
  CHARGE_MAX,
  CHARGE_TAP,
  CHARGE_TICKS,
  CUTS,
  DOWN_TICKS,
  GUN_COOLDOWN,
  GUN_MAG,
  GUN_RELOAD,
  HEAT_COOL,
  HEAT_LOCK,
  HEAT_MAX,
  RAIL_CAP,
  RAIL_MAX,
  RAIL_SPEND,
  RAIL_RELOAD,
  HP_MAX,
  LOCK_BREAK,
  LOCK_TICKS,
  PICK_H,
  RACK_R,
  HEAVY,
  HEAVY_MAX,
  HEAVY_TAP,
  NADE_COOL,
  NADE_HOLD,
  NADE_MAX,
  RIFLE_MAX,
  RIFLE_CLIP,
  RIFLE_COOL,
  RIFLE_RELOAD,
} from './constants';
import { swingOf } from './blade';
import { STRIKE, powerOf, step, within } from './gun';
import { spawn } from './physics';
import { onWire } from './protocol';
import { CUT, EV, KEY, MODE } from './types';
import type { PlayerState } from './types';
import { build } from './world';

const { FORWARD, JUMP, FIRE, CROUCH } = KEY;

/** A yard with a rack for red at (5, 0, 0) and a blue one at (-5, 0, 0). */
const racked = build({
  ...yard.def,
  teams: [
    { ...yard.def.teams[0], rack: [5, 0, 0] },
    { ...yard.def.teams[1], rack: [-5, 0, 0] },
  ],
});

/** One input through the step, on the yard unless told: what struck. */
const hit = (p: PlayerState, keys: number, yaw = EAST, pitch = 0, w = yard, team = 0) =>
  step(p, onWire({ keys, yaw, pitch, seq: 0 }), w, team);

/** The same, whether a shot went off. */
const go = (p: PlayerState, keys: number, yaw = EAST, pitch = 0, w = yard, team = 0): boolean =>
  hit(p, keys, yaw, pitch, w, team) === STRIKE.SHOT;

/** A tap of FIRE: pressed on one step, let go on the next (with `keys` on both); whether the release fired. */
const tap = (p: PlayerState, keys = 0, yaw = EAST, pitch = 0, w = yard, team = 0): boolean => {
  hit(p, keys | FIRE, yaw, pitch, w, team);
  return go(p, keys, yaw, pitch, w, team);
};

/** `n` steps tapping FIRE every other step, from a press: the steps that fired. */
const taps = (p: PlayerState, n: number, keys = 0, w = yard): number[] =>
  Array.from({ length: n }, (_, k) => go(p, keys | (k % 2 ? 0 : FIRE), EAST, 0, w)).flatMap(
    (f, k) => (f ? [k] : []),
  );

/** A red player standing at (x, z) on the yard with a full gun. */
const armed = (x = 0, z = 0, over: Partial<PlayerState> = {}): PlayerState =>
  Object.assign(at(x, z, EAST).p, loaded({ ammo: AMMO_MAX, ...over }));

describe('the trigger', () => {
  it('fires a tap when it is let go, one ammo, and the next tap once the cooldown is over', () => {
    const p = armed();
    // Pressed: nothing yet, it charges. Let go: the shot.
    expect(go(p, FIRE)).toBe(false);
    expect(p.charge).toBe(1);
    expect(go(p, 0)).toBe(true);
    expect([p.ammo, p.shots, p.power, p.charge, p.cool]).toEqual([
      AMMO_MAX - 1,
      1,
      1,
      0,
      GUN_COOLDOWN,
    ]);
    expect(GUN_COOLDOWN).toBe(7);
    // Tapping on, every other step: a press in the cooldown charges nothing, so the next shot is
    // the first release after it, 8 steps on.
    const p2 = armed();
    expect(taps(p2, 30)).toEqual([1, 9, 17, 25]);
    expect([p2.ammo, p2.shots]).toEqual([AMMO_MAX - 4, 4]);
  });

  it('charges while FIRE is held, holds the charge at the top, and fires it once when let go', () => {
    const p = armed();
    for (let k = 1; k <= CHARGE_TICKS + 30; k++) {
      expect(go(p, FIRE), `step ${k}`).toBe(false);
      expect(p.charge).toBe(Math.min(k, CHARGE_TICKS));
    }
    expect([p.ammo, p.shots]).toEqual([AMMO_MAX, 0]);
    // Let go: one ball of the full strength, CHARGE_MAX shots spent.
    expect(go(p, 0)).toBe(true);
    expect([p.power, p.ammo, p.shots, p.charge]).toEqual([CHARGE_MAX, AMMO_MAX - CHARGE_MAX, 1, 0]);
    expect(CHARGE_MAX).toBe(HP_MAX);
  });

  it('grows the strength with the charge: 1 under CHARGE_TAP, CHARGE_MAX at CHARGE_TICKS, never back', () => {
    expect([0, 1, CHARGE_TAP - 1].map(powerOf)).toEqual([1, 1, 1]);
    expect(powerOf(CHARGE_TICKS)).toBe(CHARGE_MAX);
    const all = Array.from({ length: CHARGE_TICKS + 1 }, (_, k) => powerOf(k));
    all.forEach((v, k) => k && expect(v).toBeGreaterThanOrEqual(all[k - 1]));
    expect(new Set(all)).toEqual(new Set([1, 2, 3, 4, 5]));
    // Held half way: a middling ball.
    const p = armed();
    for (let k = 0; k < 35; k++) {
      go(p, FIRE);
    }
    go(p, 0);
    expect([p.power, p.ammo]).toEqual([powerOf(35), AMMO_MAX - powerOf(35)]);
    expect(p.power).toBe(3);
  });

  it('spends no more than the shots left: a full charge with 2 left is a ball of 2', () => {
    const p = armed(0, 0, { ammo: 2 });
    for (let k = 0; k < CHARGE_TICKS; k++) {
      go(p, FIRE);
    }
    expect(go(p, 0)).toBe(true);
    expect([p.power, p.ammo]).toEqual([2, 0]);
  });

  it('drops the charge when the katana comes to hand, or the match ends', () => {
    const p = armed(0, 0, { blade: true });
    for (let k = 0; k < 30; k++) {
      go(p, FIRE);
    }
    expect(p.charge).toBe(30);
    go(p, KEY.BLADE);
    expect(p.charge).toBe(0);
    go(p, 0);
    expect(p.shots).toBe(0);
    const q = armed();
    for (let k = 0; k < 30; k++) {
      go(q, FIRE);
    }
    step(q, onWire({ keys: 0, yaw: EAST, pitch: 0, seq: 0 }), yard, 0, false);
    expect([q.charge, q.shots]).toEqual([0, 0]);
  });

  it('does not fire without the key, without the gun, or with an empty one', () => {
    const p = armed();
    for (let k = 0; k < 20; k++) {
      expect(go(p, FORWARD)).toBe(false);
    }
    expect([p.shots, p.ammo]).toEqual([0, AMMO_MAX]);
    for (const ammo of [-1, 0]) {
      const q = armed(0, 0, { ammo });
      for (let k = 0; k < 20; k++) {
        expect(go(q, FIRE)).toBe(false);
      }
      expect([q.shots, q.ammo]).toEqual([0, ammo]);
    }
  });

  it('empties the gun and stops at 0', () => {
    const p = armed(0, 0, { ammo: 3 });
    expect(taps(p, 100)).toHaveLength(3);
    expect([p.ammo, p.shots]).toEqual([0, 3]);
  });

  it('wraps the shot counter at 256', () => {
    const p = armed(0, 0, { shots: 255 });
    tap(p);
    expect(p.shots).toBe(0);
  });

  it('fires on the move: running, in the air, wall-running, sliding and crouching', () => {
    for (const mode of [MODE.GROUND, MODE.AIR, MODE.WALLRUN, MODE.SLIDE, MODE.CROUCH]) {
      const p = armed(0, 0, { mode });
      expect(tap(p, FORWARD), `mode ${mode}`).toBe(true);
    }
    const p = armed();
    hit(p, FORWARD | JUMP | FIRE);
    go(p, FORWARD);
    expect(p.mode).toBe(MODE.AIR);
    expect(p.shots).toBe(1);
  });

  it('does not fire while hanging from a ledge or climbing it, and does before and after', () => {
    const p = armed(8.5, 0);
    go(p, FORWARD | JUMP | FIRE);
    const modes = new Set<number>();
    let busy = 0;
    let last = 0;
    for (let k = 0; k < 90; k++) {
      const before = p.shots;
      go(p, FORWARD | (k % 2 ? 0 : FIRE));
      modes.add(p.mode);
      if (p.mode === MODE.HANG || p.mode === MODE.CLIMB) {
        busy++;
        last = p.shots;
        expect(p.shots, `step ${k}`).toBe(before);
      }
    }
    expect(modes.has(MODE.HANG) && modes.has(MODE.CLIMB)).toBe(true);
    expect(busy).toBeGreaterThan(5);
    // Fired in the air before the grab, and again once up.
    expect(last).toBeGreaterThan(0);
    expect(p.shots).toBeGreaterThan(last);
  });

  it('does not fire when the match is over', () => {
    const p = armed();
    expect(step(p, onWire({ keys: FIRE, yaw: EAST, pitch: 0, seq: 0 }), yard, 0, false)).toBe(
      STRIKE.NONE,
    );
    expect(p.shots).toBe(0);
  });
});

describe('the magazines', () => {
  const { RELOAD, RAIL } = KEY;

  it('fires a battery of GUN_MAG shots, swaps it by itself, then fires again once it is in', () => {
    const p = armed();
    expect(p.mag).toBe(GUN_MAG);
    let fired = 0;
    for (let k = 0; k < 4 * GUN_MAG * GUN_COOLDOWN && p.mag; k++) {
      fired += +tap(p);
    }
    expect(fired).toBe(GUN_MAG);
    expect([p.mag, p.ammo]).toEqual([0, AMMO_MAX - GUN_MAG]);
    // Empty: the next step starts the swap, and no shot goes through its GUN_RELOAD ticks.
    let dry = 0;
    while (!go(p, dry % 2 ? 0 : FIRE)) {
      dry++;
    }
    expect(dry).toBeGreaterThanOrEqual(GUN_RELOAD);
    expect(dry).toBeLessThanOrEqual(GUN_RELOAD + 2);
    expect([p.mag, p.ammo]).toEqual([GUN_MAG - 1, AMMO_MAX - GUN_MAG - 1]);
    expect(p.reload).toBe(0);
  });

  it('takes GUN_RELOAD ticks, and loads what is left when it is less than a battery', () => {
    const p = armed(0, 0, { ammo: 4, mag: 0 });
    go(p, 0);
    expect(p.reload).toBe(GUN_RELOAD);
    for (let k = 1; k < GUN_RELOAD; k++) {
      go(p, 0);
    }
    expect([p.reload, p.mag]).toEqual([1, 0]);
    go(p, 0);
    expect([p.reload, p.mag, p.ammo]).toEqual([0, 4, 4]);
  });

  it('swaps on KEY.RELOAD with room in the battery, not when it is full or nothing more is carried', () => {
    const p = armed();
    go(p, RELOAD);
    expect(p.reload).toBe(0);
    tap(p);
    go(p, RELOAD);
    expect(p.reload).toBe(GUN_RELOAD);
    const q = armed(0, 0, { ammo: 5, mag: 5 });
    go(q, RELOAD);
    expect(q.reload).toBe(0);
  });

  it('drops the charge for a swap, and a switch of weapon drops the swap', () => {
    const p = armed(0, 0, { blade: true });
    tap(p);
    for (let k = 0; k < 20; k++) {
      go(p, FIRE);
    }
    expect(p.charge).toBeGreaterThan(0);
    go(p, FIRE | RELOAD);
    expect([p.charge, p.reload]).toEqual([0, GUN_RELOAD]);
    expect(go(p, 0)).toBe(false);
    go(p, KEY.BLADE);
    expect([p.wield, p.reload, p.mag]).toEqual([true, 0, GUN_MAG - 1]);
  });

  it('throws the bolt from a capsule of RAIL_CAP ticks, then swaps it in RAIL_RELOAD with the bolt out', () => {
    const p = Object.assign(at(0, 0, EAST).p, { rail: RAIL_MAX, cap: RAIL_CAP });
    let zaps = 0;
    // A tick spent on the first of each RAIL_SPEND steps of the bolt: the last one has a step.
    for (let k = 0; k < RAIL_CAP * RAIL_SPEND; k++) {
      // Kept cool: the capsule, not the heat, is under test.
      p.heat = 0;
      zaps += +(hit(p, RAIL | FIRE) === STRIKE.RAIL);
      expect(p.cap).toBe(RAIL_CAP - Math.ceil((k + 1) / RAIL_SPEND));
    }
    for (let k = 0; k < 10; k++) {
      zaps += +(hit(p, RAIL | FIRE) === STRIKE.RAIL);
    }
    expect(zaps).toBe((RAIL_CAP - 1) * RAIL_SPEND + 1);
    expect([p.cap, p.rail]).toEqual([0, RAIL_MAX - RAIL_CAP]);
    // The swap began on the step after the last tick: RAIL_RELOAD steps without the bolt in all.
    expect(p.reload).toBe(RAIL_RELOAD - 10);
    while (p.reload! > 1) {
      expect(hit(p, RAIL | FIRE)).toBe(STRIKE.NONE);
    }
    expect(hit(p, RAIL | FIRE)).toBe(STRIKE.RAIL);
    expect([p.reload, p.cap]).toEqual([0, RAIL_CAP - 1]);
  });

  it('overheats after HEAT_MAX steps of fire, cannot fire for 2 s, and cools when let go', () => {
    const p = Object.assign(at(0, 0, EAST).p, { rail: RAIL_MAX, cap: RAIL_CAP });
    for (let k = 0; k < HEAT_MAX; k++) {
      expect(hit(p, RAIL | FIRE)).toBe(STRIKE.RAIL);
    }
    expect([p.heat, p.hot]).toEqual([HEAT_MAX, true]);
    // Hot: no bolt while FIRE is held, the heat falling 1 a step until HEAT_LOCK.
    let locked = 0;
    while (hit(p, RAIL | FIRE) !== STRIKE.RAIL) {
      locked++;
    }
    expect(locked).toBe(HEAT_MAX - HEAT_LOCK);
    // Fired a little and let go, it cools HEAT_COOL a step.
    p.heat = 40;
    hit(p, RAIL);
    hit(p, RAIL);
    expect(p.heat).toBe(40 - HEAT_COOL);
    expect(p.hot).toBe(false);
  });

  it('fills the battery at the rack', () => {
    const p = Object.assign(at(5, 0, EAST).p, { ammo: -1 });
    go(p, 0, EAST, 0, racked);
    expect([p.ammo, p.mag]).toEqual([AMMO_MAX, GUN_MAG]);
  });
});

describe('a saber lock', () => {
  const locked = (over: Partial<PlayerState> = {}) =>
    armed(0, 0, {
      blade: true,
      wield: true,
      lock: LOCK_TICKS,
      foe: 1,
      pushes: 0,
      pressed: true,
      away: 0,
      ...over,
    });

  it('holds him where he is, the katana in hand, and starts no cut nor shot', () => {
    const p = locked();
    for (let k = 0; k < 30; k++) {
      expect(hit(p, FORWARD | KEY.SPRINT | (k % 2 ? 0 : FIRE))).toBe(STRIKE.NONE);
    }
    expect([p.x, p.z, p.swing, p.shots, p.wield]).toEqual([0, 0, 0, 0, true]);
  });

  it('counts a press of FIRE, not a hold: one push for each time it goes down', () => {
    const p = locked({ pressed: false });
    for (const keys of [FIRE, FIRE, FIRE, 0, FIRE, 0, 0, FIRE]) {
      hit(p, keys);
    }
    expect(p.pushes).toBe(3);
    // Held at the start of the lock (the press that cut), the first does not count.
    const q = locked();
    hit(q, FIRE);
    expect(q.pushes).toBe(0);
  });

  it('counts the steps a side or back key is held, up to LOCK_BREAK, and starts again when let go', () => {
    const p = locked();
    for (let k = 0; k < 10; k++) {
      hit(p, KEY.LEFT);
    }
    expect(p.away).toBe(10);
    hit(p, FORWARD);
    expect(p.away).toBe(0);
    for (let k = 0; k < LOCK_BREAK + 10; k++) {
      hit(p, KEY.BACK | KEY.RIGHT);
    }
    expect(p.away).toBe(LOCK_BREAK);
  });

  it('runs down to 1 and waits there for the host', () => {
    const p = locked({ lock: 3 });
    for (let k = 0; k < 5; k++) {
      hit(p, 0);
    }
    expect(p.lock).toBe(1);
  });
});

describe('the rack', () => {
  const at5 = (over: Partial<PlayerState> = {}) =>
    Object.assign(at(5, 0, EAST).p, loaded({ ammo: -1, ...over }));

  it("gives the team's rack gun with AMMO_MAX on arrival: once, the gun is full before the step fires", () => {
    const p = at5();
    go(p, 0, EAST, 0, racked);
    expect([p.ammo, p.rack]).toEqual([AMMO_MAX, true]);
    const q = at5({ ammo: 1 });
    tap(q, 0, EAST, 0, racked);
    expect([q.ammo, q.shots]).toEqual([AMMO_MAX - 1, 1]);
  });

  it('gives nothing while he stays and fires, and fills again each time he leaves and comes back', () => {
    const p = at5();
    // 13 taps' shots in 100 steps, from the one fill.
    expect(taps(p, 100, 0, racked)).toHaveLength(13);
    expect([p.shots, p.ammo]).toEqual([13, AMMO_MAX - 13]);
    // Out of the circle and back in.
    p.x = 5 + RACK_R + 0.5;
    go(p, 0, EAST, 0, racked);
    expect([p.rack, p.ammo]).toEqual([false, AMMO_MAX - 13]);
    p.x = 5;
    go(p, 0, EAST, 0, racked);
    expect([p.rack, p.ammo]).toEqual([true, AMMO_MAX]);
    // Standing still does nothing more.
    p.ammo = 3;
    go(p, 0, EAST, 0, racked);
    expect(p.ammo).toBe(3);
  });

  it('does not count a spawn far from the rack, or a respawn, as being inside', () => {
    const p = at5();
    go(p, 0, EAST, 0, racked);
    expect(p.rack).toBe(true);
    // Down on the rack, he gets up at the spawn (0, 0, 0), 5 m off: no gun, not inside.
    Object.assign(p, { hp: 0, down: 2, ammo: -1 });
    go(p, 0, EAST, 0, racked);
    go(p, 0, EAST, 0, racked);
    expect([p.x, p.rack, p.ammo]).toEqual([0, false, -1]);
    go(p, 0, EAST, 0, racked);
    expect([p.rack, p.ammo]).toEqual([false, -1]);
    // The kill floor does the same.
    const q = at5();
    go(q, 0, EAST, 0, racked);
    q.y = -60;
    go(q, 0, EAST, 0, racked);
    expect([q.x, q.rack, q.ammo]).toEqual([0, false, -1]);
  });

  it('fills a player who respawns inside the circle on his first step there, as an arrival', () => {
    const w = build({
      ...yard.def,
      teams: [{ ...yard.def.teams[0], spawns: [[5, 0, 0, 0]], rack: [5, 0, 0] }, yard.def.teams[1]],
    });
    const p = Object.assign(spawn(0, w, 0, 0), { ammo: -1 });
    expect(p.rack).toBe(false);
    go(p, 0, EAST, 0, w);
    expect(p.ammo).toBe(AMMO_MAX);
  });

  it('walks over it: a run through the circle is enough', () => {
    const p = at(2, 0, EAST).p;
    p.ammo = -1;
    let got = -1;
    for (let k = 0; k < 40 && got < 0; k++) {
      go(p, FORWARD, EAST, 0, racked);
      got = p.ammo;
    }
    expect(got).toBe(AMMO_MAX);
    expect(p.x).toBeGreaterThan(5 - RACK_R);
    expect(p.x).toBeLessThan(5 + RACK_R);
  });

  it('is the own team’s only, and is out of reach beyond RACK_R sideways or PICK_H up', () => {
    const blue = at5();
    go(blue, 0, EAST, 0, racked, 1);
    expect(blue.ammo).toBe(-1);
    // A step toward blue's own rack at x = -5 does.
    const mine = Object.assign(at(-5, 0, EAST).p, { ammo: -1 });
    go(mine, 0, EAST, 0, racked, 1);
    expect(mine.ammo).toBe(AMMO_MAX);
    const far = at(5 + RACK_R + 0.05, 0, EAST).p;
    far.ammo = -1;
    go(far, 0, EAST, 0, racked);
    expect(far.ammo).toBe(-1);
    // A map with no rack gives nothing.
    const none = at5();
    go(none, 0);
    expect(none.ammo).toBe(-1);
  });

  it('is not taken when the match is over', () => {
    const p = at5();
    step(p, onWire({ keys: 0, yaw: EAST, pitch: 0, seq: 0 }), racked, 0, false);
    expect(p.ammo).toBe(-1);
  });

  it('measures a pick-up on the floor plane and in height', () => {
    const p = armed(0, 0);
    expect(within(p, [RACK_R - 0.01, 0, 0], RACK_R)).toBe(true);
    expect(within(p, [RACK_R + 0.01, 0, 0], RACK_R)).toBe(false);
    expect(within(p, [0, 0, -(RACK_R - 0.01)], RACK_R)).toBe(true);
    expect(within(p, [0, PICK_H - 0.01, 0], RACK_R)).toBe(true);
    expect(within(p, [0, PICK_H + 0.01, 0], RACK_R)).toBe(false);
    expect(within(p, [0, -PICK_H - 0.01, 0], RACK_R)).toBe(false);
    // The circle, not the square: its corner is out.
    expect(within(p, [RACK_R * 0.8, 0, RACK_R * 0.8], RACK_R)).toBe(false);
  });
});

describe('down', () => {
  it('moves with no keys: he lies where he fell, cannot fire, and the look still follows', () => {
    const p = armed(0, 0, { down: 30, hp: 0 });
    for (let k = 0; k < 10; k++) {
      expect(go(p, FORWARD | FIRE | JUMP | CROUCH, 1.25, 0.4)).toBe(false);
    }
    expect([p.x, p.z, p.y, p.shots]).toEqual([0, 0, 0, 0]);
    expect(p.down).toBe(20);
    expect(p.yaw).toBeCloseTo(1.25, 4);
    expect(p.mode).toBe(MODE.GROUND);
  });

  it('keeps the gravity: one down in the air falls to the floor, and slides on with his speed', () => {
    const p = armed(0, 0, { down: 200, hp: 0, y: 5, mode: MODE.AIR, ground: false, vx: 3 });
    for (let k = 0; k < 120; k++) {
      go(p, FORWARD);
    }
    expect(p.y).toBe(0);
    expect(p.ground).toBe(true);
    // The speed rubbed out on the floor: a little way on, then still.
    expect(p.x).toBeGreaterThan(0.5);
    expect(p.vx).toBe(0);
  });

  it('is back at a spawn of his team when down runs out: full health, no gun, no cooldown', () => {
    const w = build({
      ...yard.def,
      teams: [
        { base: [0, 0, 0], spawns: [[30, 0, 20, 1]] },
        { base: [0, 0, 0], spawns: [[-30, 0, -20, 2]] },
      ],
    });
    for (const team of [0, 1]) {
      const p = Object.assign(spawn(0, w, 0, team), {
        x: 3,
        z: 4,
        ammo: -1,
        hp: 0,
        down: 3,
        cool: 5,
        shots: 17,
        hits: 9,
      });
      go(p, FIRE, EAST, 0.3, w, team);
      go(p, FIRE, EAST, 0.3, w, team);
      expect([p.down, p.hp, p.x]).toEqual([1, 0, 3]);
      go(p, FIRE, EAST, 0.3, w, team);
      const [x, z] = team ? [-30, -20] : [30, 20];
      expect(p).toMatchObject({ x, z, hp: HP_MAX, ammo: -1, cool: 0, down: 0, mode: MODE.GROUND });
      expect(p.ev & EV.RESPAWN).toBe(EV.RESPAWN);
      // The counters go on: the clients draw a shot on each change.
      expect([p.shots, p.hits]).toEqual([17, 9]);
      // Looking where the input says.
      expect(p.pitch).toBeCloseTo(0.3, 4);
      // And he plays again.
      [p.ammo, p.mag] = [5, 5];
      expect(tap(p, 0, EAST, 0, w, team)).toBe(true);
    }
  });

  it('lasts DOWN_TICKS inputs from the one that put him down', () => {
    const p = armed(0, 0, { down: DOWN_TICKS, hp: 0, ammo: -1 });
    for (let k = 1; k < DOWN_TICKS; k++) {
      go(p, 0);
      expect(p.down, `input ${k}`).toBe(DOWN_TICKS - k);
    }
    go(p, 0);
    expect([p.down, p.hp]).toEqual([0, HP_MAX]);
  });

  it('is cut short by the kill floor, which puts him back too, once', () => {
    const p = armed(0, 0, { down: 50, hp: 0, ammo: -1, y: -60, mode: MODE.AIR, ground: false });
    go(p, 0);
    expect([p.down, p.hp, p.y]).toEqual([0, HP_MAX, 0]);
    // Not counted down from zero: nothing is left of the timer.
    go(p, 0);
    expect(p.down).toBe(0);
  });
});

describe('the kill floor', () => {
  it('gives back full health and takes the gun away, and keeps the counters', () => {
    const p = armed(0, 0, { hp: 2, ammo: 30, y: -60, shots: 7, hits: 3, cool: 4 });
    go(p, 0);
    expect(p).toMatchObject({ hp: HP_MAX, ammo: -1, cool: 0, shots: 7, hits: 3 });
    expect(p.ev & EV.RESPAWN).toBe(EV.RESPAWN);
  });
});

/** A yard with a katana rack for red at (5, 0, 3) and a blue one at (-5, 0, 3), beside the gun racks. */
const bladed = build({
  ...yard.def,
  teams: [
    { ...yard.def.teams[0], rack: [5, 0, 0], blade: [5, 0, 3] },
    { ...yard.def.teams[1], rack: [-5, 0, 0], blade: [-5, 0, 3] },
  ],
});

/** A red player standing at (x, z) on the yard with the katana and no gun. */
const sword = (x = 0, z = 0, over: Partial<PlayerState> = {}): PlayerState =>
  Object.assign(at(x, z, EAST).p, loaded({ blade: true, ...over }));

const { LEFT, RIGHT, BLADE, SPECIAL } = KEY;

describe('the katana rack', () => {
  const at53 = (over: Partial<PlayerState> = {}) => Object.assign(at(5, 3, EAST).p, loaded(over));

  it('gives the katana when he steps into its circle, and he keeps it on leaving', () => {
    const p = at53();
    expect(p.blade).toBe(false);
    go(p, 0, EAST, 0, bladed);
    expect(p.blade).toBe(true);
    p.x = 5 + RACK_R + 1;
    go(p, 0, EAST, 0, bladed);
    expect(p.blade).toBe(true);
  });

  it('gives no ammo and takes none: it is not the gun rack', () => {
    const p = at53({ ammo: 7 });
    go(p, 0, EAST, 0, bladed);
    expect([p.blade, p.ammo]).toEqual([true, 7]);
    const q = Object.assign(at(5, 0, EAST).p, { ammo: -1 });
    go(q, 0, EAST, 0, bladed);
    expect([q.blade, q.ammo]).toEqual([false, AMMO_MAX]);
  });

  it('is the own team’s only, and out of reach beyond RACK_R sideways or PICK_H up', () => {
    const blue = at53();
    go(blue, 0, EAST, 0, bladed, 1);
    expect(blue.blade).toBe(false);
    const mine = Object.assign(at(-5, 3, EAST).p, {});
    go(mine, 0, EAST, 0, bladed, 1);
    expect(mine.blade).toBe(true);
    const far = at(5 + RACK_R + 0.05, 3, EAST).p;
    go(far, 0, EAST, 0, bladed);
    expect(far.blade).toBe(false);
    const high = at(5, 3, EAST, PICK_H + 0.2).p;
    high.mode = MODE.AIR;
    go(high, 0, EAST, 0, bladed);
    expect(high.blade).toBe(false);
    // A map with no katana rack gives nothing.
    const none = at(5, 3, EAST).p;
    go(none, 0, EAST, 0, racked);
    expect(none.blade).toBe(false);
  });

  it('is not taken when the match is over', () => {
    const p = at53();
    step(p, onWire({ keys: 0, yaw: EAST, pitch: 0, seq: 0 }), bladed, 0, false);
    expect(p.blade).toBe(false);
  });

  it('is taken by walking through the circle, and a player with the gun takes it too', () => {
    const p = at(5, 8, EAST).p;
    p.ammo = AMMO_MAX;
    let k = 0;
    for (; k < 100 && !p.blade; k++) {
      go(p, FORWARD, 0, 0, bladed);
    }
    expect(p.blade).toBe(true);
    expect(p.ammo).toBe(AMMO_MAX);
    expect(p.z).toBeLessThan(3 + RACK_R);
  });
});

describe('the weapon in hand', () => {
  /** wield after one step of a player with/without the blade and the gun, with/without BLADE held. */
  const wield = (blade: boolean, gun: boolean, held: boolean) => {
    const p = armed(0, 0, { blade, ammo: gun ? AMMO_MAX : -1 });
    go(p, held ? BLADE : 0);
    return p.wield;
  };

  it('is the katana with it and BLADE held, or with it and no gun, else the gun', () => {
    expect(wield(true, true, true)).toBe(true);
    expect(wield(true, true, false)).toBe(false);
    expect(wield(true, false, false)).toBe(true);
    expect(wield(true, false, true)).toBe(true);
    // An empty gun is still a gun: the katana waits for BLADE.
    const p = armed(0, 0, { blade: true, ammo: 0 });
    go(p, 0);
    expect(p.wield).toBe(false);
    // Without the katana BLADE is ignored.
    expect(wield(false, true, true)).toBe(false);
    expect(wield(false, true, false)).toBe(false);
    expect(wield(false, false, true)).toBe(false);
  });

  it('is the katana on the step he takes it, when he has no gun', () => {
    const p = Object.assign(at(5, 3, EAST).p, { ammo: -1 });
    go(p, 0, EAST, 0, bladed);
    expect([p.blade, p.wield]).toEqual([true, true]);
    // With a gun, the gun stays in hand until he asks.
    const q = Object.assign(at(5, 3, EAST).p, loaded({ ammo: AMMO_MAX }));
    go(q, 0, EAST, 0, bladed);
    expect([q.blade, q.wield]).toEqual([true, false]);
    go(q, BLADE, EAST, 0, bladed);
    expect(q.wield).toBe(true);
    go(q, 0, EAST, 0, bladed);
    expect(q.wield).toBe(false);
  });

  it('stays in hand through a swing, then follows the keys again', () => {
    const p = armed(0, 0, { blade: true });
    go(p, BLADE | FIRE);
    expect([p.wield, p.swing]).toEqual([true, CUTS[CUT.SLASH].ticks]);
    // BLADE let go in mid swing: the katana is still in hand, and the gun cannot fire.
    for (let k = 1; k < CUTS[CUT.SLASH].ticks; k++) {
      expect(go(p, k == CUTS[CUT.SLASH].hold + 2 ? FIRE : 0)).toBe(false);
      expect([p.wield, p.swing], `step ${k}`).toEqual([true, CUTS[CUT.SLASH].ticks - k]);
    }
    // The swing is over on the next step: the gun is back, and a tap fires it.
    expect(tap(p)).toBe(true);
    expect([p.wield, p.swing]).toEqual([false, 0]);
  });
});

describe('the swing', () => {
  /** The strikes of `n` steps holding `keys`, as the steps they came on. */
  const struck = (p: PlayerState, n: number, keys: number): number[] =>
    Array.from({ length: n }, (_, k) => (hit(p, keys) === STRIKE.CUT ? k : -1)).filter(k => k >= 0);

  it('starts with FIRE and a katana in hand: the swing is the cut’s ticks, the cut is the keys’', () => {
    for (const [keys, cut] of [
      [FIRE | FORWARD, CUT.THRUST],
      [FIRE | LEFT, CUT.LEFT],
      [FIRE | RIGHT, CUT.RIGHT],
      [FIRE, CUT.SLASH],
      [FIRE | KEY.BACK, CUT.SLASH],
      [FIRE | LEFT | RIGHT, CUT.SLASH],
      [FIRE | FORWARD | LEFT | RIGHT, CUT.THRUST],
    ]) {
      const p = sword();
      expect(hit(p, keys), `keys ${keys}`).toBe(STRIKE.NONE);
      expect([p.cut, p.swing], `keys ${keys}`).toEqual([cut, CUTS[cut].ticks]);
    }
  });

  it('counts down one a step, strikes once on the step CUTS[cut].strike ticks in, and ends after ticks', () => {
    for (const cut of [CUT.THRUST, CUT.LEFT, CUT.RIGHT, CUT.SLASH]) {
      const { ticks, strike } = CUTS[cut];
      const keys = [FORWARD, LEFT, RIGHT, 0][cut];
      const p = sword();
      hit(p, FIRE | keys);
      const hits: number[] = [];
      for (let k = 1; k < ticks; k++) {
        // The tick the swing says the strike is on: `ticks - swing === strike`, after the step.
        const r = hit(p, keys);
        expect(p.swing, `cut ${cut} step ${k}`).toBe(ticks - k);
        if (r === STRIKE.CUT) {
          hits.push(k);
          expect(ticks - (p.swing ?? 0)).toBe(strike);
        }
        expect(r).not.toBe(STRIKE.SHOT);
      }
      expect(hits, `cut ${cut}`).toEqual([strike]);
      // One more step ends it.
      expect(hit(p, keys)).toBe(STRIKE.NONE);
      expect(p.swing).toBe(0);
    }
  });

  it('is not cancelled or repeated by FIRE: held, it waits at the top of its wind-up; tapped, one swing is one cut', () => {
    const held = sword();
    const { ticks, strike, hold } = CUTS[CUT.SLASH];
    expect(struck(held, ticks * 3, FIRE)).toEqual([]);
    expect([held.swing, held.charge]).toEqual([ticks - hold, HEAVY_MAX]);
    // A tap and nothing after: the cut still comes.
    const tap = sword();
    hit(tap, FIRE);
    expect(struck(tap, ticks * 2, 0)).toEqual([strike - 1]);
    expect(tap.swing).toBe(0);
    // FIRE pressed again in the middle of a swing starts nothing.
    const again = sword();
    hit(again, FIRE);
    for (let k = 0; k < 5; k++) {
      hit(again, 0);
    }
    hit(again, FIRE | FORWARD);
    expect([again.cut, again.swing]).toEqual([CUT.SLASH, ticks - 6]);
  });

  it('charges at the top of its wind-up while FIRE is held, and lets a heavy cut go: slower, its own timer', () => {
    for (const [cut, keys] of [
      [CUT.THRUST, FORWARD],
      [CUT.LEFT, LEFT],
      [CUT.SLASH, 0],
    ]) {
      const { ticks, hold } = CUTS[cut];
      const p = sword();
      // Held well past the top: it stays there, the charge capped.
      expect(struck(p, hold + HEAVY_MAX + 20, FIRE | keys)).toEqual([]);
      expect([p.cut, p.swing, p.charge, !!p.heavy]).toEqual([cut, ticks - hold, HEAVY_MAX, false]);
      // Let go: the heavy release from the top, HEAVY times as slow, one strike at its own tick.
      const heavy = swingOf({ cut, heavy: true });
      expect(heavy.ticks).toBe(Math.round((ticks - hold) * HEAVY));
      expect(hit(p, keys)).toBe(STRIKE.NONE);
      expect([p.swing, p.charge, p.heavy]).toEqual([heavy.ticks, 0, true]);
      expect(struck(p, heavy.ticks + 5, keys)).toEqual([heavy.strike - 1]);
      expect([p.swing, p.heavy]).toEqual([0, false]);
    }
  });

  it('goes on as it was when let go before HEAVY_TAP, and charges neither a special nor in a hang', () => {
    const { ticks, strike, hold } = CUTS[CUT.SLASH];
    const p = sword();
    struck(p, hold + 1 + HEAVY_TAP - 2, FIRE);
    expect(p.charge).toBe(HEAVY_TAP - 2);
    expect(struck(p, ticks, 0)).toEqual([strike - hold - 1]);
    expect(p.heavy).toBe(false);
    // A double click's special runs through its top with FIRE held.
    const q = sword();
    hit(q, FIRE | SPECIAL);
    const special = CUTS[q.cut!];
    expect(special.hold).toBe(-1);
    expect(struck(q, special.ticks - 1, FIRE)).toEqual([special.strike - 1]);
    expect(q.heavy ?? false).toBe(false);
  });

  it('keeps the cut of the swing whatever the keys do after it starts', () => {
    const p = sword();
    hit(p, FIRE | FORWARD);
    for (let k = 0; k < 10; k++) {
      hit(p, LEFT | RIGHT | KEY.BACK);
    }
    expect(p.cut).toBe(CUT.THRUST);
  });

  it('does not fire the gun while the katana is in hand', () => {
    const p = armed(0, 0, { blade: true });
    for (let k = 0; k < 120; k++) {
      expect(hit(p, FIRE | BLADE)).not.toBe(STRIKE.SHOT);
    }
    expect([p.shots, p.ammo, p.cool]).toEqual([0, AMMO_MAX, 0]);
    // No gun at all: the katana is in hand, and swings.
    const q = sword();
    for (let k = 0; k < 120; k++) {
      hit(q, FIRE);
    }
    expect(q.shots).toBe(0);
    // With the gun in hand the katana does not swing: a tap fires the gun.
    const r = armed(0, 0, { blade: true });
    expect(tap(r)).toBe(true);
    expect([r.swing, r.shots]).toEqual([0, 1]);
  });

  it('never counts a cut as a shot, and a shot as a cut', () => {
    const p = armed(0, 0, { blade: true });
    const seen = new Set<number>();
    for (let k = 0; k < 300; k++) {
      const before = p.shots;
      // Swap the weapon every 40 steps, tapping FIRE all the while.
      const r = hit(p, (k % 2 ? 0 : FIRE) | (k % 80 < 40 ? BLADE : 0));
      seen.add(r);
      expect(r === STRIKE.SHOT, `step ${k}`).toBe(((p.shots - before) & 255) === 1);
    }
    expect([...seen].sort()).toEqual([STRIKE.NONE, STRIKE.SHOT, STRIKE.CUT]);
  });

  it('does not start in a hang or a climb, and does before and after', () => {
    const p = sword(8.5, 0);
    go(p, FORWARD | JUMP | FIRE);
    const modes = new Set<number>();
    let busy = 0;
    let swung = 0;
    for (let k = 0; k < 90; k++) {
      const before = p.swing ?? 0;
      // Never a new swing in the hands-busy steps: a swing only runs down there.
      hit(p, FORWARD | FIRE);
      modes.add(p.mode);
      if (p.mode === MODE.HANG || p.mode === MODE.CLIMB) {
        busy++;
        expect(p.swing, `step ${k}`).toBeLessThanOrEqual(Math.max(0, before - 1));
      }
      swung += +((p.swing ?? 0) > 0);
    }
    expect(modes.has(MODE.HANG) && modes.has(MODE.CLIMB)).toBe(true);
    expect(busy).toBeGreaterThan(5);
    expect(swung).toBeGreaterThan(20);
    // A player already in a hang cannot start one.
    const q = sword(0, 0, { mode: MODE.HANG, edge: 2, wall: 1 });
    hit(q, FIRE);
    expect(q.swing).toBe(0);
  });

  it('swings on the move: running, in the air, wall-running, sliding and crouching', () => {
    for (const mode of [MODE.GROUND, MODE.AIR, MODE.WALLRUN, MODE.SLIDE, MODE.CROUCH]) {
      const p = sword(0, 0, { mode });
      hit(p, FIRE | FORWARD);
      expect(p.swing, `mode ${mode}`).toBe(CUTS[CUT.THRUST].ticks);
    }
  });

  it('does not swing, strike or finish a swing in a match that is over, and not while down', () => {
    const p = sword();
    expect(step(p, onWire({ keys: FIRE, yaw: EAST, pitch: 0, seq: 0 }), yard, 0, false)).toBe(
      STRIKE.NONE,
    );
    expect(p.swing).toBe(0);
    const q = sword(0, 0, { swing: 20, cut: CUT.SLASH });
    for (let k = 0; k < 30; k++) {
      expect(step(q, onWire({ keys: 0, yaw: EAST, pitch: 0, seq: 0 }), yard, 0, false)).toBe(
        STRIKE.NONE,
      );
    }
    // Down: the keys are dropped, nothing starts.
    const d = sword(0, 0, { down: 30, hp: 0 });
    for (let k = 0; k < 10; k++) {
      expect(hit(d, FIRE)).toBe(STRIKE.NONE);
    }
    expect(d.swing).toBe(0);
  });

  it('is replayed the same twice: the step is deterministic', () => {
    const run = () => {
      const p = armed(0, 0, { blade: true });
      const out: number[] = [];
      for (let k = 0; k < 400; k++) {
        const keys =
          (k % 97 < 60 ? FIRE : 0) | (k % 31 < 15 ? BLADE : 0) | [FORWARD, LEFT, 0, RIGHT][k % 4];
        out.push(
          hit(p, keys, EAST + k * 0.01),
          p.swing ?? 0,
          p.cut ?? 0,
          +!!p.wield,
          p.ammo,
          p.shots,
        );
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe('the katana through a respawn and the shock', () => {
  it('is gone, with the swing, when he gets up at a spawn', () => {
    const p = sword(0, 0, { swing: 20, cut: CUT.RIGHT, hp: 0, down: 2, wield: true });
    go(p, 0);
    go(p, 0);
    expect(p).toMatchObject({ blade: false, wield: false, swing: 0, cut: 0, down: 0, hp: HP_MAX });
    // The kill floor does the same.
    const q = sword(0, 0, { swing: 20, cut: CUT.RIGHT });
    q.y = -60;
    go(q, 0);
    expect(q).toMatchObject({ blade: false, wield: false, swing: 0 });
  });

  it('clears zap when the stumble runs out, and not before', () => {
    const p = armed(0, 0, { stun: 5, zap: true });
    for (let k = 0; k < 4; k++) {
      go(p, 0);
      expect(p.zap, `step ${k}`).toBe(true);
    }
    go(p, 0);
    expect([p.stun, p.zap]).toEqual([0, false]);
    // A zap with no stumble (a stale flag) is dropped at once.
    const q = armed(0, 0, { zap: true });
    go(q, 0);
    expect(q.zap).toBe(false);
  });
});

describe('the grenade launcher', () => {
  const { RIFLE, SPECIAL } = KEY;
  const CLICK = RIFLE | FIRE | SPECIAL;
  /** A red player with the laser rifle in hand and a full launcher. */
  const rifleman = (over: Partial<PlayerState> = {}) => {
    const p = armed(0, 0, { ammo: -1, rifle: RIFLE_MAX, nades: NADE_MAX, ...over });
    hit(p, RIFLE);
    return p;
  };

  it('launches one grenade on a double click, not a round, and the rifle holds its fire NADE_HOLD ticks', () => {
    const p = rifleman();
    expect(hit(p, CLICK)).toBe(STRIKE.NADE);
    expect(p).toMatchObject({
      nades: NADE_MAX - 1,
      lob: NADE_COOL,
      cool: NADE_HOLD,
      shots: 1,
      rifle: RIFLE_MAX,
      clip: RIFLE_CLIP,
    });
    // FIRE held on: nothing for NADE_HOLD - 1 more steps, then rounds again.
    const next = Array.from({ length: NADE_HOLD }, () => hit(p, RIFLE | FIRE));
    expect(next.indexOf(STRIKE.LASER)).toBe(NADE_HOLD - 1);
    expect(next.filter(Boolean)).toEqual([STRIKE.LASER]);
  });

  it('waits NADE_COOL ticks between two: a double click before fires a round, as a click does', () => {
    const p = rifleman();
    hit(p, CLICK);
    for (let k = 1; k < NADE_COOL; k++) {
      expect(hit(p, k % 20 ? RIFLE : CLICK), `step ${k}`).not.toBe(STRIKE.NADE);
    }
    expect(p.lob).toBe(1);
    expect(p.shots).toBe(3);
    hit(p, RIFLE);
    expect(hit(p, CLICK)).toBe(STRIKE.NADE);
    expect(p.nades).toBe(NADE_MAX - 2);
  });

  it('holds NADE_MAX grenades: once spent, a double click fires the rifle', () => {
    const p = rifleman();
    let lobs = 0;
    for (let k = 0; k < (NADE_MAX + 2) * (NADE_COOL + 1); k++) {
      lobs += +(hit(p, k % (NADE_COOL + 1) ? RIFLE : CLICK) === STRIKE.NADE);
    }
    expect([lobs, p.nades]).toEqual([NADE_MAX, 0]);
    expect(hit(p, CLICK)).toBe(STRIKE.LASER);
  });

  it('is the rifle’s: not with another weapon in hand, the hands busy or the match over, and it fires during a swap of the cell', () => {
    const p = rifleman({ ammo: AMMO_MAX });
    expect(hit(p, FIRE | SPECIAL)).toBe(STRIKE.NONE);
    expect(p.rifled).toBe(false);
    expect(step(p, onWire({ keys: CLICK, yaw: EAST, pitch: 0, seq: 0 }), yard, 0, false)).toBe(
      STRIKE.NONE,
    );
    p.mode = MODE.HANG;
    expect(hit(p, CLICK)).toBe(STRIKE.NONE);
    expect(p.nades).toBe(NADE_MAX);
    const q = rifleman({ clip: 0 });
    hit(q, RIFLE);
    expect(q.reload).toBeGreaterThan(0);
    expect(q.reload).toBeLessThanOrEqual(RIFLE_RELOAD);
    expect(hit(q, CLICK)).toBe(STRIKE.NADE);
  });

  it('is loaded at the rifle’s rack on arrival, with the rounds', () => {
    const w = build({
      ...yard.def,
      teams: [{ ...yard.def.teams[0], rifle: [5, 0, 0] }, yard.def.teams[1]],
    });
    const p = armed(5, 0, { ammo: -1 });
    hit(p, RIFLE, EAST, 0, w);
    expect(p).toMatchObject({ rifle: RIFLE_MAX, nades: NADE_MAX, rifled: true });
    expect(hit(p, CLICK, EAST, 0, w)).toBe(STRIKE.NADE);
    // Staying gives nothing more.
    hit(p, RIFLE, EAST, 0, w);
    expect(p.nades).toBe(NADE_MAX - 1);
    expect(RIFLE_COOL).toBeLessThan(NADE_HOLD);
  });
});
