import { describe, expect, it } from 'vitest';
import { EYE, HEAVY_MAX, STING, TAILS } from '../shared/constants';
import { STILL } from '../shared/physics';
import { MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { createBody } from './body';
import type { Body } from './body';
import { STRIDE, basis } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J } from './rig';
import { lashOf } from './xeno';

// The xenomorph's own first-person body (the user, 2026-11-16): on a wall it heads where it looks,
// and its tail answers a click at once, coiled in an S on its side while it charges.
const DT = 1 / 60;
const [TAN, ASPECT] = [Math.tan((35 * Math.PI) / 180), 16 / 9];
/** Yaws that look toward +x, +z and -x. */
const [EAST, SOUTH, WEST] = [(3 * Math.PI) / 2, Math.PI, Math.PI / 2];

const beast = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: EAST,
  pitch: 0,
  ground: true,
  ...STILL,
  ...o,
});
const own = () => {
  const body = createBody();
  body.wear(0, undefined, false, true);
  return body;
};
const watch = (body: Body, p: PlayerState, n: number) => {
  for (let i = 0; i < n; i++) {
    body.update(p, DT);
  }
  return body;
};
const eyeOf = (p: PlayerState): Vec3 => [p.x, p.y + EYE, p.z];
/** The vertices drawn in sight of a camera at the eye, looking `yaw` and `pitch`. */
const inView = (body: Body, p: PlayerState, yaw = p.yaw, pitch = 0): number => {
  const out: number[] = [];
  const e = eyeOf(p);
  body.draw(out, e, yaw, pitch, 0, [1, 0, 0]);
  const b = basis(yaw, pitch);
  let n = 0;
  for (let i = 0; i < out.length; i += STRIDE) {
    const d = [out[i] - e[0], out[i + 1] - e[1], out[i + 2] - e[2]];
    const [x, y, z] = b.map(a => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]);
    n += +(z > 0.1 && Math.abs(x) < z * TAN * ASPECT && Math.abs(y) < z * TAN);
  }
  return n;
};

describe('the xenomorph’s own body on a wall', () => {
  // On the wall east of it (x = 0.4), clinging.
  const on = (yaw: number) =>
    beast({ mode: MODE.CLING, ground: false, y: 2, wall: SIDE.EAST, yaw });
  /** Its trunk's way, the pelvis to the chest, after it has watched itself look `yaw`. */
  const trunk = (yaw: number) => {
    const p = on(yaw);
    const s = watch(own(), p, 60).pose(eyeOf(p), yaw, 0)!;
    const [a, b] = [s.pos[J.PELVIS], s.pos[J.CHEST]];
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const n = Math.hypot(...d);
    return d.map(v => v / n);
  };

  it('heads up it looking at it and along it looking along it: the body turns with the mouse', () => {
    const [up, along, away] = [trunk(EAST), trunk(SOUTH), trunk(WEST)];
    expect(up[1]).toBeGreaterThan(0.8);
    expect(along[2]).toBeGreaterThan(0.8);
    expect(away[1]).toBeLessThan(-0.8);
  });

  it('keeps its trunk out of the view looking along the wall: it lies behind the eye', () => {
    const p = on(SOUTH);
    const body = watch(own(), p, 60);
    expect(inView(body, p, SOUTH, 0)).toBe(0);
    // Facing the wall, its claws are on it in sight.
    const q = on(EAST);
    expect(inView(watch(own(), q, 60), q, EAST, -0.3)).toBeGreaterThan(100);
  });
});

describe('its tail in the own view', () => {
  const tail = (cut: number, swing: number, charge = 0) => {
    const p = beast({ cut, swing, charge });
    const body = watch(own(), beast(), 30);
    const bare = inView(body, beast(), EAST, -0.2);
    watch(body, p, 1);
    return inView(body, p, EAST, -0.2) - bare;
  };

  it('is in sight within 4 ticks of the click, every strike (the user, 2026-11-16: it answered late)', () => {
    for (const cut of [STING.STAB, STING.SWEEP_L, STING.SWEEP_R, STING.LASH]) {
      expect(tail(cut, TAILS[cut].ticks - 4)).toBeGreaterThan(50);
    }
  });

  it('coils in an S on its side as the charge grows, in sight', () => {
    const { ticks, hold } = TAILS[STING.STAB];
    const coil = (charge: number) =>
      lashOf({ cut: STING.STAB, swing: ticks - hold, charge, down: 0 })[6] ?? 0;
    expect(coil(0)).toBe(0);
    expect(coil(HEAVY_MAX / 4)).toBeGreaterThan(0.3);
    expect(coil(HEAVY_MAX)).toBe(1);
    expect(coil(HEAVY_MAX)).toBeGreaterThan(coil(HEAVY_MAX / 4));
    expect(tail(STING.STAB, ticks - hold, HEAVY_MAX)).toBeGreaterThan(50);
  });
});
