import { describe, expect, it } from 'vitest';
import { GUN_RELOAD, RAIL_RELOAD } from '../../shared/constants';
import {
  battery,
  button,
  held,
  loadFrame,
  power,
  PRESS,
  pressAt,
  buttonAt,
  firsts,
  poke,
  swapOf,
  screwed,
  swapped,
  RELEASE,
  BROUGHT,
  CUES,
  TAP,
} from '../gun';
import { SHINE, STRIDE } from '../mesh';
import type { Vec3 } from '../mesh';
import { IDENT, verts } from './testing';

describe('the battery and the capsule', () => {
  it('gives the Hunter’s pistol a battery of its own bronze, with no violet and no sky in it (the user, 2026-11-26)', () => {
    const [plain, bronze] = [battery(1), battery(1, true)];
    // The same shape, vertex for vertex: only its colours and its layer change.
    expect(bronze).toHaveLength(plain.length);
    let shiny = 0;
    for (let i = 0; i < bronze.length; i += STRIDE) {
      expect(bronze.slice(i, i + 6)).toEqual(plain.slice(i, i + 6));
      // Red leads blue everywhere: the metal's bronze and the band's ember.
      expect(bronze[i + 6]).toBeGreaterThan(bronze[i + 9]);
      // Polished metal reflects the sky, which turned the bronze violet.
      expect(bronze[i + 8]).not.toBe(SHINE);
      shiny += +(plain[i + 8] === SHINE);
    }
    expect(shiny).toBeGreaterThan(0);
  });

  it('sit home with no swap, and at its end', () => {
    for (const rail of [false, true]) {
      expect(swapped(-1, rail)).toEqual([0, 0, 0]);
      expect(swapped(1, rail).map(v => Math.abs(v))).toEqual([0, 0, 0]);
    }
  });

  it('shows the dark hole of the battery’s seat under the grip while the battery is out, and not once it is home', () => {
    const drawn = (swap: number) => {
      const out: number[] = [];
      held(out, [0, 0, 0], IDENT, 1, 1, 15, 0, 0, 0, { swap });
      return verts(out).filter(v => Math.max(...v.c) < 0.02 && v.layer == -1);
    };
    expect(drawn(-1)).toHaveLength(0);
    expect(drawn(0.05)).toHaveLength(0);
    // Out from the first slide until the slap home.
    for (const s of [0.2, 0.45, 0.7]) {
      expect(drawn(s)).toHaveLength(3 * 36);
    }
    expect(drawn(TAP + 0.01)).toHaveLength(0);
  });

  it('slides the battery out and drops it, then brings a new one up into the grip', () => {
    const out = (s: number) => swapped(s, false)[0];
    expect(out(0.1)).toBe(0);
    // Slid 10 cm out by RELEASE, where it drops; the new one from the hand, 5 cm under its seat at
    // BROUGHT, in but for 12 mm by 0.54, held there until the palm slaps it home at TAP, when it
    // clicks (the user, 2026-11-09).
    expect(out(RELEASE - 1e-9)).toBeCloseTo(0.1, 6);
    expect(out(BROUGHT)).toBeCloseTo(0.05, 6);
    expect(out(0.54)).toBeCloseTo(0.012, 6);
    expect(out(0.7)).toBeCloseTo(0.012, 6);
    expect(out(TAP - 0.013)).toBeCloseTo(0.012, 6);
    expect(out(TAP)).toBe(0);
    expect(out(0.9)).toBe(0);
    expect(CUES[0][1]).toBe(TAP);
    for (const k of [0, 3]) {
      expect(swapped(TAP - 0.03, k)).toEqual(swapped(TAP - 0.03, false));
    }
  });

  it('unscrews the capsule, throws it up spinning, and screws a new one on', () => {
    const [up, turn, tumble] = [0, 1, 2].map(i => (s: number) => swapped(s, true)[i]);
    // It unscrews itself and jumps off.
    expect(up(0.28)).toBeCloseTo(0.02, 6);
    expect(Math.abs(turn(0.28))).toBeCloseTo(3 * Math.PI, 6);
    expect(up(0.41)).toBeGreaterThan(0.25);
    expect(tumble(0.41)).toBeGreaterThan(2);
    // The new one comes down, and turns in by strokes: still between them, while the wrist goes back.
    expect(up(0.5)).toBeGreaterThan(up(0.7));
    expect(turn(0.58)).toBeCloseTo(Math.PI, 6);
    expect(turn(0.7)).toBeGreaterThan(0);
    expect(turn(0.66)).toBeCloseTo(turn(0.67), 6);
    expect(turn(0.88)).toBeCloseTo(0, 6);
    expect(tumble(0.7)).toBe(0);
  });

  it('turns the wrist with each stroke of the screw, then back while it lets go', () => {
    const wrist = (s: number) => screwed(s)[1];
    expect(wrist(0.58)).toBeCloseTo(0, 6);
    expect(wrist(0.64)).toBeCloseTo(-Math.PI / 3, 6);
    expect(wrist(0.68)).toBeCloseTo(0, 6);
    expect(wrist(0.88)).toBeCloseTo(0, 6);
    // The capsule turns only while the wrist turns forward.
    expect(screwed(0.64)[0]).toBeCloseTo(screwed(0.66)[0], 6);
  });

  it('puts the battery under the grip and the capsule on top, going out along their axes', () => {
    const ax: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ];
    const [foot, [, , fw]] = loadFrame([0, 0, 0], ax, false);
    expect(foot[1]).toBeLessThan(-0.06);
    expect(fw[1]).toBeGreaterThan(0.8);
    expect(loadFrame([0, 0, 0], ax, false, RELEASE - 0.001)[0][1]).toBeLessThan(foot[1] - 0.08);
    const [base, [, , up]] = loadFrame([0, 0, 0], ax, true);
    expect(base[1]).toBeGreaterThan(0.1);
    expect(up[1]).toBeCloseTo(1, 6);
    expect(loadFrame([0, 0, 0], ax, true, 0.41)[0][1]).toBeGreaterThan(base[1] + 0.25);
  });

  it('counts the swap of the gun in hand from 0 to 1, and -1 without one', () => {
    expect(swapOf({ reload: 0 })).toBe(-1);
    expect(swapOf({ reload: GUN_RELOAD })).toBe(0);
    expect(swapOf({ reload: RAIL_RELOAD / 2, railed: true })).toBeCloseTo(0.5, 9);
  });

  it('lights a weapon up over 0.6 s after it comes to hand: dark first, flickering, then full', () => {
    expect(power(0)).toBe(0);
    expect(power(0.1)).toBe(0);
    expect(power(0.35)).toBeGreaterThan(0.2);
    expect(power(0.35)).toBeLessThan(1);
    expect(power(0.6)).toBe(1);
    expect(power(9)).toBe(1);
  });
});

describe('the button that powers a weapon on (the user, 2026-11-09)', () => {
  it('is pressed only when a weapon comes to hand the first time, again once lost and taken again', () => {
    const fresh = firsts();
    const p = {
      id: 1,
      ammo: 15,
      blade: true,
      rail: -1,
      rifle: -1,
      down: 0,
      wield: false,
      rifled: false,
      railed: false,
    };
    expect(fresh(p)).toBe(true);
    expect(fresh(p)).toBe(false);
    // The katana drawn, then the gun back in hand: only the katana is new.
    expect(fresh({ ...p, wield: true })).toBe(true);
    expect(fresh(p)).toBe(false);
    // Down, every weapon lost; taken again, the gun is new again, and another player's are his own.
    expect(fresh({ ...p, ammo: -1, blade: false, down: 60 })).toBe(false);
    expect(fresh(p)).toBe(true);
    expect(fresh({ ...p, id: 2 })).toBe(true);
  });

  it('is pressed by the left index: the hand where it was, on the button by PRESS, then back', () => {
    expect(poke(0)).toBe(0);
    expect(poke(PRESS - 0.2)).toBe(0);
    expect(poke(PRESS - 0.08)).toBeGreaterThan(0.2);
    expect(poke(PRESS)).toBe(1);
    expect(poke(PRESS + 0.05)).toBe(1);
    expect(poke(PRESS + 0.3)).toBe(0);
    // The rail gun's boot plays faster: its press comes sooner.
    expect(pressAt(2)).toBeLessThan(PRESS);
    expect(pressAt(0)).toBe(PRESS);
    expect(poke(pressAt(2), pressAt(2))).toBe(1);
  });

  it('sits on each weapon’s left, glowing, lit with the weapon, and goes in when pushed', () => {
    for (const kind of [0, 1, 2, 3]) {
      const b = (push: number, light: number) => {
        const out: number[] = [];
        button(out, kind, push, light, [0.25, 0.9, 1]);
        return verts(out);
      };
      const on = b(0, 1);
      expect(on.length).toBeGreaterThan(20);
      expect(on.every(v => v.layer == -2 && v.p[0] < 0)).toBe(true);
      // Dim with the weapon off.
      expect(Math.max(...b(0, 0).map(v => v.c[2]))).toBeLessThan(
        Math.max(...on.map(v => v.c[2])) * 0.2,
      );
      // Pushed, it goes 1.5 mm in toward the weapon's middle.
      const mid = (vs: typeof on) => vs.reduce((s, v) => s + v.p[0], 0) / vs.length;
      expect(mid(b(1, 1))).toBeGreaterThan(mid(on) + 0.0004);
      // In the world it is where the model puts it, facing out of its left.
      const [top, n] = buttonAt(
        kind,
        [1, 2, 3],
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, -1],
        ],
      );
      const near = on.reduce(
        (m, v) =>
          Math.min(m, Math.hypot(v.p[0] + 1 - top[0], v.p[1] + 2 - top[1], v.p[2] + 3 - top[2])),
        1,
      );
      expect(near).toBeLessThan(0.004);
      expect(n[0]).toBeLessThan(0);
      expect(Math.hypot(...n)).toBeCloseTo(1, 6);
    }
  });
});
