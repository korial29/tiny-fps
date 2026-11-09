import { afterEach, describe, expect, it } from 'vitest';
import { LIFE, clearDrops, drawDrops, drop, drops, fall } from './drops';
import { RELEASE, battery, held } from './gun';
import type { Vec3 } from './mesh';
import { STRIDE } from './mesh';

const AX: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
/** The lowest vertex drawn of the drops. */
const lowest = () => {
  const out: number[] = [];
  drawDrops(out);
  let y = Infinity;
  for (let i = 1; i < out.length; i += STRIDE) {
    y = Math.min(y, out[i]);
  }
  return y;
};

describe('the spent batteries thrown out of a swap (the user, 2026-11-09)', () => {
  afterEach(clearDrops);

  it('fall, bounce on the floor, lie there on their side, and are gone after a few seconds', () => {
    drop(battery(1), [0, 1.2, 0], AX, [0.5, 0, 0], [0, 0, 6], 0);
    let [bounced, minY, prevVy] = [false, Infinity, 0];
    for (let t = 0; t < 2; t += 1 / 60) {
      fall(1 / 60);
      const y = lowest();
      minY = Math.min(minY, y);
      // Never through the floor, by more than a few mm.
      expect(y).toBeGreaterThan(-0.01);
      bounced ||= prevVy < 0 && y > minY + 0.005;
      prevVy = y - minY;
    }
    expect(bounced || minY < 0.01).toBe(true);
    // At rest on the floor, its length level: its highest point a battery's width up, not its length.
    const out: number[] = [];
    drawDrops(out);
    const ys = Array.from({ length: out.length / STRIDE }, (_, i) => out[i * STRIDE + 1]);
    expect(Math.min(...ys)).toBeLessThan(0.01);
    expect(Math.max(...ys)).toBeLessThan(0.05);
    for (let t = 0; t < LIFE; t += 1 / 30) {
      fall(1 / 30);
    }
    expect(drops()).toBe(0);
  });

  it('is thrown once as the gun’s swap passes RELEASE, from that player’s gun, and not by a gun at rest', () => {
    const draw = (swap: number) =>
      held([], [0, 1.4, 0], [0, 0, 0, 1], 1, 1, 15, 0, 0, 0, { swap, id: 9, floor: 0 });
    draw(-1);
    draw(0.1);
    expect(drops()).toBe(0);
    draw(RELEASE + 0.01);
    expect(drops()).toBe(1);
    draw(RELEASE + 0.05);
    draw(0.6);
    expect(drops()).toBe(1);
    // The battery is the drop's after RELEASE: not drawn on the gun until the hand brings the new one.
    const at = (swap: number) => {
      const out: number[] = [];
      held(out, [0, 1.4, 0], [0, 0, 0, 1], 1, 1, 15, 0, 0, 0, { swap });
      return out.length;
    };
    expect(at(0.3)).toBe(at(0.6) - battery(1).length);
  });
});
