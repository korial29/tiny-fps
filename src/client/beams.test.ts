import { describe, expect, it } from 'vitest';
import { NADE, NADE_R } from '../shared/constants';
import { BOOM, FLASH, SPLASH, createTracer } from './beams';
import type { Orb } from './beams';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';

const EYE: Vec3 = [0, 1.6, 0];
const FROM: Vec3 = [0.2, 1.4, -0.6];
const TO: Vec3 = [0, 1.6, -40];

const drawn = (t: ReturnType<typeof createTracer>) => {
  const out: number[] = [];
  t.draw(out, EYE);
  expect(out.length % STRIDE).toBe(0);
  expect(out.every(Number.isFinite)).toBe(true);
  return Array.from({ length: out.length / STRIDE }, (_, i) =>
    out.slice(i * STRIDE, (i + 1) * STRIDE),
  );
};

describe('the plasma balls', () => {
  const BALL: Orb = { p: [0, 1.6, -10], d: [0, 0, -1], tail: 1 };

  it('draw nothing until there is one, then a halo and a core with their trails, unlit and above 1', () => {
    const t = createTracer();
    expect(drawn(t)).toEqual([]);
    t.orbs([BALL]);
    const v = drawn(t);
    // Two discs of 8 triangles and two trails of 2.
    expect(v).toHaveLength(2 * (24 + 6));
    for (const x of v) {
      expect(x[8]).toBe(-2);
      expect(Math.max(x[6], x[7], x[9])).toBeGreaterThan(1);
    }
    // The halo is blue, the core blue-white and brighter.
    const [halo, core] = [v[0], v[30]];
    expect(halo[9]).toBeGreaterThan(2 * halo[7]);
    expect(core[7]).toBeGreaterThan(halo[7]);
    expect(core[6]).toBeGreaterThan(1);
    // Gone once the list is empty.
    t.orbs([]);
    expect(drawn(t)).toEqual([]);
  });

  it('turn their discs to the eye, round the ball', () => {
    for (const p of [BALL.p, [8, 3, 2], [0, 10, 0.5]] as Vec3[]) {
      const t = createTracer();
      t.orbs([{ ...BALL, p, tail: 0 }]);
      const v = drawn(t);
      expect(v).toHaveLength(48);
      const to = [0, 1, 2].map(k => p[k] - EYE[k]);
      const n = Math.hypot(...to);
      for (const disc of [v.slice(0, 24), v.slice(24)]) {
        const c = disc[0];
        for (const x of disc) {
          const r = [0, 1, 2].map(k => x[k] - c[k]);
          expect(Math.abs(r[0] * to[0] + r[1] * to[1] + r[2] * to[2]) / n).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('trail back along their way for `tail` metres, to a point', () => {
    const t = createTracer();
    t.orbs([{ ...BALL, tail: 1.2 }]);
    const trail = drawn(t).slice(24, 30);
    const zs = trail.map(x => x[2]);
    expect(Math.min(...zs)).toBeCloseTo(-10, 1);
    expect(Math.max(...zs)).toBeCloseTo(-8.8, 1);
    // The far end of the halo's trail is one point.
    const end = trail.filter(x => x[2] > -9);
    expect(new Set(end.map(x => x.slice(0, 3).join())).size).toBe(1);
  });

  it('grow with the distance, so that they stay a few pixels, and shrink near the eye', () => {
    const size = (p: Vec3) => {
      const t = createTracer();
      t.orbs([{ p, d: [0, 0, -1], tail: 0 }]);
      const v = drawn(t);
      return Math.hypot(...[0, 1, 2].map(k => v[1][k] - v[0][k]));
    };
    const [near, mid, far, farther] = [0.6, 5, 12.5, 40].map(z => size([0, 1.6, -z]));
    expect(near).toBeLessThan(mid / 5);
    expect(far / mid).toBeCloseTo(2.5, 6);
    expect(farther).toBeCloseTo(far, 6);
  });

  it('light what they pass: the LIT nearest to the last eye drawn from', () => {
    const t = createTracer();
    const at = (z: number): Orb => ({ ...BALL, p: [0, 1.6, z] });
    t.orbs([at(-50), at(-3), at(-20), at(-8), at(-30), at(-1)]);
    drawn(t);
    const zs = t.lights().map(l => l.p[2]);
    expect(zs).toEqual([-1, -3, -8, -20]);
    for (const l of t.lights()) {
      expect(l.color[2]).toBeGreaterThan(l.color[0]);
    }
  });
});

describe('the charge', () => {
  it('turns a charged ball orange and bigger, its light too', () => {
    const t = createTracer();
    t.orbs([{ p: [0, 1.6, -10], d: [0, 0, -1], tail: 1, power: 5 }]);
    const v = drawn(t);
    for (const x of v) {
      expect(x[6]).toBeGreaterThan(x[9] * 5);
    }
    const plain = createTracer();
    plain.orbs([{ p: [0, 1.6, -10], d: [0, 0, -1], tail: 1 }]);
    const w = (x: number[][]) => Math.hypot(...[0, 1, 2].map(k => x[1][k] - x[0][k]));
    expect(w(v) / w(drawn(plain))).toBeCloseTo(2, 6);
    expect(t.lights()[0].color[0]).toBeGreaterThan(t.lights()[0].color[2]);
  });

  it('lights a charging muzzle orange, swelling with the charge, a few centimetres even at the eye', () => {
    const t = createTracer();
    const size = (k: number) => {
      t.charging([{ p: FROM, k }]);
      const v = drawn(t);
      return Math.max(...v.map(x => Math.hypot(x[0] - FROM[0], x[1] - FROM[1], x[2] - FROM[2])));
    };
    t.charging([]);
    expect(drawn(t)).toEqual([]);
    const [low, full] = [size(0), size(1)];
    expect(full).toBeGreaterThan(low * 2);
    expect(full).toBeGreaterThan(0.04);
    expect(full).toBeLessThan(0.08);
    for (const x of drawn(t)) {
      expect(x[6]).toBeGreaterThan(x[9] * 5);
    }
    expect(t.lights().some(l => l.color[0] > l.color[2] * 5)).toBe(true);
  });

  it('flashes a charged shot orange and bigger', () => {
    const [plain, hot] = [createTracer(), createTracer()];
    plain.flash(TO);
    hot.flash(TO, false, 1);
    const w = (x: number[][]) => Math.hypot(...[0, 1, 2].map(k => x[1][k] - x[0][k]));
    expect(w(drawn(hot)) / w(drawn(plain))).toBeCloseTo(2, 6);
    expect(drawn(hot)[0][6]).toBeGreaterThan(drawn(hot)[0][9]);
  });
});

describe('the flash of a shot', () => {
  it('glows at the muzzle and lights it, smaller and dimmer as it goes, gone in FLASH seconds', () => {
    const t = createTracer();
    t.flash(FROM);
    const v = drawn(t);
    expect(v).toHaveLength(48);
    const [light] = t.lights();
    expect(light.p).toEqual(FROM);
    expect(light.color[2]).toBeGreaterThan(2 * light.color[0]);
    expect(FLASH).toBeCloseTo(0.06, 6);
    const w = (x: number[][]) => Math.hypot(...[0, 1, 2].map(k => x[1][k] - x[0][k]));
    t.update(FLASH / 2);
    expect(w(drawn(t))).toBeLessThan(w(v));
    expect(t.lights()[0].color[2]).toBeLessThan(light.color[2]);
    t.update(FLASH / 2 + 0.001);
    expect(drawn(t)).toEqual([]);
    expect(t.lights()).toEqual([]);
  });

  it('stays on the own muzzle as it moves, and where it was for the others', () => {
    const t = createTracer();
    t.flash(FROM, true);
    t.flash(TO);
    t.mount([1, 1, 1]);
    const v = drawn(t);
    expect(v.slice(0, 24).every(x => Math.hypot(x[0] - 1, x[1] - 1, x[2] - 1) < 0.1)).toBe(true);
    expect(v.slice(48).every(x => Math.hypot(x[0] - TO[0], x[1] - TO[1], x[2] - TO[2]) < 2)).toBe(
      true,
    );
  });
});

describe('the burst of a ball', () => {
  it('splashes: a glow that swells as it fades, a bright light, and sparks round it', () => {
    const t = createTracer();
    t.burst(TO);
    const v = drawn(t);
    // The two discs of the splash, then 12 sparks of 4 triangles.
    expect(v).toHaveLength(48 + 12 * 12);
    const [splash] = t.lights();
    expect(splash.p).toEqual(TO);
    expect(splash.range).toBeGreaterThan(6);
    const w = (x: number[][]) => Math.hypot(...[0, 1, 2].map(k => x[1][k] - x[0][k]));
    t.update(SPLASH / 2);
    expect(w(drawn(t))).toBeGreaterThan(w(v));
    for (const x of drawn(t)) {
      expect(Math.hypot(x[0] - TO[0], x[1] - TO[1], x[2] - TO[2])).toBeLessThan(2);
    }
    t.update(SPLASH / 2 + 0.001);
    expect(t.lights()).toEqual([]);
    // The sparks outlast the splash, a little.
    expect(drawn(t).length).toBeGreaterThan(0);
    t.update(0.5);
    expect(drawn(t)).toEqual([]);
  });

  it('of the laser rifle splashes red, bigger, lights red, and throws twice the sparks', () => {
    const [blue, red] = [createTracer(), createTracer()];
    blue.burst(TO);
    red.burst(TO, true);
    const [b, r] = [drawn(blue), drawn(red)];
    // The two discs of the splash, then 24 sparks of 4 triangles.
    expect(r).toHaveLength(48 + 24 * 12);
    const w = (x: number[][]) => Math.hypot(...[0, 1, 2].map(k => x[1][k] - x[0][k]));
    expect(w(r)).toBeCloseTo(w(b) * 1.6, 6);
    // Red over blue: in the splash's core, and every spark.
    expect(r[0][6]).toBeGreaterThan(r[0][9]);
    expect(r[r.length - 1][6]).toBeGreaterThan(r[r.length - 1][9]);
    const [light] = red.lights();
    expect(light.color[0]).toBeGreaterThan(light.color[2]);
    expect(blue.lights()[0].color[2]).toBeGreaterThan(blue.lights()[0].color[0]);
  });

  it('keeps at most a handful of flashes and splashes, and of sparks', () => {
    const t = createTracer();
    for (let i = 0; i < 100; i++) {
      t.burst(TO);
      t.flash(FROM);
    }
    expect(drawn(t).length).toBeLessThan(16 * 48 + 16 * 12 * 12 + 1);
    expect(t.lights().length).toBeLessThanOrEqual(4);
  });
});

describe('the shock of the katana', () => {
  const AT: Vec3 = [3, 1, -4];

  it('bursts into cyan sparks and bolts around the runner, drawn finite and unlit', () => {
    const t = createTracer();
    t.shock(AT);
    const v = drawn(t);
    expect(v.length).toBeGreaterThan(30);
    for (const x of v) {
      expect(x[8]).toBe(-2);
      // Cyan and white: blue and green over red.
      expect(x[9]).toBeGreaterThan(x[6]);
    }
    // Everything is near him.
    for (const x of v) {
      expect(Math.hypot(x[0] - AT[0], x[1] - AT[1], x[2] - AT[2])).toBeLessThan(2);
    }
  });

  it('flickers out: the bolts in a tenth of a second, the sparks in a quarter', () => {
    const t = createTracer();
    t.shock(AT);
    const n = drawn(t).length;
    t.update(0.1);
    expect(drawn(t).length).toBeGreaterThan(0);
    expect(drawn(t).length).toBeLessThan(n);
    t.update(0.2);
    expect(drawn(t)).toEqual([]);
    expect(t.lights()).toEqual([]);
  });

  it('crackles a few bolts around his middle each frame, short ones, and they do not pile up', () => {
    const t = createTracer();
    for (let i = 0; i < 60; i++) {
      t.crackle(AT);
      t.update(1 / 60);
    }
    const v = drawn(t);
    expect(v.length).toBeGreaterThan(0);
    // A few ribbons of 12 vertices at most each: not hundreds.
    expect(v.length).toBeLessThan(24 * 24);
    for (const x of v) {
      expect(Math.hypot(x[0] - AT[0], x[1] - AT[1], x[2] - AT[2])).toBeLessThan(1.2);
    }
    // Ceases with the shock.
    t.update(0.2);
    expect(drawn(t)).toEqual([]);
  });

  it('draws the same bolts on the same run, and different ones from frame to frame', () => {
    const run = () => {
      const t = createTracer();
      t.crackle(AT);
      t.crackle(AT);
      return drawn(t);
    };
    expect(run()).toEqual(run());
    const t = createTracer();
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) {
      t.update(1);
      t.crackle(AT);
      seen.add(JSON.stringify(drawn(t)));
    }
    expect(seen.size).toBeGreaterThan(5);
  });

  it('lights the shocked runner cyan for a moment, with the light of at most two bolts', () => {
    const t = createTracer();
    t.shock(AT);
    const l = t.lights();
    expect(l.length).toBeGreaterThan(0);
    expect(l.length).toBeLessThanOrEqual(2);
    expect(l[0].color[2]).toBeGreaterThan(l[0].color[0]);
  });
});

describe('the laser rifle\u2019s shots', () => {
  it('are balls in red, smaller than the gun\u2019s, with a red flash', () => {
    const t = createTracer();
    t.orbs([{ p: [0, 1.6, -10], d: [0, 0, -1], tail: 1, power: 0 }]);
    const red = drawn(t);
    expect(red.length).toBeGreaterThan(0);
    for (const x of red) {
      expect(x[6]).toBeGreaterThan(x[9]);
    }
    const blue = createTracer();
    blue.orbs([{ p: [0, 1.6, -10], d: [0, 0, -1], tail: 1 }]);
    const span = (v: number[][]) => Math.max(...v.map(x => x[0])) - Math.min(...v.map(x => x[0]));
    expect(span(red)).toBeLessThan(span(drawn(blue)));
    const f = createTracer();
    f.flash(FROM, true, -1);
    for (const x of drawn(f)) {
      expect(x[6]).toBeGreaterThan(x[9]);
    }
  });
});

describe('a grenade', () => {
  it('is a small orange core with a thin trail in flight, and lights what it passes', () => {
    const t = createTracer();
    t.orbs([{ p: [0, 1.6, -10], d: [0, -0.6, -0.8], tail: 1, power: NADE }]);
    const v = drawn(t);
    expect(v).toHaveLength(2 * (24 + 6));
    for (const x of v) {
      expect(x[8]).toBe(-2);
      expect(x[6]).toBeGreaterThan(2 * x[9]);
    }
    expect(t.lights()).toHaveLength(1);
  });

  it('bursts in a fireball that swells and shrinks away within NADE_R, with embers and a strong, wide light', () => {
    const t = createTracer();
    t.blast(TO);
    /** The fireball's vertices (the embers come after them): how far the furthest is from the burst. */
    const wide = () =>
      Math.max(
        ...drawn(t)
          .slice(0, 6 * 24 + 3 * 48)
          .map(x => Math.hypot(x[0] - TO[0], x[1] - TO[1], x[2] - TO[2])),
      );
    // Six puffs of 8 triangles, three discs of 16, and 40 embers of 4.
    expect(drawn(t)).toHaveLength(6 * 24 + 3 * 48 + 40 * 12);
    const [light] = t.lights();
    expect(light.p).toEqual(TO);
    expect(light.range).toBeGreaterThanOrEqual(3 * NADE_R);
    expect(light.color[0]).toBeGreaterThan(light.color[2]);
    // At its widest a quarter of the way, its true size even 40 m off; then it shrinks.
    t.update(BOOM / 4);
    const peak = wide();
    expect(peak).toBeGreaterThan(0.3 * NADE_R);
    expect(peak).toBeLessThan(NADE_R);
    t.update(BOOM / 4);
    expect(wide()).toBeLessThan(peak);
    expect(t.lights()[0].color[0]).toBeLessThan(light.color[0]);
    // Orange and white-hot: red over blue everywhere.
    for (const x of drawn(t)) {
      expect(x[6]).toBeGreaterThanOrEqual(x[9]);
    }
    t.update(BOOM / 2 + 0.001);
    expect(t.lights()).toEqual([]);
    // The embers outlast the fireball, falling, then nothing is left.
    expect(drawn(t).length).toBeGreaterThan(0);
    t.update(1);
    expect(drawn(t)).toEqual([]);
  });
});
