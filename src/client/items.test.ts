import { describe, expect, it } from 'vitest';
import { compile } from '../shared/level';
import { ITEM, TEX } from '../shared/types';
import type { MapDef, Sector } from '../shared/types';
import { ITEM_COLOR, css, gates, item, pad, props } from './items';
import { STRIDE } from './mesh';

const room = (pts: [number, number][], floor = 0): Sector => ({
  pts,
  floor,
  ceil: 3,
  ft: TEX.TILE,
  wt: TEX.BRICK,
  ct: TEX.STONE,
});
// Room 0 and room 2 joined by sector 1, a 1 m wide doorway behind a red gate. Room 0 is the exit.
const MAP: MapDef = {
  sectors: [
    room([
      [0, 0],
      [4, 0],
      [4, 1.5],
      [4, 2.5],
      [4, 4],
      [0, 4],
    ]),
    room([
      [4, 1.5],
      [5, 1.5],
      [5, 2.5],
      [4, 2.5],
    ]),
    room(
      [
        [5, 0],
        [9, 0],
        [9, 4],
        [5, 4],
        [5, 2.5],
        [5, 1.5],
      ],
      0.5,
    ),
  ],
  spawns: [[1, 1, 0]],
  gates: [{ sector: 1, key: ITEM.KEY_RED }],
  goal: [7, 2],
  exit: 0,
};

const BOX = 36 * STRIDE;
const boxes = (v: number[]) => v.length / BOX;
/** Layer of each box (every vertex of a box carries the same one). */
const layers = (v: number[]) => Array.from({ length: boxes(v) }, (_, b) => v[b * BOX + 8]);
const ys = (v: number[]) => v.filter((_, i) => i % STRIDE == 1);
const draw = (f: (out: number[]) => void) => {
  const out: number[] = [];
  f(out);
  return out;
};

describe('item', () => {
  const health = { id: 1, kind: ITEM.HEALTH, x: 2, y: 0, z: 3 };

  it('draws health as a white box with a red cross', () => {
    const v = draw(o => item(o, health, 0));
    expect(boxes(v)).toBe(4);
    expect(v.slice(6, 8).concat(v[9])).toEqual(ITEM_COLOR[ITEM.HEALTH]);
    const [r, g, b] = [v[BOX + 6], v[BOX + 7], v[BOX + 9]];
    expect(r).toBeGreaterThan(g * 4);
    expect(r).toBeGreaterThan(b * 4);
    expect(new Set(layers(v))).toEqual(new Set([-1]));
  });

  it('draws a key as a glowing ring on a shaft with teeth, in its colour', () => {
    for (const kind of [ITEM.KEY_RED, ITEM.KEY_BLUE, ITEM.KEY_YELLOW]) {
      const v = draw(o => item(o, { ...health, kind }, 0));
      expect(boxes(v)).toBe(5);
      expect(layers(v)).toEqual([-2, -1, -1, -1, -1]);
      expect([v[6], v[7], v[9]]).toEqual(ITEM_COLOR[kind]);
      expect([v[2 * BOX + 6], v[2 * BOX + 7], v[2 * BOX + 9]]).toEqual(ITEM_COLOR[kind]);
    }
  });

  it('hovers above the floor, bobbing, and spins', () => {
    const [a, b] = [0, 1].map(t => draw(o => item(o, health, t)));
    expect(Math.min(...ys(a))).toBeGreaterThan(0.1);
    expect(Math.max(...ys(a))).toBeLessThan(0.9);
    expect(Math.max(...ys(a))).not.toBeCloseTo(Math.max(...ys(b)));
    expect(a.slice(0, 3)).not.toEqual(b.slice(0, 3));
    // The centre stays on the item's vertical.
    const xs = (v: number[]) => v.filter((_, i) => i % STRIDE == 0);
    expect((Math.min(...xs(b)) + Math.max(...xs(b))) / 2).toBeCloseTo(2, 5);
  });

  it('keeps a key turned about its own axis: the shaft stays under the ring', () => {
    const v = draw(o => item(o, { ...health, kind: ITEM.KEY_RED }, 1.3));
    const centre = (b: number) => {
      const s = v.slice(b * BOX, (b + 1) * BOX);
      const at = (k: number) => s.filter((_, i) => i % STRIDE == k);
      return [0, 2].map(k => (Math.min(...at(k)) + Math.max(...at(k))) / 2);
    };
    expect(centre(0)[0]).toBeCloseTo(centre(2)[0]);
    expect(centre(0)[1]).toBeCloseTo(centre(2)[1]);
  });
});

describe('gates', () => {
  const lvl = compile(MAP);
  const frame = (barred: number[], t = 0) => {
    lvl.barred = new Set(barred);
    return draw(o => gates(o, lvl, t));
  };

  it('bars each portal edge of a barred gate: upright bars and two rails', () => {
    // Two portal edges of 1 m, a bar every 0.3 m at most: 4 bars and 2 rails each.
    const v = frame([0, 1]);
    expect(boxes(v)).toBe(2 * 6);
    expect(new Set(layers(v))).toEqual(new Set([-1]));
    expect(v.slice(6, 8).concat(v[9])).toEqual(ITEM_COLOR[ITEM.KEY_RED]);
  });

  it('spans the opening, from the higher floor to the lower ceiling', () => {
    const v = frame([0, 1]);
    // The edge into room 2 comes first and opens from its floor, 0.5; the other from 0.
    for (const [b, floor] of [
      [0, 0.5],
      [6, 0],
    ]) {
      for (let i = 0; i < 4; i++) {
        const y = ys(v.slice((b + i) * BOX, (b + i + 1) * BOX));
        expect(Math.min(...y)).toBeCloseTo(floor);
        expect(Math.max(...y)).toBeCloseTo(3);
      }
    }
  });

  it('draws none once the gate is open', () => {
    expect(frame([0])).toHaveLength(0);
  });

  it('draws no bars across a barred exit, or for a barred sector that is no gate', () => {
    expect(frame([0, 2])).toHaveLength(0);
  });

  it('frames the doorways of the open exit with a pulsing glow', () => {
    const [a, b] = [frame([1], 0), frame([1], 0.4)];
    expect(boxes(a)).toBe(6 * 2 + 4);
    expect(layers(a).slice(-4)).toEqual([-2, -2, -2, -2]);
    // Green, and it pulses.
    expect(a[6 + 12 * BOX]).toBeLessThan(a[7 + 12 * BOX]);
    expect(a[7 + 12 * BOX]).not.toBeCloseTo(b[7 + 12 * BOX]);
  });

  it('glows with the exit open and no gate barred', () => {
    expect(boxes(frame([]))).toBe(4);
  });

  it('draws nothing for a level without gates or exit', () => {
    const plain = compile({ ...MAP, gates: undefined, exit: undefined });
    expect(draw(o => gates(o, plain, 0))).toHaveLength(0);
  });
});

describe('pad', () => {
  const lvl = compile(MAP);

  it('lays a glowing pad on the goal floor, with a crystal above it', () => {
    const v = draw(o => pad(o, lvl, 0));
    expect(boxes(v)).toBe(3);
    expect(layers(v)).toEqual([-2, -2, -2]);
    expect(Math.min(...ys(v.slice(0, BOX)))).toBeCloseTo(0.5, 1);
    expect(Math.min(...ys(v.slice(0, BOX)))).toBeGreaterThanOrEqual(0.5);
    expect(Math.min(...ys(v.slice(2 * BOX)))).toBeGreaterThan(1);
  });

  it('pulses', () => {
    const [a, b] = [0, 0.4].map(t => draw(o => pad(o, lvl, t)));
    expect(a[6]).not.toBeCloseTo(b[6]);
  });

  it('is absent without a goal, or one outside the map', () => {
    for (const goal of [undefined, [50, 50] as [number, number]]) {
      expect(draw(o => pad(o, compile({ ...MAP, goal }), 0))).toHaveLength(0);
    }
  });
});

describe('props', () => {
  it('adds up the items, the gates and the pad', () => {
    const lvl = compile(MAP);
    lvl.barred = new Set([0, 1]);
    const items = [
      { id: 0, kind: ITEM.HEALTH, x: 1, y: 0, z: 1 },
      { id: 1, kind: ITEM.KEY_BLUE, x: 2, y: 0, z: 1 },
    ];
    expect(boxes(draw(o => props(o, lvl, items, 0)))).toBe(4 + 5 + 12 + 3);
  });
});

describe('css', () => {
  it('writes a 0 to 1 colour as rgba', () => {
    expect(css([1, 0.5, 0], 0.25)).toBe('rgba(255,128,0,0.25)');
  });
});
