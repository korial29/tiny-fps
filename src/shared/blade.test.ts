import { describe, expect, it } from 'vitest';
import { EAST, at, yard } from '../../test/yard';
import { crossing, cutOf, knock, limbOf, strike } from './blade';
import { step } from './gun';
import { HIGHLINE, ROOFTOPS } from './map';
import { spawn } from './physics';
import { onWire } from './protocol';
import {
  CUTS,
  DASH_COOLDOWN,
  HIPS,
  LOCK_FACING,
  LOCK_WINDOW,
  LOW_H,
  MIDLINE,
  NECK,
  PLAYER_H,
  PLAYER_R,
  SPECIAL_LATE,
} from './constants';
import { CUT, KEY, LIMB, MODE, SPECIAL_CUT, TEX } from './types';
import type { PlayerState } from './types';
import { build } from './world';
import type { Brush } from './world';

const { FORWARD, BACK, LEFT, RIGHT, JUMP, SPRINT, DASH, CROUCH, FIRE, BLADE, SPECIAL } = KEY;

/** Only the ground of the yard: nothing stands between two players. */
const flat = build({ ...yard.def, brushes: [yard.def.brushes[0]] });

/** Nothing but a brush far off: bodies at any height see each other. */
const air = build({
  ...yard.def,
  brushes: [{ min: [900, 0, 0], max: [901, 1, 1], top: TEX.STEEL, side: TEX.STEEL } as Brush],
});

/** The ground and a wall x 1 to 1.2, z -5 to 5, `h` metres high. */
const walled = (h: number) =>
  build({
    ...yard.def,
    brushes: [
      yard.def.brushes[0],
      { min: [1, 0, -5], max: [1.2, h, 5], top: TEX.STEEL, side: TEX.STEEL } as Brush,
    ],
  });

/** An attacker at the origin looking east with the cut, and a foe at (x, z) on the yard, up on `over`. */
const duel = (cut: number, x: number, z = 0, over: Partial<PlayerState> = {}) => {
  const me = Object.assign(at(0, 0, EAST).p, { cut, blade: true });
  const foe = Object.assign(at(x, z, EAST).p, over);
  return { me, foe };
};

/** Whether the cut reaches a foe at (x, z) from the origin. */
const hits = (cut: number, x: number, z = 0, over: Partial<PlayerState> = {}, w = flat) => {
  const { me, foe } = duel(cut, x, z, over);
  return strike(w, me, [foe]).length === 1;
};

describe('crossing', () => {
  const WEST = Math.PI / 2;
  /** Cy at the origin facing east striking a thrust now; the foe at x facing `yaw`, `elapsed` ticks into a thrust. */
  const pair = (x: number, yaw: number, elapsed: number, over: Partial<PlayerState> = {}) => {
    const c = CUTS[CUT.THRUST];
    const me = Object.assign(at(0, 0, EAST).p, {
      blade: true,
      wield: true,
      cut: CUT.THRUST,
      swing: c.ticks - c.strike,
    });
    const foe = Object.assign(at(x, 0, yaw).p, {
      blade: true,
      wield: true,
      cut: CUT.THRUST,
      swing: c.ticks - elapsed,
      ...over,
    });
    return crossing(me, foe);
  };
  const strike = CUTS[CUT.THRUST].strike;

  it('locks two thrusts face to face that strike within LOCK_WINDOW ticks of each other', () => {
    expect(pair(2, WEST, strike)).toBe(true);
    expect(pair(2, WEST, strike - LOCK_WINDOW)).toBe(true);
    expect(pair(2, WEST, strike + LOCK_WINDOW)).toBe(true);
    expect(pair(2, WEST, strike - LOCK_WINDOW - 1)).toBe(false);
    expect(pair(2, WEST, strike + LOCK_WINDOW + 1)).toBe(false);
  });

  it('needs both facing each other, both in reach, and neither locked or without the katana', () => {
    expect(pair(2, EAST, strike)).toBe(false);
    expect(pair(2, WEST + LOCK_FACING + 0.1, strike)).toBe(false);
    expect(pair(2, WEST + LOCK_FACING - 0.1, strike)).toBe(true);
    expect(pair(CUTS[CUT.THRUST].reach + PLAYER_R + 0.1, WEST, strike)).toBe(false);
    expect(pair(2, WEST, strike, { lock: 5 })).toBe(false);
    expect(pair(2, WEST, strike, { wield: false })).toBe(false);
    expect(pair(2, WEST, strike, { swing: 0 })).toBe(false);
  });
});

describe('cutOf', () => {
  it('cuts across from the side held, LEFT or RIGHT alone', () => {
    expect(cutOf(LEFT)).toBe(CUT.LEFT);
    expect(cutOf(RIGHT)).toBe(CUT.RIGHT);
    // The side wins over forward, and over the rest.
    expect(cutOf(LEFT | FORWARD)).toBe(CUT.LEFT);
    expect(cutOf(RIGHT | FORWARD | SPRINT | FIRE)).toBe(CUT.RIGHT);
    expect(cutOf(LEFT | BACK)).toBe(CUT.LEFT);
  });

  it('thrusts with FORWARD and no side', () => {
    expect(cutOf(FORWARD)).toBe(CUT.THRUST);
    expect(cutOf(FORWARD | SPRINT | JUMP | FIRE | BLADE)).toBe(CUT.THRUST);
    // Both sides held are neither side: forward thrusts, nothing slashes.
    expect(cutOf(FORWARD | LEFT | RIGHT)).toBe(CUT.THRUST);
  });

  it('slashes with back or with no key', () => {
    expect(cutOf(0)).toBe(CUT.SLASH);
    expect(cutOf(BACK)).toBe(CUT.SLASH);
    expect(cutOf(FIRE | BLADE | CROUCH | DASH)).toBe(CUT.SLASH);
    expect(cutOf(LEFT | RIGHT)).toBe(CUT.SLASH);
    expect(cutOf(BACK | LEFT | RIGHT)).toBe(CUT.SLASH);
    // Forward and back together still go forward.
    expect(cutOf(FORWARD | BACK)).toBe(CUT.THRUST);
  });

  it('gives a valid CUTS index for every key set', () => {
    for (let keys = 0; keys < 0x400; keys++) {
      expect(CUTS[cutOf(keys)], `keys ${keys}`).toBeDefined();
    }
  });
});

describe('the numbers of the cuts', () => {
  it('thrust is the longest reach and the narrowest line, the cuts across the widest, the slash the hardest', () => {
    const [t, l, r, s] = CUTS;
    expect(t.reach).toBeGreaterThan(Math.max(l.reach, s.reach));
    expect(t.arc).toBeLessThan(Math.min(l.arc, s.arc));
    expect(l).toEqual(r);
    expect(l.arc).toBeGreaterThan(s.arc);
    expect([t.hp, l.hp, r.hp, s.hp]).toEqual([2, 2, 2, 3]);
    for (const c of CUTS) {
      expect(c.strike).toBeLessThan(c.ticks);
    }
  });
});

describe('the strike test: reach', () => {
  it.each([CUT.THRUST, CUT.LEFT, CUT.RIGHT, CUT.SLASH])(
    'cut %i hits a foe just inside its reach, and misses one just outside, centre to centre less PLAYER_R',
    cut => {
      const edge = CUTS[cut].reach + PLAYER_R;
      expect(hits(cut, edge - 0.01)).toBe(true);
      expect(hits(cut, edge + 0.01)).toBe(false);
      expect(hits(cut, edge - 0.01, 0)).toBe(true);
      // On the floor plane: the way up or down does not count.
      expect(hits(cut, edge - 0.01, 0, { y: 0.5 })).toBe(true);
    },
  );

  it('measures on the floor plane, whatever the height difference', () => {
    // 1.5 m of height difference, the bodies still overlap: only the floor distance matters.
    const { me, foe } = duel(CUT.THRUST, CUTS[0].reach + PLAYER_R - 0.01, 0, { y: 1.5 });
    expect(strike(flat, me, [foe])).toEqual([foe]);
  });

  it('hits a foe who overlaps the attacker, whatever way he is', () => {
    for (const cut of [CUT.THRUST, CUT.SLASH]) {
      expect(hits(cut, 0.2, 0.1)).toBe(true);
      expect(hits(cut, -0.3, 0)).toBe(true);
    }
  });
});

describe('the strike test: arc', () => {
  /** A foe `d` metres off at `a` radians to the right of the look (or the left, when `a` < 0). */
  const at2 = (cut: number, d: number, a: number) => hits(cut, d * Math.cos(a), d * Math.sin(a));
  /** The widest angle at which a foe at d is hit: the arc and the foe's angular radius. */
  const wide = (cut: number, d: number) => CUTS[cut].arc + Math.asin(PLAYER_R / d);

  it.each([CUT.THRUST, CUT.LEFT, CUT.RIGHT, CUT.SLASH])(
    'cut %i hits just inside its arc and misses just outside, to the right and to the left',
    cut => {
      // Close in, within the reach of every cut.
      for (const d of [1, 1.5]) {
        const a = wide(cut, d);
        for (const side of [1, -1]) {
          expect(at2(cut, d, side * (a - 0.01)), `d ${d} side ${side}`).toBe(true);
          expect(at2(cut, d, side * (a + 0.01)), `d ${d} side ${side}`).toBe(false);
        }
      }
    },
  );

  it('lets a foe through the edge of the arc by his angular radius: a body, not a point', () => {
    // At 1.5 m the centre is 0.27 rad outside the thrust's 0.3 arc, but the body edge is inside.
    const a = CUTS[CUT.THRUST].arc + 0.2;
    expect(a).toBeGreaterThan(CUTS[CUT.THRUST].arc);
    expect(at2(CUT.THRUST, 1.5, a)).toBe(true);
    // And further out the same angle misses: the body is narrower seen from there.
    expect(at2(CUT.THRUST, 2.5, a)).toBe(false);
  });

  it('keeps the thrust a narrow line and the cuts across a wide arc', () => {
    // 0.6 rad off, 1.5 m away: across and slash reach it, the thrust does not.
    expect(at2(CUT.THRUST, 1.5, 0.6)).toBe(false);
    expect(at2(CUT.LEFT, 1.5, 0.6)).toBe(true);
    expect(at2(CUT.RIGHT, 1.5, -0.6)).toBe(true);
    expect(at2(CUT.SLASH, 1.5, 0.6)).toBe(true);
    // Square to the side: only the cuts across, and not by much.
    expect(at2(CUT.SLASH, 1.5, Math.PI / 2)).toBe(false);
    expect(at2(CUT.LEFT, 1.5, Math.PI / 2)).toBe(false);
  });

  it('misses behind, for every cut', () => {
    for (const cut of [CUT.THRUST, CUT.LEFT, CUT.RIGHT, CUT.SLASH]) {
      expect(hits(cut, -1.5), `cut ${cut}`).toBe(false);
      expect(hits(cut, -1, 0.5), `cut ${cut}`).toBe(false);
    }
  });

  it('follows the look: the arc turns with the yaw', () => {
    const me = Object.assign(at(0, 0, 0).p, { cut: CUT.THRUST });
    // Yaw 0 looks toward -z, EAST toward +x.
    const [ahead, beside] = [at(0, -2, 0).p, at(2, 0, 0).p];
    Object.assign(me, { yaw: 0 });
    expect(strike(flat, me, [ahead, beside])).toEqual([ahead]);
    Object.assign(me, { yaw: EAST });
    expect(strike(flat, me, [ahead, beside])).toEqual([beside]);
  });
});

describe('the strike test: heights', () => {
  // No ground under them: a body below the floor is a test device, and the floor would be a wall.
  it('hits a foe whose body overlaps the attacker’s in height, and not one above or below', () => {
    expect(hits(CUT.THRUST, 2, 0, { y: PLAYER_H - 0.1 }, air)).toBe(true);
    expect(hits(CUT.THRUST, 2, 0, { y: PLAYER_H + 0.1 }, air)).toBe(false);
    expect(hits(CUT.THRUST, 2, 0, { y: -PLAYER_H + 0.1 }, air)).toBe(true);
    expect(hits(CUT.THRUST, 2, 0, { y: -PLAYER_H - 0.1 }, air)).toBe(false);
    expect(hits(CUT.THRUST, 2, 0, { y: 2.4 }, air)).toBe(false);
  });

  it('counts a crouched or sliding body for what it is: low', () => {
    // A crouched foe on a floor the attacker's feet are 1.9 m over: out of reach.
    const low = { mode: MODE.CROUCH };
    expect(hits(CUT.SLASH, 1.5, 0, { ...low, y: -LOW_H + 0.1 }, air)).toBe(true);
    expect(hits(CUT.SLASH, 1.5, 0, { ...low, y: -LOW_H - 0.1 }, air)).toBe(false);
    // And a crouched attacker cuts over nothing above his own height.
    const { me, foe } = duel(CUT.SLASH, 1.5, 0, { y: LOW_H + 0.1 });
    Object.assign(me, { mode: MODE.CROUCH });
    expect(strike(air, me, [foe])).toEqual([]);
    Object.assign(foe, { y: LOW_H - 0.1 });
    expect(strike(air, me, [foe])).toEqual([foe]);
  });
});

describe('the strike test: brushes', () => {
  it('does not cut through a wall', () => {
    for (const cut of [CUT.THRUST, CUT.LEFT, CUT.SLASH]) {
      expect(hits(cut, 1.8, 0, {}, walled(3)), `cut ${cut}`).toBe(false);
      // Without the wall the same foe is hit: it is the wall.
      expect(hits(cut, 1.8), `cut ${cut}`).toBe(true);
    }
  });

  it('cuts over a low wall, below the chest', () => {
    expect(hits(CUT.THRUST, 1.8, 0, {}, walled(0.5))).toBe(true);
    expect(hits(CUT.THRUST, 1.8, 0, {}, walled(1.5))).toBe(false);
  });

  it('is not stopped by a wall behind the foe', () => {
    const w = build({
      ...yard.def,
      brushes: [
        yard.def.brushes[0],
        { min: [2.5, 0, -5], max: [2.7, 3, 5], top: TEX.STEEL, side: TEX.STEEL } as Brush,
      ],
    });
    expect(hits(CUT.THRUST, 2, 0, {}, w)).toBe(true);
  });
});

describe('the strike test: who', () => {
  it('returns every foe the cut hits, and only them', () => {
    const me = Object.assign(at(0, 0, EAST).p, { cut: CUT.LEFT });
    const [a, b, c, d] = [
      at(1.5, 0.5, EAST).p,
      at(1, -1, EAST).p,
      at(5, 0, EAST).p,
      at(-1.5, 0, EAST).p,
    ];
    for (const [k, f] of [a, b, c, d].entries()) {
      f.id = k + 1;
    }
    expect(strike(flat, me, [a, b, c, d])).toEqual([a, b]);
    expect(strike(flat, me, [])).toEqual([]);
  });

  it('reads the cut from the attacker, and defaults to the thrust when he has none', () => {
    const me = at(0, 0, EAST).p;
    const foe = at(2.7, 0, EAST).p;
    delete me.cut;
    expect(strike(flat, me, [foe])).toEqual([foe]);
    // 2.7 m is out of reach of a slash.
    me.cut = CUT.SLASH;
    expect(strike(flat, me, [foe])).toEqual([]);
  });
});

describe('limbOf', () => {
  /**
   * The limb the cut of an attacker at the origin looking along `yaw`, `pitch` up, takes off a foe
   * `d` m ahead and `l` m to the attacker's right, looking `turn` from the attacker's way (PI: at
   * him). `me` and `him` go on top of the two states.
   */
  const limb = (
    cut: number,
    { d = 1.5, l = 0, turn = Math.PI, pitch = 0, yaw = EAST } = {},
    me: Partial<PlayerState> = {},
    him: Partial<PlayerState> = {},
  ) => {
    const [fx, fz] = [-Math.sin(yaw), -Math.cos(yaw)];
    const p = Object.assign(at(0, 0, yaw).p, { cut, pitch }, me);
    const f = Object.assign(at(d * fx - l * fz, d * fz + l * fx, yaw + turn).p, him);
    return limbOf(p, f);
  };
  /** The pitch that puts the blade's line, from the chest at `from` m, at `h` m over the feet, 1.5 m ahead. */
  const aim = (h: number, from = CHEST_H) => Math.atan((h - from) / 1.5);
  const CHEST_H = 0.7 * PLAYER_H;
  const [HEAD, ARMS, LEGS] = [aim(0.95 * PLAYER_H), aim(0.6 * PLAYER_H), aim(0.25 * PLAYER_H)];
  const ACROSS = [CUT.THRUST, CUT.LEFT, CUT.RIGHT];

  it('takes an arm of a standing foe from a level look, the head looking up, a leg looking down', () => {
    for (const cut of ACROSS) {
      expect([LIMB.ARM_L, LIMB.ARM_R], `cut ${cut}`).toContain(limb(cut, { l: 0.3 }));
      expect(limb(cut, { pitch: HEAD, l: 0.3 }), `cut ${cut}`).toBe(LIMB.HEAD);
      expect([LIMB.LEG_L, LIMB.LEG_R], `cut ${cut}`).toContain(limb(cut, { pitch: LEGS, l: 0.3 }));
    }
  });

  it('thrusts into the side facing the attacker when the foe stands side-on to him', () => {
    // His right toward the attacker, then his left; the line through his middle.
    expect(limb(CUT.THRUST, { pitch: ARMS, turn: -Math.PI / 2 })).toBe(LIMB.ARM_R);
    expect(limb(CUT.THRUST, { pitch: ARMS, turn: Math.PI / 2 })).toBe(LIMB.ARM_L);
    expect(limb(CUT.SLASH, { turn: -Math.PI / 2 })).toBe(LIMB.ARM_R);
  });

  it('splits the body at NECK and HIPS of his height, for the thrust and the cuts across', () => {
    const at = (share: number) => ({ pitch: aim(share * PLAYER_H), l: 0.3 });
    for (const cut of ACROSS) {
      expect(limb(cut, at(NECK + 0.01)), `cut ${cut}`).toBe(LIMB.HEAD);
      expect(limb(cut, at(NECK - 0.01)), `cut ${cut}`).not.toBe(LIMB.HEAD);
      expect([LIMB.ARM_L, LIMB.ARM_R]).toContain(limb(cut, at(HIPS + 0.01)));
      expect([LIMB.LEG_L, LIMB.LEG_R]).toContain(limb(cut, at(HIPS - 0.01)));
    }
  });

  it('cuts across into the side the cut comes from: LEFT meets his right when he faces the attacker', () => {
    // Facing each other, the attacker's left is the foe's right.
    expect(limb(CUT.LEFT, { pitch: ARMS })).toBe(LIMB.ARM_R);
    expect(limb(CUT.RIGHT, { pitch: ARMS })).toBe(LIMB.ARM_L);
    expect(limb(CUT.LEFT, { pitch: LEGS })).toBe(LIMB.LEG_R);
    expect(limb(CUT.RIGHT, { pitch: LEGS })).toBe(LIMB.LEG_L);
    // From behind, the two lefts are on the same side.
    expect(limb(CUT.LEFT, { pitch: ARMS, turn: 0 })).toBe(LIMB.ARM_L);
    expect(limb(CUT.RIGHT, { pitch: ARMS, turn: 0 })).toBe(LIMB.ARM_R);
    expect(limb(CUT.LEFT, { pitch: LEGS, turn: 0 })).toBe(LIMB.LEG_L);
    // Where the line passes does not matter, and the middle takes an arm too.
    for (const l of [-0.3, 0, 0.3]) {
      expect(limb(CUT.LEFT, { pitch: ARMS, l }), `l ${l}`).toBe(LIMB.ARM_R);
      expect(limb(CUT.RIGHT, { pitch: ARMS, l }), `l ${l}`).toBe(LIMB.ARM_L);
    }
  });

  it('thrusts into the side of his middle the line passes, his own side', () => {
    // The foe 0.3 m to the attacker's right: the line passes on the attacker's left of him, his right.
    expect(limb(CUT.THRUST, { pitch: ARMS, l: 0.3 })).toBe(LIMB.ARM_R);
    expect(limb(CUT.THRUST, { pitch: ARMS, l: -0.3 })).toBe(LIMB.ARM_L);
    expect(limb(CUT.THRUST, { pitch: LEGS, l: 0.3 })).toBe(LIMB.LEG_R);
    expect(limb(CUT.THRUST, { pitch: LEGS, l: -0.3 })).toBe(LIMB.LEG_L);
    // His back to the attacker: the sides swap.
    expect(limb(CUT.THRUST, { pitch: ARMS, l: 0.3, turn: 0 })).toBe(LIMB.ARM_L);
    expect(limb(CUT.THRUST, { pitch: LEGS, l: -0.3, turn: 0 })).toBe(LIMB.LEG_R);
  });

  it('thrusts into the chest within MIDLINE of his middle: no limb', () => {
    for (const l of [0, MIDLINE - 0.01, -MIDLINE + 0.01]) {
      expect(limb(CUT.THRUST, { pitch: ARMS, l }), `l ${l}`).toBe(LIMB.NONE);
    }
    expect(limb(CUT.THRUST, { pitch: ARMS, l: MIDLINE + 0.01 })).toBe(LIMB.ARM_R);
    expect(limb(CUT.THRUST, { pitch: ARMS, l: -MIDLINE - 0.01 })).toBe(LIMB.ARM_L);
    // Only at arm height: the head and the legs come off on the middle too.
    expect(limb(CUT.THRUST, { pitch: HEAD })).toBe(LIMB.HEAD);
    expect([LIMB.LEG_L, LIMB.LEG_R]).toContain(limb(CUT.THRUST, { pitch: LEGS }));
  });

  it('slashes the head within MIDLINE of his middle, else the arm on the side the line passes, at any height', () => {
    for (const pitch of [HEAD, ARMS, LEGS, 0]) {
      expect(limb(CUT.SLASH, { pitch }), `pitch ${pitch}`).toBe(LIMB.HEAD);
      expect(limb(CUT.SLASH, { pitch, l: MIDLINE - 0.01 }), `pitch ${pitch}`).toBe(LIMB.HEAD);
      expect(limb(CUT.SLASH, { pitch, l: 0.3 }), `pitch ${pitch}`).toBe(LIMB.ARM_R);
      expect(limb(CUT.SLASH, { pitch, l: -0.3 }), `pitch ${pitch}`).toBe(LIMB.ARM_L);
      expect(limb(CUT.SLASH, { pitch, l: 0.3, turn: 0 }), `pitch ${pitch}`).toBe(LIMB.ARM_L);
    }
  });

  it('follows the pitch: looking up raises the line, looking down lowers it', () => {
    // A crouched attacker looks level into the legs of a standing foe.
    expect((0.7 * LOW_H) / PLAYER_H).toBeLessThan(HIPS);
    const low = { mode: MODE.CROUCH };
    expect(limb(CUT.LEFT, {}, low)).toBe(LIMB.LEG_R);
    expect(limb(CUT.LEFT, { pitch: aim(0.6 * PLAYER_H, 0.7 * LOW_H) }, low)).toBe(LIMB.ARM_R);
    expect(limb(CUT.LEFT, { pitch: aim(0.95 * PLAYER_H, 0.7 * LOW_H) }, low)).toBe(LIMB.HEAD);
    // Farther away, the same pitch reaches higher.
    expect(limb(CUT.LEFT, { pitch: 0.1 })).toBe(LIMB.ARM_R);
    expect(limb(CUT.LEFT, { pitch: 0.1, d: 3 })).toBe(LIMB.HEAD);
  });

  it('measures the share on the foe as he is: his feet and his height', () => {
    // A level look at a foe standing 0.6 m higher: 0.66 m over his feet, a leg; 0.6 m lower, the head.
    expect(limb(CUT.LEFT, {}, {}, { y: 0.6 })).toBe(LIMB.LEG_R);
    expect(limb(CUT.LEFT, {}, {}, { y: -0.6 })).toBe(LIMB.HEAD);
    // A line 0.7 m over the feet is at the arms of a crouched foe, the legs of a standing one.
    expect(limb(CUT.LEFT, { pitch: aim(0.7) }, {}, { mode: MODE.CROUCH })).toBe(LIMB.ARM_R);
    expect(limb(CUT.LEFT, { pitch: aim(0.7) })).toBe(LIMB.LEG_R);
  });

  it('turns with the look: any yaw gives the same limbs', () => {
    const cases = [
      [CUT.LEFT, ARMS, 0.3, Math.PI],
      [CUT.RIGHT, LEGS, -0.3, 0],
      [CUT.THRUST, ARMS, 0.3, Math.PI],
      [CUT.THRUST, LEGS, -0.3, 0.4],
      [CUT.SLASH, ARMS, 0.3, Math.PI],
      [CUT.SLASH, LEGS, 0.05, 2],
    ] as const;
    for (const [cut, pitch, l, turn] of cases) {
      const want = limb(cut, { pitch, l, turn });
      for (let yaw = 0; yaw < 6.3; yaw += 0.7) {
        expect(limb(cut, { pitch, l, turn, yaw }), `cut ${cut} yaw ${yaw}`).toBe(want);
      }
    }
  });
});

describe('knock', () => {
  /** The way the shock of a cut of an attacker looking along `yaw` throws. */
  const thrown = (cut: number, yaw: number) => knock(Object.assign(at(0, 0, yaw).p, { cut, yaw }));
  const is = (v: [number, number], x: number, z: number) => {
    expect(v[0]).toBeCloseTo(x, 9);
    expect(v[1]).toBeCloseTo(z, 9);
  };

  it('throws along the look for a thrust and a slash', () => {
    is(thrown(CUT.THRUST, EAST), 1, 0);
    is(thrown(CUT.SLASH, 0), 0, -1);
  });

  it('throws a cut from the LEFT to the attacker’s right, and one from the RIGHT to his left', () => {
    // Looking east (+x), his right is +z and his left -z; looking north (-z), his right is +x.
    is(thrown(CUT.LEFT, EAST), 0, 1);
    is(thrown(CUT.RIGHT, EAST), 0, -1);
    is(thrown(CUT.LEFT, 0), 1, 0);
    is(thrown(CUT.RIGHT, 0), -1, 0);
  });

  it('throws a lunge and a leap along the look', () => {
    is(thrown(CUT.LUNGE, EAST), 1, 0);
    is(thrown(CUT.LEAP, 0), 0, -1);
  });

  it('is a unit vector for any look', () => {
    for (const cut of Object.values(CUT)) {
      for (let yaw = 0; yaw < 6.3; yaw += 0.7) {
        const [x, z] = thrown(cut, yaw);
        expect(Math.hypot(x, z)).toBeCloseTo(1, 9);
      }
    }
  });
});

describe('the katana racks of the maps', () => {
  it.each([
    ['HIGHLINE', HIGHLINE],
    ['ROOFTOPS', ROOFTOPS],
  ])(
    'on %s a player standing at his team’s takes the katana, and only his own team’s',
    (_, def) => {
      const w = build(def);
      for (const team of [0, 1]) {
        const [x, y, z] = def.teams[team].blade!;
        for (const [who, took] of [
          [team, true],
          [1 - team, false],
        ] as const) {
          const p = Object.assign(spawn(0, w, 0, who), { x, y, z });
          step(p, onWire({ keys: 0, yaw: 0, pitch: 0, seq: 0 }), w, who);
          // The floor is under his feet: he stands on the rack's top, not falling.
          expect(p.ground, `team ${who} at ${team}'s rack`).toBe(true);
          expect(p.y).toBe(Math.fround(y));
          expect(!!p.blade, `team ${who} at ${team}'s rack`).toBe(took);
        }
      }
    },
  );
});

describe('the special cuts', () => {
  /** A player on the yard with the katana in hand, the gun in the bag, looking north. */
  const armed = () => Object.assign(at(0, 0).p, { blade: true, ammo: -1 });
  const go = (p: PlayerState, keys: number) =>
    step(p, onWire({ keys, yaw: p.yaw, pitch: 0, seq: 0 }), yard, 0);

  it('come with a double click: each cut’s special is the cut plus SPECIAL_CUT', () => {
    for (const [keys, cut] of [
      [FORWARD, CUT.LUNGE],
      [LEFT, CUT.ARC_L],
      [RIGHT, CUT.ARC_R],
      [0, CUT.LEAP],
    ]) {
      const p = armed();
      go(p, keys | FIRE | SPECIAL);
      expect([p.cut, p.swing]).toEqual([cut, CUTS[cut].ticks]);
      expect(cut).toBe(cutOf(keys) + SPECIAL_CUT);
    }
  });

  it('turns a cut just started into its special, up to SPECIAL_LATE ticks into it, not later and not twice', () => {
    for (const [late, turned] of [
      [3, true],
      [SPECIAL_LATE, true],
      [SPECIAL_LATE + 1, false],
    ] as const) {
      const p = armed();
      go(p, LEFT | FIRE);
      for (let i = 1; i < late; i++) {
        go(p, 0);
      }
      go(p, LEFT | FIRE | SPECIAL);
      expect(p.cut, `${late} ticks in`).toBe(turned ? CUT.ARC_L : CUT.LEFT);
    }
    const p = armed();
    go(p, FIRE | SPECIAL);
    go(p, 0);
    go(p, LEFT | FIRE | SPECIAL);
    expect([p.cut, p.swing]).toEqual([CUT.LEAP, CUTS[CUT.LEAP].ticks - 2]);
  });

  it('throws a lunge forward, spending the dash, and jumps a leap up; in the air neither moves him', () => {
    const p = armed();
    go(p, FORWARD | FIRE | SPECIAL);
    expect(p.dash).toBe(DASH_COOLDOWN);
    for (let i = 0; i < 30; i++) {
      go(p, 0);
    }
    expect(-p.z).toBeGreaterThan(2.5);
    const q = armed();
    go(q, FIRE | SPECIAL);
    let top = 0;
    for (let i = 0; i < 60; i++) {
      go(q, 0);
      top = Math.max(top, q.y);
    }
    expect(top).toBeGreaterThan(1.2);
    expect(q.ground).toBe(true);
    // Off the floor: the cut, no throw.
    const r = Object.assign(armed(), { mode: MODE.AIR, ground: false, y: 3 });
    go(r, FIRE | SPECIAL);
    expect(r.cut).toBe(CUT.LEAP);
    expect(r.vy).toBeLessThan(0.1);
  });

  it('reaches furthest with the lunge, straight ahead', () => {
    expect(hits(CUT.LUNGE, 3.3)).toBe(true);
    expect(hits(CUT.THRUST, 3.3)).toBe(false);
  });

  it('strike while the swing runs, each once, and every swing fits the wire’s 6 bits', () => {
    for (const c of CUTS) {
      expect(c.ticks).toBeLessThan(64);
      expect(c.strike).toBeGreaterThan(0);
      expect(c.strike).toBeLessThan(c.ticks);
    }
  });
});
