import { describe, expect, it } from 'vitest';
import { STYLE, STYLES, cardsOf, closeOf } from './hair';
import { CARD_BASE, CARD_STEP, GILT, GLOSS, HAIR_ROOT, HAIR_SPAN, SHINE } from './mesh';
import { swayOf } from './store';

/** A layer the shader would read as something other than hair: the body, a shine, a glow. */
const other = (l: number) =>
  l > -1.1 ||
  Math.abs(l - SHINE) < 0.1 ||
  Math.abs(l - GLOSS) < 0.02 ||
  Math.abs(l - GILT) < 0.02 ||
  l <= -1.5;

describe('close hair (hair.ts): strand cards over a dark underlayer', () => {
  it('puts every card in the card band and the underlayer in the hair band, clear of the other layers', () => {
    for (let s = 0; s < STYLES; s++) {
      const c = closeOf(s);
      for (let i = 0; i < c.length; i += 10) {
        const l = c[i + 8];
        expect(other(l)).toBe(false);
        if (c[i + 9] < 0) {
          // The underlayer: below -1, by how far down to its hem.
          expect(c[i + 9]).toBeLessThanOrEqual(-1);
          expect(c[i + 9]).toBeGreaterThanOrEqual(-2);
          expect(l).toBeLessThanOrEqual(HAIR_ROOT + 1e-6);
          expect(l).toBeGreaterThanOrEqual(HAIR_ROOT - HAIR_SPAN - 1e-6);
        } else {
          expect(c[i + 9]).toBeLessThanOrEqual(1);
          const card = (CARD_BASE - l) / CARD_STEP;
          expect(card).toBeGreaterThan(0);
          expect(card).toBeLessThan(280);
          // Across a card stays inside it: never on the next card's id.
          expect(card - Math.floor(card)).toBeGreaterThan(0.01);
          expect(card - Math.floor(card)).toBeLessThan(0.99);
        }
      }
    }
  });

  it('keeps the base still and lets only a share of the strands move', () => {
    const c = cardsOf(STYLE.BOB);
    const free = new Map<number, number>();
    for (let i = 0; i < c.length; i += 10) {
      const id = Math.floor((CARD_BASE - c[i + 8]) / CARD_STEP);
      free.set(id, Math.max(free.get(id) ?? 0, c[i + 7]));
    }
    // The base's ids (below 100) are shared with the locks' core, which swing whole: the bob has none.
    const base = [...free].filter(([id]) => id < 100).map(([, f]) => f);
    expect(Math.max(...base)).toBe(0);
    const clumps = [...free].filter(([id]) => id >= 100 && id < 200).map(([, f]) => f);
    const moving = clumps.filter(f => f > 0.5).length / clumps.length;
    expect(moving).toBeGreaterThan(0.1);
    expect(moving).toBeLessThan(0.9);
    const fly = [...free].filter(([id]) => id >= 200).map(([, f]) => f);
    expect(Math.min(...fly)).toBeGreaterThan(0.3);
  });

  it('sways a strand by its own phase and only swings the underlayer', () => {
    // [x, y, z, normal, light, free, layer, how far along]: a card's phase is its id's.
    const strand = [0, 0, 0, 0, 0, 1, 1, 1, -1.37, 0.7];
    const under = [0, 0, 0, 0, 0, 1, 1, 1, -1.46, -1.5];
    const still = [0, 0, 0, 0, 0, 1, 1, 0, -1.37, 0.7];
    expect(Math.hypot(...swayOf(strand, 0, 1.3, [0, 0, 0]))).toBeGreaterThan(0.002);
    expect(Math.hypot(...swayOf(under, 0, 1.3, [0, 0, 0]))).toBe(0);
    expect(swayOf(under, 0, 1.3, [0.01, 0, 0])[0]).toBeCloseTo(0.006, 9);
    expect(Math.hypot(...swayOf(still, 0, 1.3, [0.02, 0.01, 0]))).toBe(0);
  });
});
