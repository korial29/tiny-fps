import { describe, expect, it } from 'vitest';
import { DASH_COOLDOWN, RUN_SPEED, SPRINT_SPEED } from '../shared/constants';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import {
  BLINK,
  CALM,
  POSE,
  REACH_X,
  REACH_Y,
  blink,
  createFace,
  dashing,
  expression,
  felled,
  strain,
} from './expression';
import type { Mood } from './expression';
import { CH, CHANNELS, TRAITS, lookIn, lookOf } from './features';

const DT = 1 / 60;
/** The face of `id` after `seconds` of `mood`, and each frame's weights on the way. */
const live = (id: number, mood: Partial<Mood>, seconds: number, face = createFace(id)) => {
  const frames: Float32Array[] = [];
  for (let t = 0; t < seconds; t += DT) {
    face.update(DT, { ...CALM, ...mood });
    frames.push(face.w.slice());
  }
  return { face, frames };
};
const player = (o: Partial<PlayerState>): PlayerState =>
  ({
    id: 1,
    vx: 0,
    vz: 0,
    mode: MODE.GROUND,
    down: 0,
    stun: 0,
    dash: 0,
    hits: 0,
    ...o,
  }) as PlayerState;

describe('a face that lives', () => {
  it('blinks: the lids shut in a twentieth of a second, stay shut a moment and reopen more slowly', () => {
    expect(blink(-0.01)).toBe(0);
    expect(blink(0)).toBe(0);
    expect(blink(0.03)).toBeCloseTo(0.5, 5);
    expect(blink(0.07)).toBe(1);
    expect(blink(0.15)).toBeGreaterThan(0);
    expect(blink(0.15)).toBeLessThan(1);
    expect(blink(BLINK + 0.001)).toBe(0);
    expect(BLINK).toBeLessThan(0.3);
    // Shutting is faster than opening.
    const [shut, open] = [0.06, BLINK - 0.09];
    expect(open).toBeGreaterThan(shut * 1.5);
  });

  it('blinks at irregular intervals, a few seconds apart, each one shutting the lids and opening them again', () => {
    const { frames } = live(7, {}, 60);
    const shut = frames.map(w => w[CH.BLINK]);
    // The starts of the blinks: the lids pass half shut on their way down.
    const starts = shut.flatMap((v, i) => (i && v >= 0.5 && shut[i - 1] < 0.5 ? [i * DT] : []));
    expect(starts.length).toBeGreaterThanOrEqual(8);
    expect(starts.length).toBeLessThanOrEqual(40);
    // Each one shuts all the way and is open again within a third of a second.
    for (const t of starts) {
      const i = Math.round(t / DT);
      expect(Math.max(...shut.slice(i, i + 8))).toBeGreaterThan(0.95);
      expect(Math.min(...shut.slice(i, i + 22))).toBeLessThan(0.35);
    }
    // Open most of the time.
    expect(shut.filter(v => v < 0.35).length).toBeGreaterThan(shut.length * 0.85);
    // Irregular: the gaps between two blinks are not one gap, and run from a fraction of a second to several.
    const gaps = starts.slice(1).map((t, i) => t - starts[i]);
    expect(Math.max(...gaps)).toBeGreaterThan(3);
    expect(Math.max(...gaps)).toBeLessThan(6.5);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(1.5);
    // Half shut, the lid is kept on the ball (BLINK_MID), not at rest or shut.
    for (const w of frames) {
      expect(w[CH.BLINK_MID]).toBeCloseTo(4 * w[CH.BLINK] * (1 - w[CH.BLINK]), 5);
    }
  });

  it('is the same face on every screen, and not the face of another player', () => {
    const [a, b, other] = [live(5, {}, 20), live(5, {}, 20), live(6, {}, 20)];
    expect(a.frames).toEqual(b.frames);
    const blinks = (f: Float32Array[]) => f.map(w => +(w[CH.BLINK] > 0.5)).join('');
    expect(blinks(a.frames)).not.toBe(blinks(other.frames));
    // His own traits, untouched by what he does.
    const look = lookOf(5);
    for (const w of [
      a.frames[0],
      a.frames.at(-1)!,
      live(5, { shout: 1, hurt: 1 }, 1).frames.at(-1)!,
    ]) {
      expect([...w.slice(TRAITS)]).toEqual([...look.slice(TRAITS)]);
    }
  });

  it('keeps the eyes on the aim as far as they turn, the same side for both, and no further', () => {
    // Aiming (focus) the eyes hold still on the target: no glances to speak of.
    const on = (gx: number, gy: number) => live(3, { gx, gy, focus: 1 }, 2).face.w;
    const right = on(0.3, 0);
    expect(right[CH.LOOK_X]).toBeGreaterThan(0.3 / REACH_X - 0.1);
    expect(right[CH.LOOK_X]).toBeLessThan(0.3 / REACH_X + 0.1);
    expect(on(-0.3, 0)[CH.LOOK_X]).toBeLessThan(-0.3 / REACH_X + 0.1);
    expect(on(0, 0.2)[CH.LOOK_Y]).toBeGreaterThan(0.2 / REACH_Y - 0.1);
    expect(on(0, -0.2)[CH.LOOK_Y]).toBeLessThan(-0.2 / REACH_Y + 0.1);
    // Past what the eyes can turn they stop at the end of their travel.
    for (const [gx, gy] of [
      [2, 0],
      [-3, 1.5],
      [0.7, -2],
    ]) {
      const { frames } = live(3, { gx, gy }, 3);
      for (const w of frames) {
        expect(Math.hypot(w[CH.LOOK_X], w[CH.LOOK_Y])).toBeLessThanOrEqual(1 + 1e-6);
      }
      // At the end of the travel, less a glance.
      const end = frames.at(-1)!;
      expect(Math.hypot(end[CH.LOOK_X], end[CH.LOOK_Y])).toBeGreaterThan(0.6);
      expect(Math.sign(end[CH.LOOK_X])).toBe(Math.sign(gx));
    }
    // The irises go back with the ball's curve, and the upper lids go with the gaze: down with it, up with it.
    const down = on(0, -0.4);
    expect(down[CH.LOOK_IN]).toBeCloseTo(lookIn(down[CH.LOOK_X], down[CH.LOOK_Y]), 5);
    expect(down[CH.BLINK]).toBeGreaterThan(0.2);
    expect(down[CH.BLINK]).toBeLessThan(0.45);
    expect(on(0, 0.4)[CH.WIDE]).toBeGreaterThan(0.2);
    // They get there fast, as eyes do: most of the way in a tenth of a second.
    expect(live(3, { gx: 0.3, focus: 1 }, 0.1).face.w[CH.LOOK_X]).toBeGreaterThan(0.25);
  });

  it('glances about when nothing holds the eyes: small jumps aside every second or so, back to the middle between', () => {
    const { frames } = live(9, {}, 40);
    const x = frames.map(w => w[CH.LOOK_X]);
    expect(Math.max(...x)).toBeGreaterThan(0.1);
    expect(Math.min(...x)).toBeLessThan(-0.1);
    // Small: a third of the travel at most.
    expect(Math.max(...x.map(Math.abs))).toBeLessThan(0.4);
    // Jumps, then rests: the eyes are still most of the time.
    const moving = x.filter((v, i) => i && Math.abs(v - x[i - 1]) > 0.004).length;
    expect(moving).toBeGreaterThan(20);
    expect(moving).toBeLessThan(x.length * 0.3);
    // Several different rests, the middle among them.
    const rests = new Set(x.map(v => Math.round(v * 20)));
    expect(rests.size).toBeGreaterThan(6);
    expect(x.filter(v => Math.abs(v) < 0.02).length).toBeGreaterThan(x.length * 0.1);
    // Aiming, they hold; down, they are in the middle.
    const held = live(9, { focus: 1 }, 20)
      .frames.slice(120)
      .map(w => w[CH.LOOK_X]);
    expect(Math.max(...held.map(Math.abs))).toBeLessThan(0.08);
    const out = live(9, { down: true, gx: 0.4 }, 2).face.w;
    expect(out[CH.LOOK_X]).toBeCloseTo(0, 3);
  });

  it('wears what the player does, each on its features, and comes back to rest', () => {
    const rest = expression(POSE.NEUTRAL);
    const cases: [Partial<Mood>, number[][]][] = [
      [{ effort: 1 }, POSE.EFFORT],
      [{ focus: 1 }, POSE.FOCUS],
      [{ grin: 1 }, POSE.GRIN],
      [{ shout: 1 }, POSE.SHOUT],
      [{ hurt: 1 }, POSE.WINCE],
      [{ down: true }, POSE.DOWN],
    ];
    for (const [mood, pose] of cases) {
      const { face, frames } = live(2, mood, 1.5);
      // The pose's own channels are in, within a tenth (the breath of an effort, the lids' share of a gaze).
      for (const [ch, v] of pose) {
        if (ch != CH.BLINK) {
          expect(Math.abs(frames.at(-1)![ch] - v)).toBeLessThan(ch == CH.JAW ? 0.15 : 0.1);
        }
      }
      // The eyes are shut when the pose shuts them, whatever the blinks.
      const shut = pose.find(([ch]) => ch == CH.BLINK)?.[1] ?? 0;
      expect(Math.min(...frames.slice(30).map(w => w[CH.BLINK]))).toBeGreaterThan(shut - 0.05);
      // Gone, the face is at rest again in a few seconds: every channel of expression but the eyes'.
      const back = live(2, {}, 4, face).face.w;
      for (let ch: number = CH.BROW_UP; ch < TRAITS; ch++) {
        if (ch != CH.LOOK_IN) {
          expect(Math.abs(back[ch] - rest[ch])).toBeLessThan(0.03);
        }
      }
    }
    // The expressions are not one another: a shout opens the jaw, a wince does not; a grin lifts
    // the corners, a wince drops them; focus keeps the mouth shut.
    expect(expression(POSE.SHOUT)[CH.JAW]).toBeGreaterThan(expression(POSE.WINCE)[CH.JAW] + 0.5);
    expect(expression(POSE.GRIN)[CH.SMILE]).toBe(1);
    expect(expression(POSE.WINCE)[CH.FROWN]).toBeGreaterThan(0);
    expect(expression(POSE.FOCUS)[CH.JAW]).toBe(0);
    expect(expression(POSE.DOWN)[CH.BLINK]).toBe(1);
    expect(expression(POSE.DOWN)[CH.BLINK_MID]).toBe(0);
    expect(expression(POSE.GRIN, 4)[CH.WIDTH]).toBe(lookOf(4)[CH.WIDTH]);
    expect(expression(POSE.GRIN)).toHaveLength(CHANNELS);
  });

  it('blends: no feature jumps in a frame, a wince is there at once, a later expression is laid over an earlier one', () => {
    // From rest to a shout: the jaw is on its way after a frame, not there; there in a fifth of a second.
    const face = live(2, {}, 1).face;
    const before = face.w.slice();
    const { frames } = live(2, { shout: 1 }, 0.3, face);
    expect(frames[0][CH.JAW] - before[CH.JAW]).toBeGreaterThan(0.01);
    expect(frames[0][CH.JAW]).toBeLessThan(0.4);
    expect(frames.at(-1)![CH.JAW]).toBeGreaterThan(0.9);
    for (let i = 1; i < frames.length; i++) {
      for (let ch: number = CH.BROW_UP; ch < TRAITS; ch++) {
        expect(Math.abs(frames[i][ch] - frames[i - 1][ch])).toBeLessThan(0.35);
      }
    }
    // A hit shows within a tenth of a second and is gone in a second.
    const hit = live(2, { hurt: 1 }, 0.1).face;
    expect(hit.w[CH.GRIT]).toBeGreaterThan(0.6);
    expect(live(2, {}, 1.2, hit).face.w[CH.GRIT]).toBeLessThan(0.05);
    // Sprinting and hit: the wince is over the effort; down beats everything.
    const both = live(2, { effort: 1, hurt: 1 }, 1).face.w;
    expect(both[CH.FROWN]).toBeGreaterThan(0.4);
    const all = live(2, { effort: 1, shout: 1, grin: 1, down: true }, 1.5).face.w;
    expect(all[CH.BLINK]).toBeGreaterThan(0.95);
    expect(all[CH.SMILE]).toBeLessThan(0.1);
    expect(all[CH.JAW]).toBeLessThan(0.45);
    // Out of breath, the mouth opens and shuts with it.
    const jaw = live(2, { effort: 1 }, 4)
      .frames.slice(120)
      .map(w => w[CH.JAW]);
    expect(Math.max(...jaw) - Math.min(...jaw)).toBeGreaterThan(0.06);
    // A long frame (a tab coming back) does not overshoot.
    const late = createFace(2);
    late.update(5, { ...CALM, shout: 1 });
    expect([...late.w.slice(0, TRAITS)].every(v => v >= -1 && v <= 1.2)).toBe(true);
  });

  it('reads the effort off the player: a sprint, a climb, a hang, a wall-run, a stumble; not a run, not a fall', () => {
    expect(strain(player({}))).toBe(0);
    expect(strain(player({ vz: -RUN_SPEED }))).toBe(0);
    expect(strain(player({ vz: -SPRINT_SPEED }))).toBe(1);
    expect(strain(player({ vx: SPRINT_SPEED - 1 }))).toBeGreaterThan(0.5);
    for (const mode of [MODE.CLIMB, MODE.HANG, MODE.WALLRUN]) {
      expect(strain(player({ mode }))).toBe(1);
    }
    expect(strain(player({ mode: MODE.AIR, vz: -SPRINT_SPEED }))).toBe(0);
    expect(strain(player({ stun: 10 }))).toBeGreaterThan(0.5);
    expect(strain(player({ down: 30, vz: -SPRINT_SPEED }))).toBe(0);
    expect(dashing(player({ dash: DASH_COOLDOWN }))).toBe(true);
    expect(dashing(player({ dash: 1 }))).toBe(false);
  });

  it('knows a foe put down: the hit counter went on in the frame another player went down', () => {
    const [me, foe] = [player({ id: 1, hits: 3 }), player({ id: 2 })];
    const before = (id: number) => (id == 2 ? foe : undefined);
    const fell = player({ id: 2, down: 60 });
    expect(felled(me, player({ id: 1, hits: 4 }), before, [fell])).toBe(true);
    // A hit that puts nobody down, a fall without a hit, a foe already down, a player just seen.
    expect(felled(me, player({ id: 1, hits: 4 }), before, [foe])).toBe(false);
    expect(felled(me, me, before, [fell])).toBe(false);
    expect(felled(me, player({ id: 1, hits: 4 }), () => fell, [fell])).toBe(false);
    expect(felled(me, player({ id: 1, hits: 4 }), () => undefined, [fell])).toBe(false);
    // Not himself.
    expect(
      felled(me, player({ id: 1, hits: 4, down: 60 }), () => me, [
        player({ id: 1, hits: 4, down: 60 }),
      ]),
    ).toBe(false);
  });
});
