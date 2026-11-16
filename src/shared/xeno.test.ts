import { describe, expect, it } from 'vitest';
import { IDLE, duo } from '../../test/teams';
import {
  ARMOR_MAX,
  BLOW,
  CLING_SPEED,
  CUTS,
  GLORY_HP,
  GLORY_PUSH,
  GLORY_REACH,
  GLORY_TICKS,
  RUN_SPEED,
  STING,
  TAILS,
  TAIL_LEAP,
  XENO_CLAW,
  HP_MAX,
  POUNCE_COOL,
  POUNCE_HOLD,
  POUNCE_HP,
  POUNCE_MAX,
  POUNCE_MIN,
  POUNCE_PITCH,
  POUNCE_STUN,
  XENO_HP,
  XENO_PACE,
} from './constants';
import { swingOf } from './blade';
import { STRIKE, step } from './gun';
import { KITS, ROLE } from './kit';
import { ROOFTOPS } from './map';
import { STILL, move } from './physics';
import { FRAG, decodeSnapshot, encodeSnapshot } from './protocol';
import { Room } from './room';
import { pouncing } from './tackle';
import { KEY, LIMB, MODE, TEX } from './types';
import type { Conn, Input, PlayerState } from './types';
import { build } from './world';
import type { Brush } from './world';

const [MARINE, XENO] = [KITS[ROLE.MARINE], KITS[ROLE.XENO]];
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
    expect(p.y).toBeCloseTo(y - CLING_SPEED / 60, 4);
    // Faster on a wall than a man runs (the user, 2026-11-16: it crawled).
    expect(CLING_SPEED).toBeGreaterThan(RUN_SPEED);
    // Facing +x, the right is +z; looking away from the wall, the right is -z.
    const z = p.z;
    go(p, KEY.RIGHT);
    expect(p.z).toBeGreaterThan(z);
    go(p, KEY.RIGHT, WEST);
    expect(p.z).toBeCloseTo(z, 5);
    expect(p.mode).toBe(MODE.CLING);
    // A jump looking away leaps along the look.
    go(p, KEY.JUMP, WEST);
    expect(p.mode).toBe(MODE.AIR);
    expect(p.vx).toBeLessThan(-5);
    expect(p.vy).toBeGreaterThan(0);
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

describe('the pounce', () => {
  it('charges while DASH is held, then leaps along the look as far as the charge, at least POUNCE_PITCH up', () => {
    const p = at(-20, 0, { z: 50, yaw: 0 });
    for (let k = 0; k < POUNCE_HOLD + 20; k++) {
      go(p, KEY.DASH, 0);
    }
    expect(p.charge).toBe(POUNCE_HOLD);
    expect(p.mode).toBe(MODE.GROUND);
    go(p, 0, 0);
    expect(p.mode).toBe(MODE.AIR);
    expect(p.charge).toBe(0);
    expect(p.dash).toBe(POUNCE_COOL);
    expect(-p.vz).toBeCloseTo(POUNCE_MAX * Math.cos(POUNCE_PITCH), 3);
    expect(p.vy).toBeGreaterThan(0);
    expect(pouncing(p)).toBe(true);
    // A tap is a short one, and the timer holds the next back.
    const q = at(-20, 0, { z: 50, yaw: 0 });
    go(q, KEY.DASH, 0);
    go(q, 0, 0);
    expect(-q.vz).toBeLessThan(POUNCE_MIN * 1.05);
    while (q.mode !== MODE.GROUND) {
      go(q, 0, 0);
    }
    go(q, KEY.DASH, 0);
    expect(q.charge ?? 0).toBe(0);
  });

  it('leaps toward the keys held as it lets go, like a dash (the double tap of A or D)', () => {
    for (const [keys, side] of [
      [KEY.RIGHT, 1],
      [KEY.LEFT, -1],
    ]) {
      const p = at(-20, 0, { z: 50, yaw: 0 });
      for (let k = 0; k < POUNCE_HOLD; k++) {
        go(p, KEY.DASH, 0);
      }
      go(p, keys, 0);
      expect(p.mode).toBe(MODE.AIR);
      expect(p.vx * side).toBeCloseTo(POUNCE_MAX * Math.cos(POUNCE_PITCH), 3);
      expect(Math.abs(p.vz)).toBeLessThan(1e-3);
    }
  });

  it('pounces off a wall too, and the marine dashes where it pounces', () => {
    const p = at(0.2, 3, { mode: MODE.AIR, ground: false });
    go(p, RUN);
    go(p, KEY.DASH, WEST, 0.5);
    go(p, 0, WEST, 0.5);
    expect(p.mode).toBe(MODE.AIR);
    expect(p.vx).toBeLessThan(-5);
    const m = at(-20, 0, { z: 50, yaw: 0 });
    go(m, KEY.DASH, 0, 0, MARINE);
    expect(m.charge ?? 0).toBe(0);
    expect(m.dash).toBeGreaterThan(POUNCE_COOL);
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

  it('charges the tail at the top of its wind-up while the right button is held, not a pounce', () => {
    const p = at(-20, 0, { z: 50, yaw: 0 });
    const { hold, ticks } = TAILS[STING.STAB];
    for (let k = 0; k < hold + 40; k++) {
      hit(p, KEY.BLADE | KEY.FORWARD);
    }
    expect(p.swing).toBe(ticks - hold);
    expect(p.charge).toBe(39);
    // Let go: the heavy release, its own timer; no pounce from the charge.
    hit(p, 0);
    expect([p.heavy, p.charge, p.mode, p.dash]).toEqual([true, 0, MODE.GROUND, 0]);
    expect(p.swing).toBe(swingOf(p, TAILS).ticks);
    expect(swingOf(p, TAILS).reach).toBeGreaterThan(TAILS[STING.STAB].reach);
    let n = 1;
    while (hit(p, 0) !== STRIKE.CUT) {
      n++;
    }
    expect(n).toBe(swingOf(p, TAILS).strike);
    // No tail while a pounce charges.
    const q = at(-20, 0, { z: 50, yaw: 0 });
    hit(q, KEY.DASH);
    hit(q, KEY.DASH | KEY.BLADE);
    expect(q.swing).toBe(0);
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
  type Pl = { info: { name: string; id: number; team: number }; state: PlayerState; bank?: number };
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
    x.state.cut = BLOW.CLAW_R;
    inner.punch(x);
    expect(m.state.down).toBeGreaterThan(0);
    const frag = sent.map(s => JSON.parse(s)).find(s => s.t == 'frag');
    expect(frag).toMatchObject({ by: x.info.id, who: m.info.id, how: FRAG.CLAW });
  });

  it('puts down whoever its tail reaches in one strike, through his armour; the spin all round it', () => {
    const { inner, ps } = room(ROLE.XENO, ROLE.MARINE, ROLE.MARINE);
    const [x, m] = ps;
    face(x.state, m.state);
    m.state.armor = ARMOR_MAX;
    Object.assign(x.state, { cut: STING.STAB, swing: 1 });
    inner.cut(x);
    expect(m.state.down).toBeGreaterThan(0);
    // Out of a stab's reach, no; the charged one reaches further.
    const reach = TAILS[STING.STAB].reach;
    const far = (heavy: boolean) => {
      const r = room(ROLE.XENO, ROLE.MARINE);
      const [a, b] = r.ps;
      face(a.state, b.state);
      b.state.z = a.state.z - reach - 0.3 - 0.4;
      Object.assign(a.state, { cut: STING.STAB, swing: 1, heavy });
      r.inner.cut(a);
      return b.state.down > 0;
    };
    expect([far(false), far(true)]).toEqual([false, true]);
    // A foe behind it: the lash misses him, the spin does not.
    const behind = (cut: number) => {
      const r = room(ROLE.XENO, ROLE.MARINE);
      const [a, b] = r.ps;
      face(a.state, b.state);
      b.state.z = a.state.z + 1.5;
      Object.assign(a.state, { cut, swing: 1 });
      r.inner.cut(a);
      return b.state.down > 0;
    };
    expect([behind(STING.LASH), behind(STING.SPIN)]).toEqual([false, true]);
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

  it('pins an enemy it pounces on: health, a long stumble, his flag dropped; then its pounce is over', () => {
    const { inner, ps } = room(ROLE.XENO, ROLE.MARINE);
    const [x, m] = ps;
    face(x.state, m.state);
    Object.assign(x.state, { mode: MODE.AIR, dash: POUNCE_COOL, vx: 0, vz: -12 });
    inner.tackle(x);
    expect(m.state.hp).toBe(HP_MAX - POUNCE_HP);
    expect(m.state.stun).toBe(POUNCE_STUN);
    expect(pouncing(x.state)).toBe(false);
    // Once: the pounce is spent.
    inner.tackle(x);
    expect(m.state.hp).toBe(HP_MAX - POUNCE_HP);
  });

  it('glory kills on E a weak foe it faces, close: both held GLORY_TICKS, then his head eaten', () => {
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
    // Too healthy for it, then out of its look, then too far: nothing.
    m.state.hp = GLORY_HP + 1;
    expect(e(0)).toBe(0);
    Object.assign(m.state, { hp: GLORY_HP, armor: ARMOR_MAX });
    expect(e(Math.PI)).toBe(0);
    m.state.z = 51 - GLORY_REACH - 0.3;
    expect(e(0)).toBe(0);
    // Two metres off, ahead: held, and brought in to a metre of him.
    m.state.z = 49;
    go(x, KEY.USE, 0);
    expect([x.state.lock, x.state.foe, m.state.lock, m.state.foe]).toEqual([
      GLORY_TICKS,
      m.info.id,
      GLORY_TICKS,
      x.info.id,
    ]);
    expect(x.state.z).toBeCloseTo(50, 4);
    const [mx, mz] = [m.state.x, m.state.z];
    for (let k = 0; k < GLORY_TICKS - 2; k++) {
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

  it('beheads on E a weak foe ahead with the katana in hand, the body thrown back, no lock', () => {
    const { inner, ps, sent } = room(ROLE.MARINE, ROLE.MARINE);
    const [k, m] = ps;
    face(k.state, m.state);
    k.bank = 99;
    const e = () => {
      inner.apply(k, { seq: 1, keys: KEY.USE | KEY.BLADE, yaw: 0, pitch: 0 });
      inner.apply(k, { seq: 2, keys: KEY.BLADE, yaw: 0, pitch: 0 });
    };
    m.state.hp = GLORY_HP;
    // Empty-handed: nothing.
    e();
    expect(m.state.down).toBe(0);
    Object.assign(k.state, { blade: true });
    m.state.hp = GLORY_HP + 1;
    e();
    expect(m.state.down).toBe(0);
    m.state.hp = GLORY_HP;
    inner.apply(k, { seq: 3, keys: KEY.USE | KEY.BLADE, yaw: 0, pitch: 0 });
    expect(m.state.down).toBeGreaterThan(0);
    expect([m.state.lost, m.state.lock ?? 0, k.state.lock ?? 0]).toEqual([LIMB.HEAD, 0, 0]);
    // Thrown back, away from him (he looks toward -z).
    expect(m.state.vz).toBeLessThan(-GLORY_PUSH + 0.5);
    expect(k.state.swing).toBeGreaterThan(0);
    const frag = sent.map(s => JSON.parse(s)).find(s => s.t == 'frag');
    expect(frag).toMatchObject({ by: k.info.id, who: m.info.id, how: FRAG.GLORY });
  });

  it('ends a glory kill when the xenomorph goes down, the prey free; a pounce on a weak foe only pins', () => {
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
    // The pounce.
    const two = room(ROLE.XENO, ROLE.MARINE);
    const [y, n] = two.ps;
    face(y.state, n.state);
    n.state.hp = GLORY_HP;
    Object.assign(y.state, { mode: MODE.AIR, dash: POUNCE_COOL, vx: 0, vz: -12 });
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
