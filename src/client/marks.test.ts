import { describe, expect, it } from 'vitest';
import { IDLE } from '../../test/teams';
import { FLAG } from '../shared/types';
import type { FlagState } from '../shared/types';
import { bearing, edge, marks } from './marks';
import type { MarkScene } from './marks';
import type { Vec3 } from './mesh';

describe('bearing', () => {
  // Yaw 0 looks toward -z, the right of it is +x.
  it('is 0 straight ahead, a quarter turn to the right and the left, and π behind', () => {
    expect(bearing(0, 0, 0, 0, -5)).toBeCloseTo(0, 9);
    expect(bearing(0, 0, 0, 5, 0)).toBeCloseTo(Math.PI / 2, 9);
    expect(bearing(0, 0, 0, -5, 0)).toBeCloseTo(-Math.PI / 2, 9);
    expect(Math.abs(bearing(0, 0, 0, 0, 5))).toBeCloseTo(Math.PI, 9);
  });

  it('turns with the yaw: turn right to face +x, and +x is ahead', () => {
    // forward(yaw) = (-sin yaw, -cos yaw): yaw 3π/2 looks toward +x.
    expect(bearing(0, 0, (3 * Math.PI) / 2, 5, 0)).toBeCloseTo(0, 9);
    expect(bearing(0, 0, (3 * Math.PI) / 2, 0, -5)).toBeCloseTo(-Math.PI / 2, 9);
  });
});

describe('edge', () => {
  it('puts ahead at the top middle, right at the right edge, behind at the bottom', () => {
    const [tx, ty] = edge(0);
    expect(tx).toBeCloseTo(0.5, 9);
    expect(ty).toBeLessThan(0.2);
    const [rx, ry] = edge(Math.PI / 2);
    expect(rx).toBeCloseTo(0.95, 9);
    expect(ry).toBeGreaterThan(0.4);
    expect(ry).toBeLessThan(0.6);
    const [bx, by] = edge(Math.PI);
    expect(bx).toBeCloseTo(0.5, 9);
    expect(by).toBeCloseTo(0.92, 9);
    expect(edge(-Math.PI / 2)[0]).toBeCloseTo(0.05, 9);
  });

  it('stays in the box for every direction, clear of the score at the top', () => {
    for (let a = -Math.PI; a <= Math.PI; a += 0.05) {
      const [x, y] = edge(a);
      expect(x).toBeGreaterThanOrEqual(0.05 - 1e-9);
      expect(x).toBeLessThanOrEqual(0.95 + 1e-9);
      expect(y).toBeGreaterThanOrEqual(0.15 - 1e-9);
      expect(y).toBeLessThanOrEqual(0.92 + 1e-9);
    }
  });
});

describe('marks', () => {
  const bases: Vec3[] = [
    [0, 10, 60],
    [0, 12, 0],
  ];
  const flag = (over: Partial<FlagState>): FlagState => ({ ...IDLE.flags[0], ...over });
  /** A red player at (0, 10, 50) looking north, to the blue flag, the camera seeing a cone ahead. */
  const scene = (over: Partial<MarkScene> = {}): MarkScene => ({
    eye: [0, 11.6, 50],
    id: 0,
    team: 0,
    yaw: 0,
    flags: [flag({}), flag({})],
    bases,
    where: () => undefined,
    // A toy camera: what is ahead of it, within 30 degrees, is on screen at 0.5 + 0.9 * tan.
    project: (x, _y, z) => (z < 50 && Math.abs(x) < 29 ? [0.5 + x / 60, 0.5] : undefined),
    ...over,
  });

  it('marks both flags at home, over the top of their poles when they are in view', () => {
    const [red, blue] = marks(scene());
    // Behind the player: the red flag, at the red base 10 m behind him: an arrow at the bottom.
    expect(red).toMatchObject({ team: 0, kind: 'flag', text: '10 m' });
    expect(red.arrow).toBeDefined();
    expect(Math.abs(red.arrow!)).toBeCloseTo(Math.PI, 6);
    expect(red.y).toBeCloseTo(0.92, 6);
    // In front of him, 50 m away and 3 m higher: over its target, no arrow.
    expect(blue).toMatchObject({ team: 1, kind: 'flag', x: 0.5, y: 0.5 });
    expect(blue.arrow).toBeUndefined();
    expect(blue.text).toBe('50 m');
  });

  it('points an arrow at the side a flag off to the right or the left is on', () => {
    const [, blue] = marks(scene({ yaw: Math.PI / 2, project: () => undefined }));
    // Facing west, the blue base (north, -z) is to the right.
    expect(blue.arrow).toBeCloseTo(Math.PI / 2, 6);
    expect(blue.x).toBeCloseTo(0.95, 6);
    const [, left] = marks(scene({ yaw: -Math.PI / 2, project: () => undefined }));
    expect(left.arrow).toBeCloseTo(-Math.PI / 2, 6);
    expect(left.x).toBeCloseTo(0.05, 6);
  });

  it('follows a flag where it lies and on its carrier, wherever it is', () => {
    const lying = flag({ state: FLAG.DROPPED, x: 8, y: 11, z: 20 });
    const [, blue] = marks(scene({ flags: [flag({}), lying] }));
    expect(blue.x).toBeCloseTo(0.5 + 8 / 60, 9);
    expect(blue.text).toBe(`${Math.round(Math.hypot(8, 11 + 2.6 - 11.6, 30))} m`);
    const [, held] = marks(
      scene({
        flags: [flag({}), flag({ state: FLAG.CARRIED, by: 4 })],
        where: id => (id === 4 ? [-10, 10, 30] : undefined),
      }),
    );
    expect(held).toMatchObject({ team: 1, kind: 'flag' });
    expect(held.x).toBeCloseTo(0.5 - 10 / 60, 9);
  });

  it('has no mark for a flag whose carrier is not known', () => {
    expect(marks(scene({ flags: [flag({}), flag({ state: FLAG.CARRIED, by: 4 })] }))).toHaveLength(
      1,
    );
  });

  it('marks the own base, not the flag, while the player carries the enemy flag', () => {
    const list = marks(scene({ flags: [flag({}), flag({ state: FLAG.CARRIED, by: 0 })] }));
    // His own flag is home at that base: the one mark says both.
    expect(list.map(m => [m.team, m.kind])).toEqual([[0, 'base']]);
    expect(list[0].text).toBe('10 m');
    // Blue carrying the red flag has his base, the blue one.
    const blue = marks(
      scene({ team: 1, id: 7, flags: [flag({ state: FLAG.CARRIED, by: 7 }), flag({})] }),
    );
    expect(blue.map(m => [m.team, m.kind])).toEqual([[1, 'base']]);
  });

  it('keeps the own flag marked while it is away, with the base: there is a flag to take back first', () => {
    const lying = flag({ state: FLAG.DROPPED, x: 5, y: 10, z: 40 });
    const list = marks(scene({ flags: [lying, flag({ state: FLAG.CARRIED, by: 0 })] }));
    expect(list.map(m => [m.team, m.kind])).toEqual([
      [0, 'flag'],
      [0, 'base'],
    ]);
  });

  it('does not mark the base while someone else carries', () => {
    const list = marks(
      scene({
        flags: [flag({ state: FLAG.CARRIED, by: 9 }), flag({ state: FLAG.CARRIED, by: 8 })],
        where: () => [0, 0, 0],
      }),
    );
    expect(list.every(m => m.kind === 'flag')).toBe(true);
  });
});
