import { describe, expect, it } from 'vitest';
import { EAST, NORTH, Sim, WEST, toward } from '../../test/pilot';
import { GRAVITY, JUMP_SPEED } from './constants';
import { LAYOUT, MOON, ZED } from './moon';
import { BASE } from './moonbase';
import { KEY } from './types';
import { build } from './world';

const world = build(MOON);
const { brushes } = MOON;

/** The jump at half gravity: its height. */
const HALF = GRAVITY / 2;
const APEX = JUMP_SPEED ** 2 / (2 * HALF);

describe('MOON, the domes, the modules and the tubes', () => {
  const ghosts = brushes.filter(b => b.ghost);
  const shell = (y: number) => (y < 5 ? 22.4 : 22.4 * Math.sqrt(1 - ((y - 5) / 12) ** 2));

  it('has ghost bands over the domes, 4 bands of 4 stepped boxes each, the first up to 10.5 m', () => {
    expect(BASE.filter(b => b.ghost)).toHaveLength(16);
    for (const [cz, sign] of [
      [236, 1],
      [44, -1],
    ]) {
      const mine = ghosts.filter(b => Math.abs((b.min[2] + b.max[2]) / 2 - cz) < 1e-6);
      expect(mine).toHaveLength(16);
      expect(Math.max(...mine.map(b => b.max[1]))).toBe(17);
      expect(Math.min(...mine.filter(b => b.min[1] === 0).map(b => b.max[1]))).toBe(10.5);
      expect(sign * (cz - 140)).toBeGreaterThan(0);
    }
    // Higher than a double jump from a module roof: 5 + apex + the second jump's rise, with a margin.
    expect(10.5).toBeGreaterThan(5 + APEX + 6 ** 2 / (2 * HALF) + 0.5);
  });

  it('covers the drawn shell from outside: every point of its surface is inside a band', () => {
    for (const [cx, cz] of LAYOUT.domes) {
      for (let y = 0.1; y < 17; y += 0.4) {
        for (let deg = 0; deg < 360; deg += 1) {
          const r = shell(y) - 0.01;
          const [x, z] = [
            cx + r * Math.cos((deg * Math.PI) / 180),
            cz + r * Math.sin((deg * Math.PI) / 180),
          ];
          expect(
            ghosts.some(
              b =>
                b.min[0] <= x &&
                x <= b.max[0] &&
                b.min[2] <= z &&
                z <= b.max[2] &&
                b.min[1] <= y &&
                y <= b.max[1],
            ),
            `${x.toFixed(2)}, ${y.toFixed(1)}, ${z.toFixed(2)}`,
          ).toBe(true);
        }
      }
    }
  });

  it('lays out the domes, the modules and the tubes the scenery draws on: both halves, each tube from its module to the dome', () => {
    const { domes, modules, tubes } = LAYOUT;
    expect([domes.length, modules.length, tubes.length]).toEqual([2, 4, 4]);
    expect(domes[1]).toEqual([80, ZED - 236]);
    const has = (b: { min: number[]; max: number[] }) =>
      brushes.some(c => [0, 1, 2].every(k => c.min[k] === b.min[k] && c.max[k] === b.max[k]));
    for (const b of [...modules, ...tubes]) {
      expect(has(b)).toBe(true);
    }
    // Each tube reaches the module it joins (the first its west face, the second its north face).
    expect(tubes[0].max[0]).toBe(modules[0].min[0]);
    expect(tubes[1].min[2]).toBe(modules[1].max[2]);
    expect(tubes[0].min[2]).toBeGreaterThanOrEqual(modules[0].min[2]);
    expect(tubes[1].min[0]).toBeGreaterThanOrEqual(modules[1].min[0]);
    // And each touches the dome's ghost shell, a metre or so short of the drawn one.
    for (const t of tubes.slice(0, 2)) {
      const [cx, cz] = domes[0];
      const touching = ghosts.some(
        g =>
          g.min[1] === 0 &&
          Math.abs(cz - (g.min[2] + g.max[2]) / 2) < 30 &&
          [0, 2].some(
            a =>
              Math.abs(t.min[a] - g.max[a]) < 1e-6 ||
              Math.abs(t.max[a] - g.min[a]) < 1e-6 ||
              Math.abs(t.min[a] - g.min[a]) < 1e-6 ||
              Math.abs(t.max[a] - g.max[a]) < 1e-6,
          ) &&
          t.min[0] <= g.max[0] + 1e-6 &&
          t.max[0] >= g.min[0] - 1e-6 &&
          t.min[2] <= g.max[2] + 1e-6 &&
          t.max[2] >= g.min[2] - 1e-6,
      );
      expect(touching, `tube at ${t.min}`).toBe(true);
      expect(cx).toBe(80);
    }
  });
});

describe('MOON, the base flown with the real physics', () => {
  /**
   * Walks to within `jd` of a point on a top, then jumps and steers in the air: forward or back so
   * as to land on the point, as a player does. Returns the steps taken, -1 if it never stands there.
   */
  const flyTo = (s: Sim, [x, y, z]: [number, number, number], jd = 99, r = 1.2) =>
    s.until(
      p => p.ground && Math.abs(p.y - y) < 1e-3 && Math.hypot(p.x - x, p.z - z) < r,
      p => {
        const d = Math.hypot(x - p.x, z - p.z);
        if (p.ground) {
          return KEY.FORWARD | (d < jd ? KEY.JUMP : 0);
        }
        const v = (p.vx * (x - p.x) + p.vz * (z - p.z)) / (d || 1);
        const t = Math.max(
          (p.vy + Math.sqrt(Math.max(p.vy ** 2 + 2 * HALF * (p.y - y), 0))) / HALF,
          0.05,
        );
        return v * t < d - 0.3 ? KEY.FORWARD : v * t > d + 0.3 ? KEY.BACK : 0;
      },
      p => toward(p.x, p.z, x, z),
      400,
    );

  it('cannot be stood on or in at the domes: a double jump from a module roof stays under the first band', () => {
    const m = Sim.at(world).put(118, 5, 226, WEST);
    let high = 0;
    m.step(KEY.JUMP, WEST);
    m.until(p => p.vy <= 0, 0, WEST, 100);
    m.step(0, WEST);
    for (let k = 0; k < 100; k++) {
      m.step(k === 0 ? KEY.JUMP : 0, WEST);
      high = Math.max(high, m.p.y);
    }
    expect(high).toBeLessThan(10.5);
    expect(high).toBeGreaterThan(9);
  });

  it('climbs onto the tube tops by the ramps, then jumps up to the module roofs', () => {
    const s = Sim.at(world).put(107, 0, 211, NORTH);
    expect(s.goTo(107, 226, { r: 0.3 })).toBeGreaterThan(0);
    expect(s.p.y).toBeCloseTo(3.5, 2);
    // And the other way: from the tube top up to the first module's roof, 1.5 m.
    const m = Sim.at(world).put(107, 3.5, 226, EAST);
    expect(flyTo(m, [118, 5, 226])).toBeGreaterThanOrEqual(0);
    // The second tube: its ramp from the east, then the second module.
    const t = Sim.at(world).put(109, 0, 208, WEST);
    expect(t.goTo(100, 208, { r: 0.3 })).toBeGreaterThan(0);
    expect(t.p.y).toBeCloseTo(3.5, 2);
  });
});
