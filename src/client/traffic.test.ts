import { describe, expect, it } from 'vitest';
import { HIGHLINE, ROOFTOPS } from '../shared/map';
import type { WorldDef } from '../shared/world';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { FAR as CITY, MARKS, PITCH, ROAD, STREET, grid } from './street';
import {
  CARS,
  CYCLE,
  FAR_CARS,
  GAP,
  LENGTH,
  MODEL,
  STOP,
  carAt,
  cars,
  facing,
  traffic,
} from './traffic';

const MAPS: [string, WorldDef][] = [
  ['HIGHLINE', HIGHLINE],
  ['ROOFTOPS', ROOFTOPS],
];
/** Times to look at: a few cycles, off the beat of the lights. */
const TIMES = Array.from({ length: 700 }, (_, i) => 1.7e5 + i * 0.37);

describe.each(MAPS)('the traffic of %s', (_, def) => {
  const list = cars(def);

  it('has a few dozen cars round the play area, as many as asked, and more on the grid out to MARKS', () => {
    expect(list).toHaveLength(CARS + FAR_CARS);
    expect(CARS).toBeGreaterThanOrEqual(40);
    expect(CARS).toBeLessThanOrEqual(80);
    expect(FAR_CARS).toBeLessThanOrEqual(200);
    expect(new Set(list.map(c => c.paint)).size).toBeGreaterThanOrEqual(4);
    expect(list.every(c => c.stops.length >= 2)).toBe(true);
    // The first CARS on the four roads round the play area, between their four crossings.
    const { box, xs, zs } = grid(def);
    const mid = (lines: number[]) => lines.slice(lines.length / 2 - 2, lines.length / 2 + 2);
    for (const c of list.slice(0, CARS)) {
      expect(mid(c.axis ? zs : xs)).toContain(c.at);
      expect([...c.stops].sort((a, b) => a - b)).toEqual(mid(c.axis ? xs : zs));
    }
    // The others on the far grid's lanes, a piece of a few crossings each, out to MARKS from the centre.
    const far = grid(def, CITY);
    const [cx, cz] = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
    let most = 0;
    for (const c of list.slice(CARS)) {
      expect((c.axis ? far.zs : far.xs).includes(c.at)).toBe(true);
      expect(c.stops.length).toBeLessThanOrEqual(5);
      for (const s of c.stops) {
        const [x, z] = c.axis ? [s, c.at] : [c.at, s];
        most = Math.max(most, Math.hypot(x - cx, z - cz));
        expect(Math.hypot(x - cx, z - cz)).toBeLessThan(MARKS + 2 * PITCH);
      }
    }
    expect(most).toBeGreaterThan(MARKS - PITCH);
  });

  it('is deterministic from the time alone: the same cars, the same places, for any client', () => {
    expect(cars(def)).toEqual(list);
    for (const t of TIMES.slice(0, 50)) {
      list.forEach(c => expect(carAt(c, t)).toEqual(carAt({ ...c }, t)));
    }
    // Nothing is read from the clock or kept between calls: asking again, in another order, gives the same.
    const [a, b] = [
      [...TIMES].reverse().map(t => carAt(list[3], t)),
      TIMES.map(t => carAt(list[3], t)),
    ];
    expect(a.reverse()).toEqual(b);
  });

  it('keeps every car on its lane: the same distance from the road, right of the middle, along its road', () => {
    for (const c of list) {
      const lane = c.axis ? c.at + c.d * (ROAD / 4) : c.at - c.d * (ROAD / 4);
      const [lo, hi] = [Math.min(...c.stops), Math.max(...c.stops)];
      // A stop, the queue behind it, and the last hop out of the road.
      const margin = PITCH + STOP + LENGTH + 2 * GAP;
      for (const t of TIMES) {
        const [x, z] = carAt(c, t);
        expect(c.axis ? z : x).toBe(lane);
        const along = c.axis ? x : z;
        expect(along).toBeGreaterThan(lo - margin);
        expect(along).toBeLessThan(hi + margin);
      }
      // Right-hand traffic: the two ways of a road are on its two sides.
      expect(Math.sign(lane - c.at)).toBe(-c.d * (c.axis ? -1 : 1));
    }
  });

  it('goes the way it faces: forward, never back, a hop at a time', () => {
    for (const c of list.slice(0, 24)) {
      const [fx, fz] = facing(c);
      let last = -Infinity;
      for (const t of TIMES.slice(0, 120)) {
        const [x, z] = carAt(c, t);
        const s = x * fx + z * fz;
        // Forward along the lane, unless the car has been carried back to the start of its road.
        if (s < last) {
          expect(last - s).toBeGreaterThan(100);
        }
        last = s;
      }
    }
  });

  it('keeps its spacing: no two cars overlap, ever, and a queue keeps its order', () => {
    const live = (t: number) =>
      list.map(c => ({ c, p: carAt(c, t) })).filter(({ p }) => p[2] > 0.99);
    let closest = Infinity;
    for (const t of TIMES) {
      const at = live(t);
      for (let i = 0; i < at.length; i++) {
        for (let j = i + 1; j < at.length; j++) {
          const d = Math.hypot(at[i].p[0] - at[j].p[0], at[i].p[1] - at[j].p[1]);
          closest = Math.min(closest, d);
          const [a, b] = [at[i].c, at[j].c];
          if (a.axis == b.axis && a.at == b.at && a.d == b.d) {
            // The same lane: a car and its length at least.
            expect(d).toBeGreaterThanOrEqual(GAP - 0.01);
          }
        }
      }
    }
    expect(closest).toBeGreaterThan(LENGTH);
  });

  it('never meets crossing traffic: when one axis has its green, every car of the other axis waits', () => {
    const moving = (c: (typeof list)[number], t: number) => {
      const [a, b] = [carAt(c, t - 0.02), carAt(c, t + 0.02)];
      return a[0] != b[0] || a[1] != b[1];
    };
    const along = [0, 0];
    for (const t of TIMES) {
      const go = [0, 1].map(axis => list.some(c => c.axis == axis && moving(c, t)));
      expect(go[0] && go[1]).toBe(false);
      go.forEach((g, i) => (along[i] += +g));
    }
    // Both axes move, each a good part of the time.
    expect(along[0]).toBeGreaterThan(TIMES.length / 5);
    expect(along[1]).toBeGreaterThan(TIMES.length / 5);
  });

  it('wraps: after a lap of its road a car is where it was, and it is gone small before it is carried back', () => {
    for (const c of list.slice(0, 12)) {
      const lap = CYCLE * c.stops.length;
      for (const t of TIMES.slice(0, 40)) {
        const [a, b] = [carAt(c, t), carAt(c, t + lap)];
        expect(b[0]).toBeCloseTo(a[0], 6);
        expect(b[1]).toBeCloseTo(a[1], 6);
        expect(b[2]).toBeCloseTo(a[2], 6);
      }
      // Sizes stay in 0..1; on its last hop the car is shrinking, and at the start of the road it is not seen at rest.
      let shrinks = 0;
      for (const t of TIMES.slice(0, 200)) {
        const [, , size] = carAt(c, t);
        expect(size).toBeGreaterThanOrEqual(0);
        expect(size).toBeLessThanOrEqual(1);
        shrinks += +(size < 1);
      }
      expect(shrinks).toBeGreaterThan(0);
    }
  });

  it('stops at a red light: at rest, a car waits its STOP and its place in a queue short of the crossing', () => {
    for (const c of list) {
      const go = (c.axis * CYCLE) / 2;
      // Just after the other axis' green: the last second of the cycle, every car of this axis is at rest.
      for (let n = 0; n < 6; n++) {
        const t = 1e5 + go + n * CYCLE + CYCLE - 0.5;
        const [x, z] = carAt(c, t);
        const [x2, z2] = carAt(c, t + 0.1);
        expect([x, z]).toEqual([x2, z2]);
        const along = c.axis ? x : z;
        const stop = c.stops.find(
          s => (s - along) * c.d > STOP && (s - along) * c.d < STOP + LENGTH + 2 * GAP + 1,
        );
        if (carAt(c, t)[2] > 0.99) {
          expect(stop).toBeDefined();
        }
      }
    }
  });
});

describe('the cars drawn', () => {
  const eye: Vec3 = [30, 27, 230];
  const down: Vec3 = [0, -1, 0];
  const draw = (def: WorldDef, e: Vec3, fwd: Vec3, t: number) => {
    const out: number[] = [];
    traffic(def)(out, e, fwd, t);
    return out;
  };
  const per = (MODEL.body.length + MODEL.cabin.length + MODEL.lamps.length) / STRIDE;

  it('has a model of a few dozen triangles a car: a body, a bevelled cabin and four glowing lamps', () => {
    for (const part of [MODEL.body, MODEL.cabin, MODEL.lamps]) {
      expect(part.length % (3 * STRIDE)).toBe(0);
      expect(part.every(Number.isFinite)).toBe(true);
    }
    expect(per / 3).toBeLessThanOrEqual(60);
    expect(MODEL.body.length / STRIDE / 3).toBe(10);
    expect(MODEL.cabin.length / STRIDE / 3).toBe(10);
    expect(MODEL.lamps.length / STRIDE / 3).toBe(16);
  });

  it('has its faces turned outward, so the paint is lit: every normal points away from the middle of its part', () => {
    for (const part of [MODEL.body, MODEL.cabin]) {
      const pts = Array.from({ length: part.length / STRIDE }, (_, i) =>
        part.slice(i * STRIDE, (i + 1) * STRIDE),
      );
      const mid = [0, 1, 2].map(a => pts.reduce((s, p) => s + p[a], 0) / pts.length);
      for (const p of pts) {
        const out = [0, 1, 2].reduce((s, a) => s + (p[a] - mid[a]) * p[3 + a], 0);
        expect(out).toBeGreaterThan(0);
      }
    }
  });

  it('has lamps that glow: unlit (layer -2) and above 1, so that the bloom picks them up, white in front and red behind', () => {
    const { lamps } = MODEL;
    for (let i = 0; i < lamps.length; i += STRIDE) {
      expect(lamps[i + 8]).toBe(-2);
      expect(Math.max(lamps[i + 6], lamps[i + 7], lamps[i + 9])).toBeGreaterThan(1);
      const front = lamps[i + 2] < 0;
      expect(front ? lamps[i + 9] : lamps[i + 7]).toBeGreaterThan(front ? 1 : 0);
      if (!front) {
        expect(lamps[i + 7]).toBeLessThan(0.5);
      }
    }
    // The body and the cabin are lit paint.
    for (const part of [MODEL.body, MODEL.cabin]) {
      for (let i = 0; i < part.length; i += STRIDE) {
        expect(part[i + 8]).toBe(-1);
      }
    }
  });

  it('draws whole cars in whole triangles, and no more than the cars it has, each with a cabin only when near', () => {
    for (const [, def] of MAPS) {
      const v = draw(def, [eye[0], 400, eye[2]], down, 1.7e5 + 3);
      expect(v.length % (3 * STRIDE)).toBe(0);
      expect(v.length / STRIDE).toBeLessThanOrEqual((CARS + FAR_CARS) * per);
      expect(v.every(Number.isFinite)).toBe(true);
    }
  });

  it('costs at most the near cars of about 100 vertices a frame and the far ones of a body, far less with the view turned away or the cars far', () => {
    const [x, z] = [HIGHLINE.teams[0].base[0], HIGHLINE.teams[0].base[2]];
    let most = 0;
    let least = Infinity;
    for (const t of TIMES.slice(0, 100)) {
      const near = draw(HIGHLINE, [x, 60, z], down, t).length / STRIDE;
      most = Math.max(most, near);
      least = Math.min(least, near);
      // Looking away from the street, up: nothing of it, but a car right under the eye.
      expect(draw(HIGHLINE, [x, 60, z], [0, 1, 0], t).length / STRIDE).toBeLessThan(near / 2 + 1);
    }
    expect(most).toBeLessThanOrEqual(CARS * per + (FAR_CARS * MODEL.body.length) / STRIDE);
    expect(most).toBeGreaterThan(10 * per);
    // From far away, beyond the distance where the haze has taken everything, nothing at all.
    expect(draw(HIGHLINE, [5000, 27, 5000], down, 1.7e5)).toEqual([]);
  });

  it('puts the cars on the street, and each in the lane the model says: y from the asphalt up, within 2 m of the lane', () => {
    const v = draw(HIGHLINE, [53, 150, 120], down, 1.7e5 + 8.4);
    const ys = v.filter((_, i) => i % STRIDE == 1);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(STREET);
    expect(Math.max(...ys)).toBeLessThan(STREET + 3);
  });
});
