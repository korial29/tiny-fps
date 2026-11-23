import { expect, it } from 'vitest';
import {
  HARPOON_GONE,
  HARPOON_RACK,
  HUNTER_REST,
  drawHarpoon,
  harpoonFeed,
  hunter,
  hunterHarpoon,
  hunterPose,
  hunterRig,
} from './hunter';
import { rest, solve, turn } from './rig';
import { GILT, STRIDE, TWILL, WEAVE } from './mesh';

it('keeps the front of the pectorals smooth across the Marine shoulder ring', () => {
  const mesh = hunter(2)['Marine anatomy'];
  let sampled = 0;
  for (let i = 0; i < mesh.length; i += STRIDE) {
    const [x, y, z] = mesh.slice(i, i + 3);
    if (Math.abs(x) < 0.185 && Math.abs(y - 1.692) < 0.004 && z < -0.17) {
      expect(mesh[i + 5]).toBeLessThan(-0.8);
      sampled++;
    }
  }
  expect(sampled).toBeGreaterThan(0);
});

it('adds the Hunter armor details and uses the metal and net materials', () => {
  const model = hunter(2);
  for (const name of ['Shoulder plates', 'Belt', 'Flying disc']) {
    expect(model[name]?.length, name).toBeGreaterThan(0);
  }
  expect(
    model['Chest net'].some((_, i) => i % STRIDE === 8 && model['Chest net'][i] === WEAVE),
  ).toBe(true);
  for (const name of ['Cranial shell', 'Shin plates 1', 'Flying disc']) {
    const mesh = model[name];
    expect(
      mesh.some((_, i) => i % STRIDE === 8 && mesh[i] === TWILL),
      name,
    ).toBe(true);
  }
  expect(
    hunter(0)['Marine anatomy'].some(
      (_, i) => i % STRIDE === 8 && hunter(0)['Marine anatomy'][i] === WEAVE,
    ),
  ).toBe(false);
});

it('builds the Hunter harpoon as a detailed foldable rifle', () => {
  const rifle = hunterHarpoon(1);
  expect(rifle.length).toBeGreaterThan(300 * STRIDE);
  expect(rifle.length % STRIDE).toBe(0);
  expect(rifle.some((_, i) => i % STRIDE === 6 && rifle[i] > 0.4)).toBe(true);
  // Brushed bronze shell (TWILL), a gilt bolt and the leather grip's plain layer; the forked
  // prongs and lattice cage reaching past the bolt's point.
  const layers = new Set(rifle.filter((_, i) => i % STRIDE === 8));
  expect(layers).toEqual(new Set([TWILL, GILT, -1]));
  const zs = rifle.filter((_, i) => i % STRIDE === 2);
  const xs = rifle.filter((_, i) => i % STRIDE === 0);
  expect(Math.min(...zs)).toBeLessThan(-1.3);
  expect(Math.max(...xs.filter((_, i) => zs[i] < -1.25))).toBeGreaterThan(0.12);
});

it('cuts the Hunter into joint pieces that rebuild his model at rest', () => {
  const { pieces, bands } = hunterRig(1);
  const total = Object.values(hunter(1)).reduce((n, part) => n + part.length, 0);
  const drawn = [...pieces, ...bands].reduce((n, piece) => n + piece.vertices.length, 0);
  expect(drawn).toBe(total);
  // The spine, the shoulders, hips, knees, ankles, balls of the feet and elbows bend smoothly.
  expect(bands.length).toBe(14);
  const at: [number, number, number] = [2, 1, -4];
  const pose = solve(rest(at, 0.7));
  const joints = hunterPose(pose.pos, pose.rot, at, 0.7);
  joints.forEach((p, j) => {
    const want = turn(pose.rot[j], HUNTER_REST[j]);
    p.forEach((v, k) => expect(v).toBeCloseTo(at[k] + want[k], 6));
  });
});

it('reloads the harpoon by its bolt alone: the fired one leaves forward, the next comes in from behind', () => {
  expect(harpoonFeed(-1)).toBe(1);
  expect(harpoonFeed(0)).toBe(0);
  expect(harpoonFeed(HARPOON_RACK)).toBe(0);
  expect(harpoonFeed(0.6)).toBeGreaterThan(0);
  expect(harpoonFeed(0.6)).toBeLessThan(1);
  expect(harpoonFeed(0.9)).toBe(1);
  const axes = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as [number, number, number][];
  /** The bolt's vertices (the out list holds only it) and their mean z: forward is +z here. */
  const bolt = (feed: number, fired = HARPOON_GONE) => {
    const out: number[] = [];
    drawHarpoon(out, 2, [0, 0, 0], axes, 1, 1, true, feed, [], fired);
    let z = 0;
    for (let i = 2; i < out.length; i += STRIDE) {
      z += out[i];
    }
    return [out.length / STRIDE, (z * STRIDE) / out.length || 0];
  };
  const [seated, at] = bolt(1);
  expect(seated).toBeGreaterThan(0);
  // The tube empty just after the shot, the next bolt further back the less it is fed.
  expect(bolt(0)[0]).toBe(0);
  expect(bolt(0.3)[1]).toBeLessThan(bolt(0.7)[1]);
  expect(bolt(0.7)[1]).toBeLessThan(at);
  // The fired bolt drawn ahead of the seat, then gone.
  const out = bolt(1, 0.5);
  expect(out[0]).toBe(2 * seated);
  expect(out[1]).toBeGreaterThan(at);
});
