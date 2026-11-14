import { describe, expect, it } from 'vitest';
import { PACK_BITS, RACK_R } from '../shared/constants';
import { GILT, STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { battery, cell, kit, packsOf, rack, racks, vest } from './props';

const PACKS: Vec3[] = [
  [1, 0, 0],
  [2, 0, 0],
  [3, 0, 0],
  [4, 0, 0],
];
const drawn = (f: (out: number[]) => void) => {
  const out: number[] = [];
  f(out);
  expect(out.length % (3 * STRIDE)).toBe(0);
  expect(out.every(Number.isFinite)).toBe(true);
  return Array.from({ length: out.length / STRIDE }, (_, i) =>
    out.slice(i * STRIDE, (i + 1) * STRIDE),
  );
};

describe('packsOf', () => {
  it('keeps the packs whose bit is set', () => {
    expect(packsOf(PACKS, 0b0101)).toEqual([PACKS[0], PACKS[2]]);
    expect(packsOf(PACKS, 0b1111)).toEqual(PACKS);
  });

  it('gives none for no bit, no mask or no packs', () => {
    expect(packsOf(PACKS, 0)).toEqual([]);
    expect(packsOf(PACKS)).toEqual([]);
    expect(packsOf(undefined, 7)).toEqual([]);
  });

  it('reads the ammo packs after the health packs: the bits count from where the health packs end', () => {
    const ammo: Vec3[] = [
      [10, 0, 0],
      [20, 0, 0],
    ];
    // Three health packs: bits 0 to 2, then the ammo packs on bits 3 and 4.
    expect(packsOf(ammo, 0b01000, 3)).toEqual([ammo[0]]);
    expect(packsOf(ammo, 0b10000, 3)).toEqual([ammo[1]]);
    expect(packsOf(ammo, 0b00111, 3)).toEqual([]);
    expect(packsOf(ammo, 0b11000, 3)).toEqual(ammo);
    // The health packs do not take the ammo packs' bits.
    expect(packsOf(PACKS.slice(0, 3), 0b11000)).toEqual([]);
  });

  it('reads past the 32 bits of the bitwise operators, up to the 48 of the mask', () => {
    const ammo: Vec3[] = [
      [1, 0, 0],
      [2, 0, 0],
      [3, 0, 0],
    ];
    expect(packsOf(ammo, 0xffffffff, 30)).toEqual([ammo[0], ammo[1]]);
    expect(packsOf(ammo, 0xffffffff, 32)).toEqual([]);
    expect(packsOf(ammo, 2 ** 33 + 2 ** 34, 32)).toEqual([ammo[1], ammo[2]]);
  });

  it('reads all 48 bits, the top one included', () => {
    const many = Array.from({ length: PACK_BITS }, (_, i): Vec3 => [i, 0, 0]);
    expect(packsOf(many, 2 ** PACK_BITS - 1)).toHaveLength(PACK_BITS);
    expect(packsOf(many, 2 ** 47)).toEqual([many[47]]);
    expect(packsOf(many, 0x80000000)).toEqual([many[31]]);
  });
});

describe('a health pack', () => {
  it('is a white box with a glowing green cross on each face, around its place', () => {
    const v = drawn(out => kit(out, [10, 5, 20], 0));
    // Six faces and three plates each, two triangles a plate.
    expect(v).toHaveLength(6 * 3 * 6);
    const glow = v.filter(x => x[8] == -2);
    expect(glow).toHaveLength(6 * 2 * 6);
    for (const g of glow) {
      expect(g[7]).toBeGreaterThan(g[6]);
      expect(g[7]).toBeGreaterThan(g[9]);
    }
    // Half a metre across (the user, 2026-11-14: bigger), off the floor.
    expect(Math.max(...v.map(x => x[1])) - Math.min(...v.map(x => x[1]))).toBeGreaterThan(0.5);
    for (const x of v) {
      expect(Math.abs(x[0] - 10)).toBeLessThan(0.4);
      expect(x[1]).toBeGreaterThan(5.1);
      expect(x[1]).toBeLessThan(5.9);
      expect(Math.abs(x[2] - 20)).toBeLessThan(0.4);
      expect(Math.hypot(x[3], x[4], x[5])).toBeCloseTo(1, 5);
    }
  });

  it('bobs and turns with the clock', () => {
    const a = drawn(out => kit(out, [0, 0, 0], 0));
    const b = drawn(out => kit(out, [0, 0, 0], 1));
    expect(b[0].slice(0, 3)).not.toEqual(a[0].slice(0, 3));
    const y = (v: number[][]) => Math.min(...v.map(x => x[1]));
    expect(y(a)).not.toBeCloseTo(y(b), 3);
  });

  it('has its normals outward', () => {
    const v = drawn(out => kit(out, [0, 0, 0], 0.3));
    const c = [0, 1, 2].map(k => v.reduce((s, x) => s + x[k], 0) / v.length);
    for (let i = 0; i < v.length; i += 3) {
      const m = [0, 1, 2].map(k => (v[i][k] + v[i + 1][k] + v[i + 2][k]) / 3 - c[k]);
      expect(v[i][3] * m[0] + v[i][4] * m[1] + v[i][5] * m[2]).toBeGreaterThan(0);
    }
  });
});

describe('an armour', () => {
  const v = drawn(out => vest(out, [10, 5, 20], 0));

  it('is a cuirass of polished green metal, chest and back, about its place (the user, 2026-11-14: as in Quake 3)', () => {
    const shell = v.filter(x => x[8] == GILT);
    expect(shell.length).toBeGreaterThan(1000);
    const green = shell.filter(x => x[7] > 2 * x[6] && x[7] > 2 * x[9]);
    expect(green.length / shell.length).toBeGreaterThan(0.9);
    const [xs, ys, zs] = [0, 1, 2].map(k => v.map(x => x[k]));
    // A torso's size, 0.6 m over the floor, turning about its place.
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.45);
    expect(Math.min(...ys)).toBeGreaterThan(5.2);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.3);
    expect(
      Math.max(...xs.map(x => Math.abs(x - 10)), ...zs.map(z => Math.abs(z - 20))),
    ).toBeLessThan(0.3);
  });

  it('turns the outside of its shell outward, and glows a shield on its chest', () => {
    // The outer sheet: brighter than the inside, its normals away from the upright axis.
    const out = v.filter(x => x[8] == GILT && x[7] > 0.3);
    const away = out.filter(x => x[3] * (x[0] - 10) + x[5] * (x[2] - 20) > 0);
    expect(away.length / out.length).toBeGreaterThan(0.95);
    const glow = v.filter(x => x[8] == -2);
    expect(glow.length).toBeGreaterThan(0);
    expect(glow.every(g => g[7] > 1)).toBe(true);
  });
});

describe('an ammo pack', () => {
  const v = drawn(out => cell(out, [10, 5, 20], 0));

  it('is a violet box with a glowing cyan cartridge on each side, bobbing around its place', () => {
    expect(v.length).toBeGreaterThan(100);
    const glow = v.filter(x => x[8] == -2);
    // A round, a tip and a rim on each of six faces: five triangles.
    expect(glow).toHaveLength(6 * 5 * 3);
    for (const g of glow) {
      expect(g[9]).toBeGreaterThan(1);
      expect(g[7]).toBeGreaterThan(g[6] * 2);
    }
    // The box is violet: more blue than red, and red over green.
    const box = v.filter(x => x[8] == -1);
    expect(box).toHaveLength(6 * 2 * 3);
    for (const x of box) {
      expect(x[9]).toBeGreaterThan(x[6]);
      expect(x[6]).toBeGreaterThan(x[7]);
      expect(Math.abs(x[0] - 10)).toBeLessThan(0.35);
      expect(x[1]).toBeGreaterThan(5.1);
      expect(Math.abs(x[2] - 20)).toBeLessThan(0.35);
    }
  });

  it('is not the health pack: another colour, another glyph', () => {
    const health = drawn(out => kit(out, [10, 5, 20], 0));
    expect(v.filter(x => x[8] == -2)).not.toHaveLength(health.filter(x => x[8] == -2).length);
    expect(v[0].slice(6, 10)).not.toEqual(health[0].slice(6, 10));
  });

  it('has its normals outward, and turns and bobs with the clock', () => {
    const c = [0, 1, 2].map(k => v.reduce((s, x) => s + x[k], 0) / v.length);
    for (let i = 0; i < v.length; i += 3) {
      const m = [0, 1, 2].map(k => (v[i][k] + v[i + 1][k] + v[i + 2][k]) / 3 - c[k]);
      expect(v[i][3] * m[0] + v[i][4] * m[1] + v[i][5] * m[2]).toBeGreaterThan(0);
    }
    const b = drawn(out => cell(out, [10, 5, 20], 1));
    expect(b[0].slice(0, 3)).not.toEqual(v[0].slice(0, 3));
  });
});

describe('a rack', () => {
  const v = drawn(out => rack(out, [4, 3, 8], [1, 0.2, 0.2], 0));

  it('is a stand in the team colour with a gun over it, and a ring on the roof as wide as the pickup', () => {
    expect(v.length).toBeGreaterThan(400);
    const ring = v.filter(x => x[8] == -2 && x[1] < 3.1);
    expect(ring.length).toBeGreaterThan(30);
    expect(Math.max(...ring.map(x => Math.hypot(x[0] - 4, x[2] - 8)))).toBeCloseTo(RACK_R, 1);
    // The post and dish are red, and the gun's violet is over them.
    const stand = v.filter(x => x[1] > 3 && x[1] < 3.8 && x[8] == -1);
    expect(stand.some(x => x[6] > 2 * x[7])).toBe(true);
    expect(Math.max(...v.map(x => x[1]))).toBeGreaterThan(3.9);
  });

  it('is cheap', () => {
    expect(v.length).toBeLessThan(2300);
  });
});

describe('a katana rack', () => {
  const [gun, blade] = [0, 1].map(b => drawn(out => rack(out, [4, 3, 8], [1, 0.2, 0.2], 0, b)));

  it('is the same stand with a katana over it instead of the gun: a ring as wide as the pickup, the blade glowing', () => {
    const ring = blade.filter(x => x[8] == -2 && x[1] < 3.1);
    expect(ring.length).toBe(gun.filter(x => x[8] == -2 && x[1] < 3.1).length);
    expect(Math.max(...ring.map(x => Math.hypot(x[0] - 4, x[2] - 8)))).toBeCloseTo(RACK_R, 1);
    // The katana is longer than the gun and lies level: 1.3 m across, about its middle, 1 m above the roof.
    const over = blade.filter(x => x[1] > 3.8);
    expect(over.length).toBeGreaterThan(200);
    const span = Math.max(...over.map(x => Math.hypot(x[0] - 4, x[2] - 8)));
    expect(span).toBeGreaterThan(0.62);
    expect(span).toBeLessThan(0.7);
    // Cyan light along the edge, which the gun's own rack does not have at that height.
    const edge = over.filter(x => x[8] == -2 && x[7] > 1.5 && x[9] > x[6] * 2);
    expect(edge.length).toBeGreaterThan(100);
    expect(blade.length).toBeLessThan(5000);
  });

  it('turns about its middle, and crackles with the clock', () => {
    const later = drawn(out => rack(out, [4, 3, 8], [1, 0.2, 0.2], 1.3, 1));
    const middle = (v: number[][]) =>
      [0, 2].map(k => {
        const o = v.filter(x => x[1] > 3.8);
        return (Math.max(...o.map(x => x[k])) + Math.min(...o.map(x => x[k]))) / 2;
      });
    expect(middle(later)[0]).toBeCloseTo(4, 0);
    expect(middle(later)[1]).toBeCloseTo(8, 0);
    expect(later.map(x => x[0]).join()).not.toBe(blade.map(x => x[0]).join());
  });
});

describe('a rail gun rack', () => {
  it('is the same stand with the rail gun over it: longer than the gun, its electrodes glowing violet', () => {
    const [gun, rail] = [0, 2].map(k => drawn(out => rack(out, [4, 3, 8], [1, 0.2, 0.2], 0, k)));
    const over = (v: number[][]) => v.filter(x => x[1] > 3.8);
    const span = (v: number[][]) => Math.max(...over(v).map(x => Math.hypot(x[0] - 4, x[2] - 8)));
    expect(span(rail)).toBeGreaterThan(span(gun) * 1.5);
    expect(
      over(rail).filter(x => x[8] == -2 && x[9] > 2 * x[6] && x[9] > 2 * x[7]).length,
    ).toBeGreaterThan(50);
    expect(drawn(out => racks(out, [], [], 0, [[4, 3, 8]])).length).toBe(rail.length);
  });
});

describe('the racks of a scene', () => {
  const count = (guns?: (Vec3 | undefined)[], blades?: (Vec3 | undefined)[]) =>
    drawn(out => racks(out, guns, blades, 0)).length;

  it('draws a katana rack only where a team has a blade point, and the gun rack where it has one', () => {
    const [g, b] = [
      [4, 3, 8],
      [20, 3, 8],
    ] as Vec3[];
    const gunOnly = count([g, undefined]);
    expect(gunOnly).toBe(drawn(out => rack(out, g, [1, 0.2, 0.2], 0)).length);
    expect(count([], [])).toBe(0);
    expect(count([undefined, undefined], [undefined, undefined])).toBe(0);
    expect(count([g, undefined], [undefined, undefined])).toBe(gunOnly);
    expect(count([g, undefined], undefined)).toBe(gunOnly);
    // A blade point adds one katana rack: the same stand and a katana.
    const withBlade = count([g, undefined], [b, undefined]);
    expect(withBlade).toBe(gunOnly + drawn(out => rack(out, b, [1, 0.2, 0.2], 0, 1)).length);
    // Only the second team has one: it is drawn in its colour.
    expect(count([], [undefined, b])).toBe(drawn(out => rack(out, b, [1, 0.2, 0.2], 0, 1)).length);
    expect(count(undefined, undefined)).toBe(0);
  });

  it('paints each rack in the colour of its team', () => {
    const blue = drawn(out => racks(out, [], [undefined, [4, 3, 8]], 0));
    const red = drawn(out => racks(out, [], [[4, 3, 8]], 0));
    const dish = (v: number[][]) => v.find(x => x[1] > 3.7 && x[1] < 3.8 && x[8] == -1)!;
    expect(dish(blue)[9]).toBeGreaterThan(dish(blue)[6]);
    expect(dish(red)[6]).toBeGreaterThan(dish(red)[9]);
  });
});

describe('a rail cell', () => {
  it('is a gunmetal box like the ammo pack, its bolts glowing violet', () => {
    const v = drawn(out => battery(out, [4, 3, 8], 0));
    expect(v.length).toBe(drawn(out => cell(out, [4, 3, 8], 0)).length - 6 * 3 * 3);
    const glow = v.filter(x => x[8] == -2);
    expect(glow.length).toBe(6 * 2 * 3);
    expect(glow.every(x => x[9] > 2 * x[6] && x[9] > 2 * x[7])).toBe(true);
  });
});
