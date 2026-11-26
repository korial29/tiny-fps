import { describe, expect, it } from 'vitest';
import { ART, ART_KEYS } from './cast-art';
import { ROLE } from '../shared/kit';

describe('cast-art', () => {
  it('has a 64 x 64 portrait for every class, each pixel transparent or in its palette', () => {
    expect(ART).toHaveLength(Object.keys(ROLE).length);
    for (const [palette, pixels] of ART) {
      expect(pixels).toHaveLength(64 * 64);
      expect(palette).toMatch(/^([0-9a-f]{6})+$/);
      const colours = palette.length / 6;
      for (const ch of new Set(pixels)) {
        if (ch !== ' ') {
          expect(ART_KEYS.indexOf(ch)).toBeGreaterThanOrEqual(0);
          expect(ART_KEYS.indexOf(ch)).toBeLessThan(colours);
        }
      }
      // A portrait fills a good part of its tile.
      expect(pixels.replaceAll(' ', '').length).toBeGreaterThan(64 * 64 * 0.4);
    }
  });
});
