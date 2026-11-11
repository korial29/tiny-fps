import { describe, expect, it } from 'vitest';
import {
  CH,
  CHANNELS,
  EYE,
  GAZE_X,
  GAZE_Y,
  IRIS_R,
  KIND,
  MOUTH_X,
  MOUTH_Y,
  TRAITS,
  ball,
  iris,
  lid,
  lidEdge,
  lipLine,
  lookIn,
  lookOf,
  shift,
  socket,
  toneOf,
  white,
} from './features';

/** A flat face 9 cm in front of the head's middle: the lids' roots are on it. */
const surf = () => -0.088;
const at = (ch: number, p: number[], kind: number = KIND.HEAD, uv: number[] = [0, 0, 0]) =>
  shift(ch, p, kind, uv, [0, 0, -1], surf) ?? [0, 0, 0];

describe('the features of a face', () => {
  it('sits them where anatomy does: the eyes half way up the head, an eye apart, the mouth under them', () => {
    // The head runs from the chin (1.585) to the crown (1.803): the eyes are within a centimetre of its middle.
    expect(Math.abs(EYE[1] - (1.585 + 1.803) / 2)).toBeLessThan(0.01);
    // About an eye's width between the eyes: 28 mm wide, their inner corners 36 mm apart.
    const [inner, outer] = [white(1, Math.PI)[0], white(1, 0)[0]];
    const width = outer - inner;
    expect(width).toBeGreaterThan(0.025);
    expect(width).toBeLessThan(0.031);
    expect((2 * inner) / width).toBeGreaterThan(0.9);
    expect((2 * inner) / width).toBeLessThan(1.5);
    // The iris fills the opening's height and a little under half its width; the pupil is in it.
    expect((2 * IRIS_R) / width).toBeGreaterThan(0.38);
    expect((2 * IRIS_R) / width).toBeLessThan(0.5);
    // The mouth is under the nose (its base at 1.641), over the chin, its corners under the eyes' inner halves.
    expect(MOUTH_Y).toBeLessThan(1.63);
    expect(MOUTH_Y).toBeGreaterThan(1.6);
    expect(MOUTH_X).toBeGreaterThan(inner);
    expect(MOUTH_X).toBeLessThan(EYE[0]);
    // The line between the lips falls a little to the corners: a set mouth, not a smile.
    expect(lipLine(MOUTH_X)).toBeLessThan(lipLine(0));
    expect(lipLine(0) - lipLine(MOUTH_X)).toBeLessThan(0.002);
  });

  it('makes the eye a ball set back at its outer corner, an almond between two lids that meet at its corners', () => {
    // The ball: its middle 5 to 7 mm out of its rim, the outer corner further back than the inner.
    const front = ball(EYE[0], EYE[1]);
    expect(white(1, Math.PI / 2)[2] - front).toBeGreaterThan(0.005);
    expect(white(1, Math.PI / 2)[2] - front).toBeLessThan(0.007);
    expect(white(1, 0)[2]).toBeGreaterThan(white(1, Math.PI)[2] + 0.003);
    // Open: the upper lid's edge over the pupil and under the iris' top, the lower one at its bottom.
    expect(lidEdge(true, 0) - EYE[1]).toBeGreaterThan(0.003);
    expect(lidEdge(true, 0) - EYE[1]).toBeLessThan(IRIS_R);
    expect(EYE[1] - lidEdge(false, 0)).toBeGreaterThan(0.004);
    expect(EYE[1] - lidEdge(false, 0)).toBeLessThan(IRIS_R);
    // The opening is widest in the middle and shuts at both corners, the outer one a little higher.
    for (const t of [-0.9, -0.5, 0, 0.5, 0.9]) {
      expect(lidEdge(true, t)).toBeGreaterThan(lidEdge(false, t));
    }
    expect(lidEdge(true, 1)).toBeCloseTo(lidEdge(false, 1), 9);
    expect(lidEdge(true, -1)).toBeCloseTo(lidEdge(false, -1), 9);
    expect(lidEdge(true, 1)).toBeGreaterThan(lidEdge(true, -1));
    // The socket's floor is set back inside the lids' roots, not outside them.
    expect(socket(EYE[0], EYE[1])).toBe(1);
    expect(socket(EYE[0], EYE[1] + 0.014)).toBe(0);
    expect(socket(EYE[0] + 0.016, EYE[1])).toBe(0);
  });

  it('shuts a lid along the ball: its edge on the other lid, every point of it in front of the ball on the way', () => {
    for (const t of [-0.8, -0.4, 0, 0.4, 0.8]) {
      // Shut, the upper lid's edge is the lower lid's.
      expect(lid(true, t, 1, 1, surf)[1]).toBeCloseTo(lidEdge(false, t), 9);
      for (const c of [0, 0.25, 0.5, 0.75, 1]) {
        for (const upper of [true, false]) {
          for (const s of [0.4, 0.75, 1]) {
            const [x, y, z] = lid(upper, t, s, c, surf);
            expect(z).toBeLessThan(ball(x, y) - 0.001);
          }
          // Its root stays where it is, under the skin.
          expect(lid(upper, t, 0, c, surf)).toEqual(lid(upper, t, 0, 0, surf));
          expect(lid(upper, t, 0, c, surf)[2]).toBeGreaterThan(surf());
        }
      }
    }
    // The channel is that move, for a vertex of the upper lid only.
    const uv = [0, 1];
    const p = lid(true, 0, 1, 0, surf);
    const d = at(CH.BLINK, p, KIND.LID_U, uv);
    expect(p[1] + d[1]).toBeLessThan(lidEdge(false, 0) + 1e-9);
    expect(at(CH.BLINK, lid(false, 0, 1, 0, surf), KIND.LID_L, uv)).toEqual([0, 0, 0]);
    expect(at(CH.BLINK, [EYE[0], EYE[1] + 0.02, -0.09])).toEqual([0, 0, 0]);
    // Half way, BLINK_MID puts the edge back on the ball: forward of the chord.
    expect(at(CH.BLINK_MID, p, KIND.LID_U, uv)[2]).toBeLessThan(-0.0005);
  });

  it('turns the gaze within limits: the iris slides 4.6 mm to a side and 3 mm up or down, on the ball, inside the white', () => {
    expect(GAZE_X).toBeGreaterThan(0.004);
    expect(GAZE_Y).toBeGreaterThan(0.0025);
    for (const [gx, gy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [0.7, 0.7],
      [-0.7, -0.7],
    ]) {
      for (let a = 0; a < 6.28; a += 0.4) {
        const [x, y, z] = iris(1, a, gx, gy);
        expect(((x - EYE[0]) / 0.0138) ** 2 + ((y - EYE[1]) / 0.009) ** 2).toBeLessThan(1);
        expect(ball(x, y) - z).toBeCloseTo(0.00035, 9);
      }
    }
    // The channels: a side, up, and back with the ball's curve; for both eyes the same side.
    const mid = iris(0, 0);
    const left = [-mid[0], mid[1], mid[2]];
    for (const p of [mid, left]) {
      expect(at(CH.LOOK_X, p, KIND.IRIS)[0]).toBeCloseTo(GAZE_X, 9);
      expect(at(CH.LOOK_Y, p, KIND.IRIS)[1]).toBeCloseTo(GAZE_Y, 9);
    }
    // Looking to his right, the right eye's iris goes to its outer corner, further back; the left one's forward.
    expect(at(CH.LOOK_X, mid, KIND.IRIS)[2]).toBeGreaterThan(0);
    expect(at(CH.LOOK_X, left, KIND.IRIS)[2]).toBeLessThan(0);
    // The three together put the iris' middle on the ball wherever it looks.
    for (const [gx, gy] of [
      [1, 0],
      [-1, 0],
      [0.5, -1],
      [-1, 1],
    ]) {
      const d = [CH.LOOK_X, CH.LOOK_Y, CH.LOOK_IN].map(ch => at(ch, mid, KIND.IRIS));
      const k = [gx, gy, lookIn(gx, gy)];
      const [x, y, z] = [0, 1, 2].map(e => mid[e] + d.reduce((m, v, i) => m + v[e] * k[i], 0));
      expect(ball(x, y) - z).toBeCloseTo(0.00035, 5);
    }
    expect(lookIn(0, 0)).toBe(0);
    expect(lookIn(1, 0)).toBeGreaterThan(0.2);
    // The eye's ball and the skin do not move with the gaze.
    expect(at(CH.LOOK_X, mid, KIND.WHITE)).toEqual([0, 0, 0]);
    expect(at(CH.LOOK_X, mid, KIND.HEAD)).toEqual([0, 0, 0]);
  });

  it('moves each feature with its own channels, and no other: the brows, the mouth, the cheeks, the jaw', () => {
    const [brow, inner, corner, lip, chin, cheek, crown] = [
      [0.03, 1.714, -0.095],
      [0.012, 1.712, -0.095],
      [MOUTH_X, lipLine(MOUTH_X), -0.085],
      [0, MOUTH_Y + 0.005, -0.1],
      [0, 1.59, -0.09],
      [0.043, 1.647, -0.085],
      [0, 1.8, 0],
    ];
    const far = (ch: number, ...pts: number[][]) => pts.every(p => Math.hypot(...at(ch, p)) < 2e-4);
    // The brows: up, 4 to 5 mm; a frown takes their inner ends down and in; pain takes them up.
    expect(at(CH.BROW_UP, brow)[1]).toBeGreaterThan(0.004);
    expect(at(CH.BROW_UP, brow)[1]).toBeLessThan(0.0055);
    expect(at(CH.BROW_DOWN, inner)[1]).toBeLessThan(-0.004);
    expect(at(CH.BROW_DOWN, inner)[0]).toBeLessThan(-0.001);
    expect(at(CH.BROW_DOWN, [-inner[0], inner[1], inner[2]])[0]).toBeGreaterThan(0.001);
    expect(at(CH.BROW_PAIN, inner)[1]).toBeGreaterThan(0.003);
    expect(at(CH.BROW_PAIN, [0.046, 1.714, -0.09])[1]).toBeLessThan(0);
    for (const ch of [CH.BROW_UP, CH.BROW_DOWN, CH.BROW_PAIN]) {
      expect(far(ch, corner, chin, cheek, crown)).toBe(true);
    }
    // The mouth: a smile takes the corners up and out and the cheeks up, a frown takes them down,
    // bared teeth part the lips, a pucker draws the corners in.
    expect(at(CH.SMILE, corner)[1]).toBeGreaterThan(0.004);
    expect(at(CH.SMILE, corner)[0]).toBeGreaterThan(0.003);
    expect(at(CH.SMILE, [-corner[0], corner[1], corner[2]])[0]).toBeLessThan(-0.003);
    expect(at(CH.SMILE, cheek)[1]).toBeGreaterThan(0.002);
    expect(at(CH.FROWN, corner)[1]).toBeLessThan(-0.003);
    expect(at(CH.GRIT, lip)[1]).toBeGreaterThan(0.002);
    expect(at(CH.GRIT, [0, MOUTH_Y - 0.005, -0.1])[1]).toBeLessThan(-0.002);
    expect(at(CH.GRIT, [0, MOUTH_Y, -0.1])[1]).toBe(0);
    expect(at(CH.PUCKER, corner)[0]).toBeLessThan(-0.003);
    for (const ch of [CH.SMILE, CH.FROWN, CH.GRIT, CH.PUCKER]) {
      expect(far(ch, brow, inner, crown)).toBe(true);
    }
    // The jaw turns what hangs on it (a vertex's first uv) down about its hinge under the ears.
    expect(at(CH.JAW, chin, KIND.HEAD, [0.22, 0, 0])[1]).toBeLessThan(-0.015);
    expect(at(CH.JAW, chin, KIND.HEAD, [0, 0, 0])).toEqual([0, 0, 0]);
    // The eyes' balls and irises go with no expression of the skin.
    for (let ch: number = CH.BROW_UP; ch < TRAITS; ch++) {
      if (ch != CH.LOOK_IN) {
        expect(at(ch, brow, KIND.WHITE)).toEqual([0, 0, 0]);
        expect(at(ch, brow, KIND.IRIS)).toEqual([0, 0, 0]);
      }
    }
    // Nothing moves the body, nor the back of the head but the hair's length.
    for (let ch = 0; ch < CHANNELS; ch++) {
      expect(shift(ch, [0.1, 1.2, 0], KIND.BODY, undefined, [0, 0, 1], surf)).toBeUndefined();
    }
    expect(at(CH.HAIR, crown, KIND.HEAD, [0, 1, 1])[1]).toBeCloseTo(0, 9);
    expect(Math.hypot(...at(CH.HAIR, [0, 1.76, -0.09], KIND.HEAD, [0, 1, 1]))).toBeGreaterThan(
      0.005,
    );
    expect(at(CH.HAIR, [0, 1.76, -0.09], KIND.HEAD, [0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('gives each player a face of his own, the same every time: a draw per trait, most near the middle', () => {
    const ids = Array.from({ length: 300 }, (_, i) => i);
    const looks = ids.map(lookOf);
    expect(lookOf(42)).toEqual(lookOf(42));
    expect(new Set(looks.map(w => w.join())).size).toBe(300);
    for (let ch = 0; ch < CHANNELS; ch++) {
      const v = looks.map(w => w[ch]);
      if (ch < TRAITS) {
        // No expression is part of a face at rest.
        expect(v.every(x => x == 0)).toBe(true);
        continue;
      }
      expect(Math.max(...v)).toBeLessThanOrEqual(1.25);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(ch == CH.HAIR ? 0 : -1.25);
      // Spread: not everyone the same, both ways from the middle.
      expect(Math.max(...v) - Math.min(...v)).toBeGreaterThan(ch == CH.HAIR ? 0.8 : 1.5);
      if (ch != CH.HAIR && ch != CH.ASYM) {
        // More faces near the middle than far from it.
        expect(v.filter(x => Math.abs(x) < 0.5).length).toBeGreaterThan(150);
      }
    }
    // A face always leans one way or the other: never quite the same on both sides.
    expect(looks.every(w => Math.abs(w[CH.ASYM]) >= 0.4)).toBe(true);
    expect(looks.some(w => w[CH.ASYM] > 0) && looks.some(w => w[CH.ASYM] < 0)).toBe(true);
    // The traits bend the head by millimetres: a wider head by 3 to 4 at the cheekbones.
    expect(at(CH.WIDTH, [0.08, 1.68, 0])[0]).toBeGreaterThan(0.003);
    expect(at(CH.WIDTH, [0.08, 1.68, 0])[0]).toBeLessThan(0.004);
    expect(at(CH.WIDTH, [0.068, 1.56, 0])[0]).toBe(0);
    expect(at(CH.CHIN, [0, 1.59, -0.09])[1]).toBeLessThan(-0.004);
    expect(at(CH.CHIN, [0, 1.7, -0.09])[1]).toBe(0);
    // Not the same on both sides: one brow higher.
    expect(at(CH.ASYM, [0.03, 1.714, -0.095])[1]).toBeGreaterThan(
      at(CH.ASYM, [-0.03, 1.714, -0.095])[1] + 0.001,
    );
    expect(toneOf(3)).toBe(toneOf(3));
  });
});
