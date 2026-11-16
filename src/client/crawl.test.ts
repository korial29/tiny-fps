import { describe, expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import { MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { createCrawl, turned } from './crawl';
import { basis } from './mesh';

/** Yaws that look toward +x (the east wall), +z along it and -x away from it. */
const [EAST, SOUTH, WEST] = [(3 * Math.PI) / 2, Math.PI, Math.PI / 2];
const QUARTER = Math.PI / 2;
/** The drawn view's right, up and forward. */
const frame = ([y, p, r]: number[]) => basis(y, p, r);
const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5));

describe('the view turned over onto a wall (the user, 2026-11-16, after Aliens versus Predator)', () => {
  it('sees the wall as its floor: up out of it, forward up it looking at it', () => {
    const [, up, fwd] = frame(turned(EAST, 0, 0, SIDE.EAST, QUARTER));
    close(up, [-1, 0, 0]);
    close(fwd, [0, 1, 0]);
  });

  it('looks along it looking along it, and down it looking away', () => {
    let [, up, fwd] = frame(turned(SOUTH, 0, 0, SIDE.EAST, QUARTER));
    close(up, [-1, 0, 0]);
    close(fwd, [0, 0, 1]);
    [, up, fwd] = frame(turned(WEST, 0, 0, SIDE.EAST, QUARTER));
    close(fwd, [0, -1, 0]);
    // Looking up is looking out of the wall.
    [, , fwd] = frame(turned(EAST, 1.2, 0, SIDE.EAST, QUARTER));
    expect(fwd[0]).toBeLessThan(-0.9);
  });

  it('leaves the view as it is with no turn, on every wall', () => {
    for (const wall of [SIDE.EAST, SIDE.WEST, SIDE.SOUTH, SIDE.NORTH]) {
      const v = [0.7, -0.4, 0.1];
      frame(turned(v[0], v[1], v[2], wall, 0)).forEach((a, i) => close(a, frame(v)[i]));
    }
  });

  it('turns over as the xenomorph takes hold, and back when it lets go', () => {
    const crawl = createCrawl();
    const p: PlayerState = {
      id: 1,
      x: 0,
      y: 2,
      z: 0,
      vy: 0,
      yaw: EAST,
      pitch: 0,
      ground: false,
      ...STILL,
      mode: MODE.CLING,
      wall: SIDE.EAST,
    };
    expect(crawl.view(EAST, 0, 0)).toEqual([EAST, 0, 0]);
    for (let i = 0; i < 30; i++) {
      crawl.update(p, 1 / 60);
    }
    expect(frame(crawl.view(EAST, 0, 0))[2][1]).toBeGreaterThan(0.99);
    for (let i = 0; i < 30; i++) {
      crawl.update({ ...p, mode: MODE.AIR }, 1 / 60);
    }
    expect(frame(crawl.view(EAST, 0, 0))[2][1]).toBeLessThan(0.05);
  });
});
