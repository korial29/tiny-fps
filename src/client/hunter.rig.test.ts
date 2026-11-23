import { expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { STRIDE } from './mesh';
import { animate, stance } from './soldier';
import type { Runner } from './soldier';
import { turn } from './rig';
import { HUNTER_REST, blendHunter, hunterPose, hunterRig } from './hunter';

/** The widest a triangle edge shared at rest opens once the running Hunter is posed. */
const widestSeam = (frames: number) => {
  const book = new Map<number, Runner>();
  let p: PlayerState = {
    ...STILL,
    id: 1,
    x: 5,
    y: 1,
    z: 0,
    vy: 0,
    yaw: 0,
    pitch: 0,
    ground: true,
    vz: -6,
  };
  for (let i = 0; i < frames; i++) {
    animate(book, [p], 1 / 60);
    p = { ...p, z: p.z - 0.1 };
  }
  const { s, yaw } = stance(book.get(1)!);
  const joints = hunterPose(s.pos, s.rot, [p.x, p.y, p.z], yaw);
  const edges = new Map<string, number[]>();
  let widest = 0;
  const triangles = (rest: ArrayLike<number>, posed: ArrayLike<number>) => {
    for (let i = 0; i < rest.length; i += 3 * STRIDE) {
      for (let e = 0; e < 3; e++) {
        const [a, b] = [i + e * STRIDE, i + ((e + 1) % 3) * STRIDE];
        const key = (k: number) => [0, 1, 2].map(d => Math.round(rest[k + d] * 2000)).join();
        const [ka, kb] = [key(a), key(b)];
        const [u, v] = ka < kb ? [a, b] : [b, a];
        const at = [0, 1, 2].flatMap(d => [posed[u + d], posed[v + d]]);
        const seen = edges.get(ka < kb ? ka + kb : kb + ka);
        if (!seen) {
          edges.set(ka < kb ? ka + kb : kb + ka, at);
        } else {
          for (const o of [0, 1]) {
            const gap = Math.hypot(
              at[o] - seen[o],
              at[2 + o] - seen[2 + o],
              at[4 + o] - seen[4 + o],
            );
            widest = Math.max(widest, gap);
          }
        }
      }
    }
  };
  const rig = hunterRig(1);
  for (const piece of rig.pieces) {
    const { vertices: v, joint } = piece;
    const [rest, posed] = [v.slice(), v.slice()];
    for (let i = 0; i < v.length; i += STRIDE) {
      const at = turn(s.rot[joint], [v[i], v[i + 1], v[i + 2]]);
      for (let d = 0; d < 3; d++) {
        rest[i + d] = v[i + d] + HUNTER_REST[joint][d];
        posed[i + d] = at[d] + joints[joint][d];
      }
    }
    triangles(rest, posed);
  }
  for (const band of rig.bands) {
    const posed: number[] = [];
    blendHunter(posed, band, joints, s.rot);
    triangles(band.vertices, posed);
  }
  return widest;
};

it('keeps the running Hunter closed at his knees, ankles, elbows and shoulders (the user, 2026-11-23)', () => {
  // Rigid pieces alone opened 10 to 50 cm. What is left is a few centimetres under the shoulder plates.
  for (const frames of [30, 36, 42, 48, 54]) {
    expect(widestSeam(frames), `frame ${frames}`).toBeLessThan(0.045);
  }
});
