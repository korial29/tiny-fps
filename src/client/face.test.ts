import { describe, expect, it } from 'vitest';
import { DEAD, EXPR, FH, FRAMES, FW, GLOW, MORE, PALETTE, frame, mood, sprite } from './face';
import type { Feel } from './face';

const calm: Feel = { hp: 5, max: 5, down: false, flag: false, lost: 0, got: false, firing: 0 };

describe('the face in the HUD', () => {
  it('has DOOM’s 42 frames and 15 more for effort, focus and a shout, each its own picture in the palette', () => {
    expect(MORE).toBe(42);
    expect(FRAMES).toBe(42 + 5 * 3);
    const seen = new Set<string>();
    for (let n = 0; n < FRAMES; n++) {
      const p = sprite(n);
      expect(p).toHaveLength(FW * FH);
      expect(Math.max(...p)).toBeLessThan(PALETTE.length);
      seen.add(p.join());
    }
    expect(seen.size).toBe(FRAMES);
    // Built once.
    expect(sprite(7)).toBe(sprite(7));
  });

  it('is a face: an opaque head with a clear margin round it, two eyes and a mouth', () => {
    const p = sprite(0);
    expect(p[0]).toBe(0);
    expect(p[FW * FH - 1]).toBe(0);
    expect(p.filter(c => c).length).toBeGreaterThan(FW * FH * 0.5);
    // The whites of the eyes (6) on both sides of the middle.
    const whites = [...p.keys()].filter(i => p[i] == 6).map(i => i % FW);
    expect(whites.some(x => x < 11)).toBe(true);
    expect(whites.some(x => x > 12)).toBe(true);
  });

  it('gets worse as the health goes: more blood at each of the 5 levels', () => {
    const blood = (n: number) => sprite(n).filter(c => c == 10).length;
    for (let level = 1; level < 5; level++) {
      expect(blood(level * 8)).toBeGreaterThanOrEqual(blood((level - 1) * 8));
    }
    expect(blood(32)).toBeGreaterThan(blood(0));
  });

  const run = (feels: Partial<Feel>[], dt = 1 / 60) => {
    const m = mood(() => 0.5);
    return feels.map(f => m(dt, { ...calm, ...f }));
  };

  it('looks about, left, ahead and right, while nothing happens, at the level of the health', () => {
    const m = mood(
      (() => {
        let k = 0;
        return () => [0.1, 0.5, 0.9][k++ % 3];
      })(),
    );
    const seen = new Set(Array.from({ length: 400 }, () => m(1 / 60, calm)));
    expect([...seen].sort()).toEqual([EXPR.AHEAD, EXPR.LEFT, EXPR.RIGHT].sort());
    expect(run([{ hp: 1 }])[0]).toBeGreaterThanOrEqual(32);
    expect(run([{ hp: 3 }])[0]).toBeGreaterThanOrEqual(16);
  });

  it('turns toward a hit from the side, grimaces at one from ahead or from nowhere, and holds it a second', () => {
    expect(run([{ hp: 4, lost: 1, from: -1.2 }])[0]).toBe(8 + EXPR.TURN_L);
    expect(run([{ hp: 4, lost: 1, from: 1.2 }])[0]).toBe(8 + EXPR.TURN_R);
    expect(run([{ hp: 4, lost: 1, from: 0.1 }])[0]).toBe(8 + EXPR.RAGE);
    expect(run([{ hp: 4, lost: 1 }])[0]).toBe(8 + EXPR.RAGE);
    const held = run([{ hp: 4, lost: 1, from: 1.2 }, ...Array(50).fill({ hp: 4 })]);
    expect(held.at(-1)).toBe(8 + EXPR.TURN_R);
    const gone = run([{ hp: 4, lost: 1, from: 1.2 }, ...Array(70).fill({ hp: 4 })]);
    expect(gone.at(-1)).not.toBe(8 + EXPR.TURN_R);
  });

  it('says ouch at a heavy hit, grins at a new weapon, rages with the trigger held 2 s', () => {
    expect(run([{ hp: 3, lost: 2, from: 1.2 }])[0]).toBe(16 + EXPR.OUCH);
    expect(run([{ got: true }])[0]).toBe(EXPR.GRIN);
    expect(run([{ firing: 1 }])[0]).not.toBe(EXPR.RAGE);
    expect(run([{ firing: 2.5 }])[0]).toBe(EXPR.RAGE);
  });

  it('glows carrying the enemy flag, and is the dead face down', () => {
    expect(run([{ flag: true }])[0]).toBe(GLOW);
    expect(run([{ down: true, hp: 0 }])[0]).toBe(DEAD);
    // A hit still shows over the glow.
    expect(run([{ flag: true, hp: 4, lost: 1, from: -1.2 }])[0]).toBe(8 + EXPR.TURN_L);
  });

  it('wears the runners’ expressions too: a strain in a sprint, a set face aiming, a shout in a cut or a dash, a grin at a capture', () => {
    // Their frames: after DOOM's 42, three per level of wounds.
    expect(frame(0, EXPR.GRIN)).toBe(EXPR.GRIN);
    expect(frame(2, EXPR.RAGE)).toBe(16 + EXPR.RAGE);
    expect(frame(0, EXPR.EFFORT)).toBe(MORE);
    expect(frame(4, EXPR.SHOUT)).toBe(FRAMES - 1);
    expect(run([{ effort: true }])[0]).toBe(frame(0, EXPR.EFFORT));
    expect(run([{ focus: true, hp: 3 }])[0]).toBe(frame(2, EXPR.FOCUS));
    expect(run([{ shout: true, hp: 1 }])[0]).toBe(frame(4, EXPR.SHOUT));
    // A grin holds a second and a half, as a new weapon's does.
    const grin = run([{ grin: true }, ...Array<Partial<Feel>>(60).fill({})]);
    expect(grin[0]).toBe(EXPR.GRIN);
    expect(grin.at(-1)).toBe(EXPR.GRIN);
    expect(run([{ grin: true }, ...Array<Partial<Feel>>(120).fill({})]).at(-1)).not.toBe(EXPR.GRIN);
    // What matters most shows: a hit over all, a shout over aiming, aiming over the flag's glow and the effort.
    expect(run([{ shout: true, hp: 4, lost: 1, from: 1.2 }])[0]).toBe(8 + EXPR.TURN_R);
    expect(run([{ shout: true, focus: true, effort: true }])[0]).toBe(frame(0, EXPR.SHOUT));
    expect(run([{ focus: true, flag: true, effort: true }])[0]).toBe(frame(0, EXPR.FOCUS));
    expect(run([{ flag: true, effort: true }])[0]).toBe(GLOW);
    // The trigger held: set at first, a rage after 2 s.
    expect(run([{ focus: true, firing: 1 }])[0]).toBe(frame(0, EXPR.FOCUS));
    expect(run([{ focus: true, firing: 2.5 }])[0]).toBe(EXPR.RAGE);
    expect(run([{ down: true, shout: true, grin: true }])[0]).toBe(DEAD);
    // The pictures: the eyes narrowed in all three; the mouth wide open with teeth in a shout,
    // open a little in an effort, a short line when set.
    const count = (n: number, c: number, y0: number, y1: number) =>
      [...sprite(n)].filter((v, i) => v == c && i / FW >= y0 && i / FW < y1).length;
    const [WHITE, MOUTH, TEETH] = [6, 8, 9];
    for (const e of [EXPR.EFFORT, EXPR.FOCUS, EXPR.SHOUT]) {
      expect(count(frame(0, e), WHITE, 11, 16)).toBeLessThan(count(EXPR.AHEAD, WHITE, 11, 16));
      // And the wounds of its level, as every other frame.
      expect(count(frame(4, e), 10, 0, FH)).toBeGreaterThan(count(frame(0, e), 10, 0, FH));
    }
    expect(count(frame(0, EXPR.SHOUT), MOUTH, 18, 26)).toBeGreaterThan(
      count(frame(0, EXPR.EFFORT), MOUTH, 18, 26),
    );
    expect(count(frame(0, EXPR.SHOUT), TEETH, 18, 26)).toBeGreaterThan(0);
    expect(count(frame(0, EXPR.EFFORT), MOUTH, 18, 26)).toBeGreaterThan(0);
    expect(count(frame(0, EXPR.FOCUS), MOUTH, 18, 26)).toBe(0);
  });
});
