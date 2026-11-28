import { describe, expect, it } from 'vitest';
import { EAST, WEST, at, yard } from '../../../test/yard';
import { BLOW } from '../../shared/constants';
import { CUT } from '../../shared/types';
import type { PlayerState } from '../../shared/types';
import { createEffects } from '../effects';
import { SOUND } from '../sfx';
import { HEAT, SCAR_LIFE, STOP, createHits, createMelee, createScars, heat, strokeOf } from '.';

/** A swordsman at the origin facing +x, mid-cut, and a foe `d` metres ahead facing him. */
const pair = (cut: number = CUT.LEFT, d = 1.5) => {
  const by: PlayerState = { ...at(0, 0, EAST).p, id: 1, wield: true, blade: true, cut, swing: 10 };
  const foe: PlayerState = { ...at(d, 0, WEST).p, id: 2 };
  return { by, foe };
};

describe('the melee hits as the client sees them', () => {
  it('finds the victim of a landed cut: the attacker counted a hit and the foe in reach lost health', () => {
    const hits = createHits(yard, () => false);
    const { by, foe } = pair();
    expect(hits.frame([by, foe])).toEqual([]);
    const landed = hits.frame([
      { ...by, hits: by.hits + 1 },
      { ...foe, hp: foe.hp - 2 },
    ]);
    expect(landed.map(l => [l.by.id, l.victim.id, l.kind, l.kill])).toEqual([
      [1, 2, 'blade', false],
    ]);
  });

  it('finds none without the hit counted, without the health lost, out of reach or with no melee swing', () => {
    const { by, foe } = pair();
    const cases: [PlayerState, PlayerState][] = [
      [by, { ...foe, hp: foe.hp - 2 }],
      [{ ...by, hits: by.hits + 1 }, foe],
      [
        { ...by, hits: by.hits + 1 },
        { ...foe, x: 6, hp: foe.hp - 2 },
      ],
      [
        { ...by, hits: by.hits + 1, swing: 0 },
        { ...foe, hp: foe.hp - 2 },
      ],
      [
        { ...by, hits: by.hits + 1, cut: CUT.ARC_L },
        { ...foe, hp: foe.hp - 2 },
      ],
    ];
    for (const [a, b] of cases) {
      const hits = createHits(yard, () => false);
      hits.frame([by, foe]);
      expect(hits.frame([a, b])).toEqual([]);
    }
  });

  it('tells the claws, a kill and a severed limb', () => {
    const hits = createHits(yard, id => id === 1);
    const { by, foe } = pair(BLOW.CLAW_L);
    const claw = { ...by, wield: false, blade: false };
    hits.frame([claw, foe]);
    const [l] = hits.frame([
      { ...claw, hits: 1 },
      { ...foe, hp: 0, down: 100, lost: 2 },
    ]);
    expect([l.kind, l.kill, l.severed]).toEqual(['claw', true, true]);
  });
});

describe('the scars', () => {
  it('cool from white hot through yellow and orange to an ember', () => {
    const [hot, bright, ember] = [heat(0), heat(1), heat(SCAR_LIFE)];
    expect(Math.min(...hot)).toBeGreaterThan(1.5);
    // Yellow then orange: red over green over blue, all of it glowing (over 1) at a second.
    expect(bright[0]).toBeGreaterThan(bright[1]);
    expect(bright[1]).toBeGreaterThan(bright[2]);
    expect(bright[0]).toBeGreaterThan(1);
    expect(Math.max(...ember)).toBeLessThan(1);
    expect(HEAT.at(-1)![0]).toBe(SCAR_LIFE);
  });

  it('goes the way of the cut: across from the side it starts on, a slash straight down', () => {
    const { by } = pair();
    const left = strokeOf({ ...by, cut: CUT.LEFT }, 'blade');
    const right = strokeOf({ ...by, cut: CUT.RIGHT }, 'blade');
    const down = strokeOf({ ...by, cut: CUT.SLASH }, 'blade');
    // Across: from the side it starts on to the other, and down.
    expect(left.side).toBe(1);
    expect(right.side).toBe(-1);
    expect(left.d[1]).toBeLessThan(0);
    expect(Math.sign(left.d[2])).toBe(-Math.sign(right.d[2]));
    expect(down.d[1]).toBeLessThan(-0.9);
    expect(strokeOf({ ...by, cut: CUT.THRUST }, 'blade').point).toBe(true);
  });

  it('draws a gash for a cut and three for the claws, on the victim, gone with time or when he is down', () => {
    const { by, foe } = pair();
    const scars = createScars();
    scars.add(by, foe, 'blade');
    const out: number[] = [];
    scars.draw(out as never, [foe]);
    // Two lenses (both faces) of two triangles: 12 vertices of 10 floats.
    expect(out.length).toBe(12 * 10);
    // On his chest, on the swordsman's side of him.
    const xs = out.filter((_, i) => i % 10 === 0);
    const ys = out.filter((_, i) => i % 10 === 1);
    expect(Math.max(...xs)).toBeLessThan(foe.x);
    expect(Math.min(...ys)).toBeGreaterThan(1);
    scars.add({ ...by, cut: BLOW.CLAW_L, wield: false }, foe, 'claw');
    out.length = 0;
    scars.draw(out as never, [foe]);
    expect(out.length).toBe(4 * 12 * 10);
    scars.update(SCAR_LIFE + 0.1, [foe]);
    out.length = 0;
    scars.draw(out as never, [foe]);
    expect(out.length).toBe(0);
    scars.add(by, foe, 'blade');
    scars.update(0.1, [{ ...foe, down: 50 }]);
    scars.draw(out as never, [foe]);
    expect(out.length).toBe(0);
  });
});

describe('the feedback of a landed blow', () => {
  const setup = () => {
    const played: number[] = [];
    const gore: number[] = [];
    const fx = createEffects();
    const melee = createMelee(
      yard,
      { play: id => played.push(id) },
      { gore: (_at, n) => gore.push(n), shock: () => {} },
      fx,
      () => false,
    );
    return { played, gore, fx, melee };
  };

  it('slices, bleeds and, for the own blow, stops the drawn clock, shakes and zooms the view', () => {
    const { played, gore, fx, melee } = setup();
    const { by, foe } = pair();
    melee.frame(by, [foe], 1 / 60);
    melee.frame({ ...by, hits: by.hits + 1 }, [{ ...foe, hp: foe.hp - 2 }], 1 / 60);
    expect(played).toEqual([SOUND.SLICE]);
    expect(gore.length).toBe(1);
    // The hit-stop: the clock stands still for STOP[0] s, as frames go by.
    for (let i = 0; i < 10; i++) {
      melee.frame({ ...by, hits: by.hits + 1 }, [{ ...foe, hp: foe.hp - 2 }], 1 / 60);
    }
    expect(melee.clock(10_000)).toBeCloseTo(10_000 - STOP[0] * 1000, 6);
    fx.update(by, 0, 1 / 60);
    expect(fx.fov).toBeLessThan(0);
  });

  it("booms on a kill and crunches on a severed limb; another's blow neither stops the clock nor shakes", () => {
    const { played, melee } = setup();
    const { by, foe } = pair(CUT.SLASH);
    const me: PlayerState = { ...at(-20, 0, EAST).p, id: 9 };
    melee.frame(me, [by, foe], 1 / 60);
    melee.frame(
      me,
      [
        { ...by, hits: by.hits + 1 },
        { ...foe, hp: 0, down: 100, lost: 1 },
      ],
      1 / 60,
    );
    expect(played).toEqual([SOUND.SLICE, SOUND.KILL, SOUND.SEVER]);
    expect(melee.clock(5000)).toBe(5000);
  });
});
