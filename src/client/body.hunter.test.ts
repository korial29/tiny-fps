import { expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { counter, createBody, hands, HUNTER_HAND } from './body';
import { JOINT, rest, solve } from './rig';
import { SHINE, STRIDE } from './mesh';
import { mesh } from './store';
import type { Pieces } from './store';

const player: PlayerState = {
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
};

const view = (isHunter: boolean, pieces?: Pieces): number[] => {
  const body = createBody();
  body.wear(0, undefined, false, false, isHunter);
  body.update(player, 1 / 60);
  const out: number[] = [];
  body.draw(out, [0, 1.6, 0], 0, 0, 0, undefined, pieces);
  return out;
};

it('draws the Hunter model equipment on the first-person rig', () => {
  const marine = view(false);
  const hunterView = view(true);
  const pieces: Pieces = [];
  const kept = view(true, pieces);
  const plainHands: number[] = [],
    clawedHands: number[] = [];
  const pose = solve(rest());
  hands(plainHands, pose, 0, [0, 0], [0, 0, 0], HUNTER_HAND);
  hands(clawedHands, pose, 0, [0, 0], HUNTER_HAND, HUNTER_HAND, { claws: 'short' });
  const clawed = clawedHands.length - plainHands.length;
  // Its seven visible parts, the wrist blades' housing, the blades sheathed, and the wrist
  // computer on the left bracer, once: handed over as pieces of the store, they leave the frame's
  // vertices only the clawed hands' difference.
  expect(pieces).toHaveLength(9);
  expect(kept.length - marine.length).toBe(clawed);
  const gear = pieces.reduce((sum, p) => sum + p.m.count * STRIDE, 0);
  // With no list to hand them to, the same parts are written into the frame's vertices.
  expect(hunterView.length - marine.length).toBe(gear + clawed);
  expect(hunterView.some((_, i) => i % STRIDE === 8 && hunterView[i] === SHINE)).toBe(true);
  expect(hunterView.length % STRIDE).toBe(0);
});

it('folds the shoulder cannon out into the own view when it is taken, and back out of it', () => {
  const body = createBody();
  body.wear(0, undefined, false, false, true);
  body.aim([0, 0, 30]);
  /** The cannon's piece after `seconds` with the cannon in hand or not, if it is drawn. */
  const cannon = (railed: boolean, seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      body.update({ ...player, railed, wield: !railed }, 1 / 60);
    }
    const pieces: Pieces = [];
    body.draw([], [0, 1.6, 0], 0, 0, 0, undefined, pieces);
    return pieces.find(p => p.m === mesh('hunter view cannon', () => {}));
  };
  expect(cannon(false, 0.5)).toBeUndefined();
  // Out, its hinge over the left shoulder ahead of the eye.
  const out = cannon(true, 1)!;
  expect(out.t[0]).toBeCloseTo(-0.25, 2);
  expect(out.t[1]).toBeCloseTo(1.6, 2);
  expect(out.t[2]).toBeCloseTo(-0.3, 2);
  // On its post, which stands on the left shoulder (the user, 2026-11-23): drawn from the same
  // hinge, it reaches down and back to below the bottom left of the view.
  const pieces: Pieces = [];
  body.draw([], [0, 1.6, 0], 0, 0, 0, undefined, pieces);
  const post = pieces.find(p => p.m === mesh('hunter view post', () => {}))!;
  expect(post.t).toEqual(out.t);
  expect(post.q).not.toEqual(out.q);
  // The muzzle is past the near plane, left of the crosshair and near the horizon.
  const [x, y, z] = body.muzzle();
  expect(z).toBeGreaterThan(0.3);
  expect(x / z).toBeLessThan(-0.3);
  expect(Math.abs(y / z)).toBeLessThan(0.3);
  // Half way, it is on its swing up; put away, it folds back out of the view.
  // (its post swings it over from behind the shoulder).
  expect(cannon(false, 0.1)!.t[2]).toBeGreaterThan(out.t[2]);
  expect(cannon(false, 1)).toBeUndefined();
});

it('keeps the shoulder plates out of the own view: they showed grey in its top corners', () => {
  // The highest the own gear reaches level with the eye or ahead of it, the cannon stowed: under
  // the eye by a hand, so a bob or a look up never brings it into the view's top corners. The
  // cannon's saddle and the harness are higher, but behind the eye.
  const out = view(true);
  let top = -Infinity;
  for (let i = 0; i < out.length; i += STRIDE) {
    if (out[i + 2] < 0.05) {
      top = Math.max(top, out[i + 1]);
    }
  }
  expect(top).toBeLessThan(1.6 - 0.1);
});

it('brings the left hand up open in a guard while the wrist blades are out (the user, 2026-11-23)', () => {
  /** The left hand from the eye, after a second with or without the blades in hand, both unarmed otherwise. */
  const left = (wield: boolean) => {
    const body = createBody();
    body.wear(0, undefined, false, false, true);
    body.aim([0, 0, 30]);
    for (let t = 0; t < 1; t += 1 / 60) {
      body.update({ ...player, ammo: -1, blade: true, wield, fists: !wield }, 1 / 60);
    }
    const s = body.pose([0, 1.6, 0], 0, 0)!;
    const [x, y, z] = s.pos[JOINT.HAND_L];
    return [x, y - 1.6, z];
  };
  const [x, y, z] = left(true);
  // Ahead of the eye (yaw 0 faces -z), on the left, in the lower half of the view.
  expect(z).toBeLessThan(-0.3);
  expect(x).toBeLessThan(-0.1);
  expect(y).toBeGreaterThan(-0.35);
  expect(y).toBeLessThan(0);
});

it('swings the guard hand with a cut: out through the wind-up, tucked in on the strike, back by the end', () => {
  const cut = { cut: 1 };
  expect(counter(cut, -1)).toEqual([0, 0]);
  const [early] = counter(cut, 0.15);
  const [top, inTop] = counter(cut, 0.37);
  expect(early).toBeGreaterThan(0);
  expect(top).toBeGreaterThan(early);
  expect(inTop).toBe(0);
  const [out, tucked] = counter(cut, 0.6);
  expect(out).toBe(0);
  expect(tucked).toBe(1);
  expect(counter(cut, 1)).toEqual([0, 0]);
});
