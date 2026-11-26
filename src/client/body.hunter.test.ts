import { expect, it } from 'vitest';
import { STILL } from '../shared/physics';
import type { PlayerState } from '../shared/types';
import { counter, createBody, hands, HUNTER_HAND } from './body';
import { JOINT, rest, solve, turn } from './rig';
import { SHINE, STRIDE } from './mesh';
import { mesh } from './store';
import { FIRE_KEY, wristComputer } from './computer';
import { HUNTER_CELLS } from '../shared/constants';
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

const view = (isHunter: boolean, pieces?: Pieces, p: PlayerState = player): number[] => {
  const body = createBody();
  body.wear(0, undefined, false, false, isHunter);
  body.update(p, 1 / 60);
  const out: number[] = [];
  body.draw(out, [0, 1.6, 0], 0, 0, 0, undefined, pieces);
  return out;
};

it('draws the Hunter model equipment on the first-person rig', () => {
  const marine = view(false);
  const hunterView = view(true, undefined, { ...player, rifle: 0 });
  const pieces: Pieces = [];
  // His disc found: it hangs at his hip (the user, 2026-11-26: not before).
  const found = { ...player, rifle: 0 };
  const kept = view(true, pieces, found);
  const plainHands: number[] = [],
    clawedHands: number[] = [];
  const pose = solve(rest());
  hands(plainHands, pose, 0, [0, 0], [0, 0, 0], HUNTER_HAND);
  hands(clawedHands, pose, 0, [0, 0], HUNTER_HAND, HUNTER_HAND, { claws: 'short' });
  const clawed = clawedHands.length - plainHands.length;
  // Its eight visible parts (the cannon's arm has a knuckle of its own), the wrist blades' housing, the blades sheathed, and the wrist
  // computer on the left bracer, once: handed over as pieces of the store, they leave the frame's
  // vertices only the clawed hands' difference.
  expect(pieces).toHaveLength(10);
  expect(kept.length - marine.length).toBe(clawed);
  const gear = pieces.reduce((sum, p) => sum + p.m.count * STRIDE, 0);
  // With no list to hand them to, the same parts are written into the frame's vertices.
  expect(hunterView.length - marine.length).toBe(gear + clawed);
  // Not found yet, the disc is not at his hip: one piece fewer.
  const bare: Pieces = [];
  view(true, bare);
  expect(bare).toHaveLength(9);
  expect(hunterView.some((_, i) => i % STRIDE === 8 && hunterView[i] === SHINE)).toBe(true);
  expect(hunterView.length % STRIDE).toBe(0);
});

it('leaves the wrist computer out of the own view while the left hand is on the harpoon (the user, 2026-11-24)', () => {
  // Its glyphs show the cannon's shots left: the player's `cap`.
  const shots = player.cap ?? HUNTER_CELLS;
  const computer = mesh(`wrist computer ${shots}`, o => o.push(...wristComputer(shots)));
  /** Whether the computer is drawn after `seconds` with the harpoon in hand or no weapon. */
  const shown = (harpoon: boolean, seconds: number) => {
    const body = createBody();
    body.wear(0, undefined, false, false, true);
    const p = harpoon ? { ...player, ammo: 3, mag: 1 } : player;
    for (let t = 0; t < seconds; t += 1 / 60) {
      body.update(p, 1 / 60);
    }
    const pieces: Pieces = [];
    body.draw([], [0, 1.6, 0], 0, 0, 0, undefined, pieces);
    return pieces.some(piece => piece.m === computer);
  };
  expect(shown(false, 0.5)).toBe(true);
  // Neither as the forearm rolls up to the grip nor once it holds it.
  expect(shown(true, 0.2)).toBe(false);
  expect(shown(true, 1.5)).toBe(false);
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

/** The poses of a second's run at 7 m/s after the weapon has come to hand, the cannon out or the harpoon in hand. */
const running = (railed: boolean) => {
  const body = createBody();
  body.wear(0, undefined, false, false, true);
  const p = { ...player, vz: -7, railed, ammo: 3, mag: 1 };
  const poses = [];
  for (let i = 0; i < 150; i++) {
    body.update(p, 1 / 60);
    if (i >= 90) {
      poses.push(body.pose([0, 1.6, 0], 0, -0.1)!);
    }
  }
  return poses;
};

it('keeps the index on the wrist computer’s fire key through a run with the cannon out (the user, 2026-11-25)', () => {
  // The index lies on the forearm's line, 0.165 m from the wrist to its tip; it hovers 34 mm
  // off the key between shots. As the shoulders moved through a stride it went centimetres past
  // the key, into the computer.
  for (const s of running(true)) {
    const key = turn(s.rot[JOINT.FOREARM_L], FIRE_KEY).map((v, k) => v + s.pos[JOINT.HAND_L][k]);
    const fore = s.pos[JOINT.HAND_R].map((v, k) => v - s.pos[JOINT.FOREARM_R][k]);
    const long = Math.hypot(...fore);
    const tip = s.pos[JOINT.HAND_R].map((v, k) => v + (fore[k] / long) * 0.165);
    expect(Math.hypot(...tip.map((v, k) => v - key[k]))).toBeLessThan(0.04);
  }
});

it('holds the shoulders steadier through a stride with the cannon out (the user, 2026-11-25)', () => {
  /** How far the left shoulder travels across a second's run, metres, the eye still. */
  const travel = (railed: boolean) => {
    const at = running(railed).map(s => s.pos[JOINT.ARM_L]);
    return Math.max(
      ...[0, 1, 2].map(k => Math.max(...at.map(v => v[k])) - Math.min(...at.map(v => v[k]))),
    );
  };
  // 23 mm, against 40 with the harpoon in hand; 49 with each joint stilled apart, which left the
  // pelvis's sway whole.
  expect(travel(true)).toBeLessThan(0.03);
  expect(travel(true)).toBeLessThan(0.7 * travel(false));
});
