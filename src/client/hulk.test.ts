import { describe, expect, it } from 'vitest';
import {
  AWNING,
  BEACH,
  DECKS,
  HULL as SHAPE,
  LAYOUT,
  RISE,
  SHIP,
  ZED,
  LINES,
  CABIN,
  thick,
} from '../shared/beach';
import { build } from '../shared/world';
import { TEAM_TINT } from '../shared/map';
import { canopy, hulk, parts } from './hulk';
import { TRIM } from './hulk/common';
import { MAX_TINTS, city, palette } from './render';
import { CANOPY, DULL, HULL, TARP } from './paint';
import { STRIDE } from './mesh';
import { TEX } from '../shared/types';

const MID = ZED / 2;
const made = parts(BEACH);
const count = (v: number[]) => v.length / STRIDE;
/** A part's vertices, one array each. */
const verts = (v: number[]) =>
  Array.from({ length: count(v) }, (_, i) => v.slice(i * STRIDE, (i + 1) * STRIDE));
const of = (kind: string) => LAYOUT.pieces.filter(p => p.kind === kind);
/** The section a point at x is in. */
const sectionAt = (x: number) => SHAPE.sections.findIndex(([x0, x1]) => x >= x0 && x <= x1);

/** How far a point is from the surface of the nearest of `boxes`, inside or out. */
const gap = (p: number[], boxes: { min: number[]; max: number[] }[]) =>
  Math.min(
    ...boxes.map(({ min, max }) => {
      const d = [0, 1, 2].map(i => Math.max(min[i] - p[i], p[i] - max[i]));
      const out = Math.hypot(...d.map(v => Math.max(v, 0)));
      return out > 0 ? out : -Math.max(...d);
    }),
  );
/** The middles of a part's triangles in the hull's paint. */
const painted = (v: number[]) => {
  const l = verts(v);
  return l
    .filter((p, i) => i % 3 === 0 && p[8] === HULL)
    .map((_, i) => [0, 1, 2].map(k => (l[3 * i][k] + l[3 * i + 1][k] + l[3 * i + 2][k]) / 3));
};

describe('hulk', () => {
  it('is the same every time: whole triangles of finite numbers, their normals unit', () => {
    const v = hulk(BEACH);
    expect(v).toEqual(hulk(BEACH));
    expect(v.length % (3 * STRIDE)).toBe(0);
    expect(v.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < v.length; i += STRIDE) {
      expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1, 5);
    }
    expect(v.length).toBe(Object.values(made).reduce((n, p) => n + p.length, 0));
  });

  it('keeps each part within its share: under 222,000 vertices in all', () => {
    // Torn metal in petals, each with a bare back (2026-11-26): hull 33,744, ends 2,244, wings 7,224, debris 27,246.
    expect(count(made.hull)).toBeLessThan(35_000);
    expect(count(made.ends)).toBeLessThan(2_500);
    // An airliner's cabin, rounded (the user, 2026-11-27): inside 14,784, cabin 127,290 (seats about
    // 80,000, luggage 18,600, trim 15,000, the dead captain the marine's body at LOD 1, 11,736).
    expect(count(made.inside)).toBeLessThan(16_000);
    expect(count(made.cabin)).toBeLessThan(130_000);
    expect(count(made.wings)).toBeLessThan(8_000);
    expect(count(made.debris)).toBeLessThan(28_500);
    // The tarpaulins' hems and the crates' corner battens (2026-11-26): 6,348.
    expect(count(made.camps)).toBeLessThan(7_000);
    expect(count(hulk(BEACH))).toBeLessThan(222_000);
  });

  it('keeps the seats, galleys and luggage against the flanks, clear of the ways through, the doors and the tears', () => {
    // Under the upper deck (the flight deck and the nose's lining are over it), and under head
    // height: the trim along the ceilings runs over the runners' heads.
    const seats = verts(made.cabin).filter(v => {
      const c = SHAPE.axis[sectionAt(v[0])];
      return (
        v[0] < 95 &&
        v[1] < c + DECKS[1] &&
        [LINES[1], LINES[4]].every(h => Math.abs(v[1] - c - h) > 0.5)
      );
    });
    expect(seats.length).toBeGreaterThan(5_000);
    const bad = seats.filter(v => {
      const n = sectionAt(v[0]);
      const c = SHAPE.axis[n];
      return (
        Math.abs(v[2] - MID) < 2.9 ||
        SHIP[n].tears.some(
          ([x0, x1, a, b]) => v[0] > x0 && v[0] < x1 && v[1] > c + a && v[1] < c + b,
        )
      );
    });
    expect(bad).toHaveLength(0);
  });

  it('draws the canopy’s glass apart, in its own layer, only past its arch over the sill', () => {
    const glass = verts(canopy());
    expect(glass.length).toBeGreaterThan(300);
    expect(glass.every(v => v[8] === CANOPY && v[0] >= 91.9 && v[1] > SHAPE.axis[2])).toBe(true);
    expect(verts(hulk(BEACH)).some(v => v[8] === CANOPY)).toBe(false);
  });

  it('draws on boxes the level leaves out: every piece of the map is a ghost', () => {
    for (const p of LAYOUT.pieces) {
      const b = BEACH.brushes.find(e =>
        e.min.every((v, i) => v === p.min[i] && e.max[i] === p.max[i]),
      );
      expect(b?.ghost, `${p.kind} at ${p.min}`).toBe(true);
    }
  });

  it('keeps the smooth skin within 0.3 m of the boxes where a body touches it: the flanks over each floor, the back, the ledges', () => {
    const boxes = [...of('skin'), ...of('deck'), ...of('fairing')];
    // Not where it is burnt (the teeth of the torn edges reach into the openings), not the nose
    // past the wall in the trees, not under a fairing nor under the lowest floor, in the ground.
    const skin = verts(made.hull).filter(
      v =>
        v[8] === HULL &&
        v[6] > 0.3 &&
        v[0] < 94 &&
        !(v[4] < -0.2 && Math.abs(v[2] - MID) > 6.5 && v[1] > 3) &&
        v[1] > SHAPE.axis[sectionAt(v[0])] - 5.01,
    );
    expect(skin.length).toBeGreaterThan(10_000);
    let worst = 0;
    for (const v of skin) {
      worst = Math.max(worst, Math.abs(gap(v, boxes)));
    }
    expect(worst).toBeLessThan(0.3);
    // Smooth: no flat facet's normal on the flanks, each a blend of its neighbours'.
    const flank = skin.filter(v => Math.abs(v[2] - MID) > 5 && v[0] > 46 && v[0] < 72);
    expect(new Set(flank.map(v => v[4].toFixed(3))).size).toBeGreaterThan(12);
  });

  it('draws the walked back of each section where its flat top is, facing up', () => {
    SHAPE.sections.forEach(([x0], n) => {
      const y = SHAPE.axis[n] + SHAPE.r;
      const back = verts(made.hull).filter(
        v => v[8] === HULL && v[4] > 0.99 && Math.abs(v[1] - y) < 1e-9 && sectionAt(v[0]) === n,
      );
      const xs = back.map(v => v[0]);
      expect(Math.min(...xs)).toBe(x0);
      expect(Math.max(...xs)).toBeGreaterThan(n > 1 ? 91 : SHAPE.sections[n][1] - 1e-9);
      expect(back.some(v => v[2] === MID)).toBe(true);
    });
    // The fairings' ledges on the middle section, where they are walked.
    const ledge = verts(made.hull).filter(
      v => v[4] > 0.9 && Math.abs(v[1] - 8.5) < 1e-9 && Math.abs(v[2] - MID) > 10,
    );
    expect(ledge.length).toBeGreaterThan(40);
  });

  it('opens the skin where the map is open: the tears in the flanks and the holes in the back', () => {
    const at = painted(made.hull);
    SHIP.forEach(({ tears, holes }, n) => {
      const c = SHAPE.axis[n];
      for (const [x0, x1, a, b] of tears) {
        const inside = (p: number[], grow: number) =>
          Math.abs(p[2] - MID) > 4 &&
          p[0] > x0 - grow &&
          p[0] < x1 + grow &&
          p[1] > c + a - grow &&
          p[1] < c + b + grow;
        // Nothing but the teeth of its torn edge within 0.45 m of them, and skin all round it.
        const far = (p: number[]) => inside(p, -0.45);
        expect(at.filter(far), `tear at ${x0}`).toHaveLength(0);
        expect(at.filter(p => inside(p, 1.5)).length).toBeGreaterThan(40);
      }
      for (const [deck, x0, x1] of holes.filter(e => e[0] === 2)) {
        const hole = at.filter(
          p => p[1] > c + 6.99 && Math.abs(p[2] - MID) < 0.8 && p[0] > x0 && p[0] < x1,
        );
        expect(hole, `hole ${deck} at ${x0}`).toHaveLength(0);
        expect(
          at.filter(p => p[1] > c + 6.99 && p[0] > x0 - 1.5 && p[0] < x1 + 1.5).length,
        ).toBeGreaterThan(8);
      }
    });
    // The lining is open there too: one sees in, and out.
    const [x0, x1, a, b] = SHIP[1].tears[1];
    const lining = verts(made.inside).filter(
      (v, i) =>
        i % 6 === 0 &&
        Math.abs(v[3]) < 0.01 &&
        Math.abs(v[2] - MID) > 5.9 &&
        v[0] > x0 &&
        v[0] < x1 - 0.5 &&
        v[1] > SHAPE.axis[1] + a &&
        v[1] < SHAPE.axis[1] + b - 0.5,
    );
    expect(lining).toHaveLength(0);
  });

  it('lays no level face of a tear’s frame on a deck’s top or underside, where the two would fight', () => {
    const l = verts(made.hull);
    let frames = 0;
    SHIP.forEach((_, n) => {
      const faces = DECKS.slice(0, 2).flatMap(h => [h, h - 0.3].map(e => SHAPE.axis[n] + e));
      const [x0, x1] = SHAPE.sections[n];
      for (let i = 0; i < l.length; i += 3) {
        const t = l.slice(i, i + 3);
        const y = t[0][1];
        if (
          t[0][0] >= x0 &&
          t[0][0] <= x1 &&
          t.every(v => v[8] === -1 && v[6] === TRIM.c[0] && Math.abs(v[1] - y) < 1e-3)
        ) {
          frames++;
          expect(
            faces.some(f => Math.abs(f - y) < 5e-3),
            `at ${t[0]}`,
          ).toBe(false);
        }
      }
    });
    // The frames are flat grey since 2026-11-27 (brushed steel shimmered there): still found.
    expect(frames).toBeGreaterThan(50);
  });

  it('hangs no lamp or cable under a hole: nothing would hold it there', () => {
    const soot = verts(made.inside).filter(v => v[8] === -1 && v[6] < 0.04 && v[7] < 0.04);
    expect(soot.length).toBeGreaterThan(100);
    SHIP.forEach(({ holes }, n) => {
      const c = SHAPE.axis[n];
      for (const [deck, x0, x1, half] of holes) {
        const top = c + (deck > 1 ? 6.8 : DECKS[deck]);
        const under = soot.filter(
          v =>
            v[0] > x0 && v[0] < x1 && Math.abs(v[2] - MID) < half && v[1] > top - 0.4 && v[1] < top,
        );
        expect(under, `hole ${deck} at ${x0}`).toHaveLength(0);
      }
    });
  });

  it('lays each wing as thin slabs through the tops of its rows: a foot sinks or floats half a row’s rise at most', () => {
    const rows = of('wingpiece');
    const skin = verts(made.wings).filter(v => v[8] === HULL);
    const top = skin.filter(v => v[4] > 0.9);
    expect(top.length).toBeGreaterThan(1_000);
    let worst = 0;
    let found = 0;
    for (const v of top) {
      const row = rows.find(p => v[2] >= p.min[2] - 1e-6 && v[2] <= p.max[2] + 1e-6);
      if (row) {
        found++;
        worst = Math.max(worst, Math.abs(v[1] - row.max[1]));
      }
    }
    expect(found).toBeGreaterThan(900);
    expect(worst).toBeLessThanOrEqual(RISE / 2 + 1e-6);
    // Thin: the underside no deeper under a row's top than the wing is thick there, 0.6 m at the root.
    for (const v of skin.filter(p => p[4] < -0.5)) {
      const row = rows.find(p => v[2] >= p.min[2] - 1e-6 && v[2] <= p.max[2] + 1e-6);
      if (row) {
        expect(row.max[1] - v[1]).toBeLessThan(thick(0) + RISE / 2 + 1e-6);
        expect(row.max[1] - v[1]).toBeGreaterThan(-RISE / 2 - 1e-6);
      }
    }
    expect(thick(0)).toBeCloseTo(0.6, 9);
    expect(thick(47.5)).toBeCloseTo(0.15, 9);
  });

  it('draws every piece of debris and of the camps on its box, twins alike', () => {
    const all = [...verts(made.debris), ...verts(made.camps)];
    const kinds = [
      'heap',
      'frame',
      'raft',
      'engine',
      'float',
      'rail',
      'pod',
      'dais',
      'crate',
      'panel',
      'container',
      'gear',
      'shelter',
    ];
    for (const kind of kinds) {
      const n = of(kind).map(
        ({ min, max }) =>
          all.filter(v => [0, 1, 2].every(i => v[i] > min[i] - 0.06 && v[i] < max[i] + 0.06))
            .length,
      );
      expect(Math.min(...n), kind).toBeGreaterThanOrEqual(24);
    }
    // The fallen engine lies on its strips, one in each half.
    for (const red of [true, false]) {
      const strips = of('fallen').filter(p => p.min[2] > MID === red);
      const on = all.filter(v =>
        strips.some(
          ({ min, max }) =>
            [0, 2].every(i => v[i] > min[i] && v[i] < max[i]) && v[1] < max[1] + 0.1,
        ),
      );
      expect(on.length).toBeGreaterThan(600);
    }
    // Red's and blue's are twins: as many vertices on each side of the line.
    for (const part of [made.camps, made.wings]) {
      const red = verts(part).filter(v => v[2] > MID).length;
      expect(red * 2).toBe(count(part));
    }
  });

  it('paints each camp in its team’s colour: the flag’s step, the tarpaulins, the pod’s band', () => {
    TEAM_TINT.forEach((tint, k) => {
      const mine = verts(made.camps).filter(
        v => (v[8] === -1 || v[8] === TARP) && v[2] > MID === !k,
      );
      const hue = (v: number[]) => [v[6], v[7], v[9]].map(c => c / Math.max(v[6], v[7], v[9]));
      const want = tint.map(c => c / Math.max(...tint));
      const team = mine.filter(v => hue(v).every((c, i) => Math.abs(c - want[i]) < 1e-6));
      // Two tarpaulins of 432 vertices (their roofs both faces, their hems), the step's top twice, the band of eight faces, two lids.
      expect(team.length).toBeGreaterThanOrEqual(2 * 432 + 12 + 48 + 12);
    });
  });

  it('draws the containers in brushed steel, the tents’ poles in wood and their tarpaulins in cloth up at AWNING', () => {
    const inside = (kind: string) =>
      of(kind).map(({ min, max }) =>
        verts(made.camps.concat(made.debris)).filter(v =>
          [0, 1, 2].every(i => v[i] > min[i] - 0.06 && v[i] < max[i] + 0.06),
        ),
      );
    for (const c of inside('container')) {
      expect(c.filter(v => v[8] === TEX.STEEL + DULL).length / c.length).toBeGreaterThan(0.7);
    }
    const tents = of('shelter');
    const poles = tents.filter(p => p.max[1] - p.min[1] > 1);
    expect(poles).toHaveLength(16);
    for (const p of inside('shelter')) {
      expect(p.every(v => [TEX.WOOD, TARP].includes(v[8]))).toBe(true);
    }
    expect(Math.min(...tents.filter(p => !poles.includes(p)).map(p => p.max[1]))).toBe(AWNING);
  });
  it('lines the cabin in one painted panel, walls and ceilings alike, untinted', () => {
    const paint = verts(made.inside).filter(v => v[8] === TEX.PAINT);
    expect(paint.filter(v => v[4] < -0.9).length).toBeGreaterThan(100);
    expect(paint.filter(v => Math.abs(v[4]) < 0.5).length).toBeGreaterThan(1_000);
    // A texture's tint is its slot in the palette (2 a slot) over its light: white, slot 0.
    expect(paint.every(v => v[9] < 2)).toBe(true);
  });

  it('tints the seats’ cloth and the carpet with the slots the renderer’s palette gives them', () => {
    // The renderer adds the skyline's brushes (city()): their tints must not move the cabin's.
    const keys = palette(city(build(BEACH))).map(String);
    expect(keys.length).toBeLessThanOrEqual(MAX_TINTS);
    const slot = (t: number[]) => keys.indexOf(`${t}`);
    expect(Object.values(CABIN).every(t => slot(t) > 0)).toBe(true);
    const cloth = verts(made.cabin).filter(v => v[8] === TEX.FABRIC);
    expect(cloth.filter(v => Math.floor(v[9] / 2) === slot(CABIN.navy)).length).toBeGreaterThan(
      5_000,
    );
    const carpet = verts(made.inside).filter(v => v[8] === TEX.FABRIC);
    expect(carpet.length).toBeGreaterThan(50);
    expect(carpet.every(v => Math.floor(v[9] / 2) === slot(CABIN.carpet))).toBe(true);
  });

  it('seats the dead captain in the left seat of the flight deck', () => {
    const y = SHAPE.axis[2] + DECKS[1] + 0.44;
    const body = verts(made.cabin).filter(
      v =>
        v[0] > 97.9 &&
        v[0] < 99 &&
        v[1] > y &&
        v[1] < y + 1.1 &&
        Math.abs(v[2] - (MID - 0.85)) < 0.35,
    );
    // The marine's skinned body in white over the seat's cushion, not a few boxes.
    expect(body.filter(v => v[8] === -1 && v[6] > 0.5 && v[7] > 0.5).length).toBeGreaterThan(2_000);
    // Dead: no glow on him, the pouch's spare battery left dark.
    expect(body.filter(v => v[8] === -2)).toEqual([]);
  });
});
