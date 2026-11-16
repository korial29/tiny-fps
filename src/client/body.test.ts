import { describe, expect, it } from 'vitest';
import {
  AMMO_MAX,
  DASH_COOLDOWN,
  EYE,
  GRAB_GAP,
  LOW_EYE,
  PLAYER_R,
  PUNCH,
} from '../shared/constants';
import { STILL } from '../shared/physics';
import { MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { FINGER_SIDES, STRAP, createBody, finger, hand, phalanges } from './body';
import type { Body } from './body';
import { MUZZLE, REAR, button, gun, readout } from './gun';
import { BOW, ends } from './katana';
import { STRIDE, basis, dot } from './mesh';
import type { Vec3 } from './mesh';
import { JOINT as J, rest, solve, turn } from './rig';
import { CUFF, CUFF_SIDES, body as skinOf, palette } from './skin';

const DT = 1 / 60;
const TEAM = [0.1, 0.8, 0.2];
const [JACKET, , PANTS, FLESH, HAIR, UPPER, SOLE, GLOVE, SHADES] = palette(TEAM);
/** The vertical half of the field of view (70 degrees) and a wide screen. */
const [TAN, ASPECT, NEAR] = [Math.tan((35 * Math.PI) / 180), 16 / 9, 0.1];

const man = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...o,
});
const eyeOf = (p: PlayerState): Vec3 => [
  p.x,
  p.y + (p.mode == MODE.SLIDE || p.mode == MODE.CROUCH ? LOW_EYE : EYE),
  p.z,
];
const hang = man({
  mode: MODE.HANG,
  ground: false,
  y: 0.4,
  z: 5.43,
  wall: SIDE.NORTH,
  edge: 2.4,
});
const slide = man({ mode: MODE.SLIDE, vz: -8 });
const dash = man({ mode: MODE.AIR, ground: false, y: 0.3, vz: -16, dash: DASH_COOLDOWN - 2 });
const wall = man({ mode: MODE.WALLRUN, ground: false, y: 1.2, vz: -8, wall: SIDE.EAST });

/** A body that has watched `n` frames of `p`. */
const watch = (p: PlayerState, n: number, body = createBody()) => {
  for (let i = 0; i < n; i++) {
    body.update(p, DT);
  }
  return body;
};
/** A body that has run `n` frames along -z at speed v, a step of v / 60 a frame. */
const run = (v: number, n: number, body = createBody()) => {
  const p = man({ vz: -v });
  for (let i = 0; i < n; i++) {
    p.z -= v * DT;
    body.update(p, DT);
  }
  return { body, p };
};
const pose = (body: Body, p: PlayerState, pitch = 0) => body.pose(eyeOf(p), p.yaw, pitch)!;
/** A world point in the camera's right, up, forward. */
const local = (p: PlayerState, w: Vec3, pitch = 0): Vec3 => {
  const e = eyeOf(p);
  const d = [w[0] - e[0], w[1] - e[1], w[2] - e[2]];
  return basis(p.yaw, pitch).map(a => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]) as Vec3;
};
/** Whether a point in camera space is on a wide screen, and how far from the camera it must be to be drawn. */
const inside = ([x, y, z]: Vec3) =>
  z > 0 && Math.abs(x) < z * TAN * ASPECT && Math.abs(y) < z * TAN;
const seen = (l: Vec3) => inside(l) && l[2] > NEAR;
/** The hands, wrists in the camera's space. */
const hands = (p: PlayerState, body: Body, pitch = 0) => {
  const s = pose(body, p, pitch);
  return [J.HAND_L, J.HAND_R].map(j => local(p, s.pos[j], pitch));
};

interface Vert {
  at: Vec3;
  n: Vec3;
  c: number[];
}
/** The vertices drawn for a camera at the player's eye. */
const draw = (body: Body, p: PlayerState, pitch = 0, color = TEAM): Vert[] => {
  const out: number[] = [];
  body.draw(out, eyeOf(p), p.yaw, pitch, 0, color);
  expect(out.length % (3 * STRIDE)).toBe(0);
  return Array.from({ length: out.length / STRIDE }, (_, i) => {
    const v = out.slice(i * STRIDE, (i + 1) * STRIDE);
    return { at: [v[0], v[1], v[2]], n: [v[3], v[4], v[5]], c: [v[6], v[7], v[9]] };
  });
};
const colored = (v: Vert[], c: number[]) => v.filter(q => c.every((n, i) => q.c[i] == n));
/**
 * Vertices of the hand, in the order drawn: the palm, a tube of the cuff's sides and 3 rings; each
 * finger, one of FINGER_SIDES and 15 rings from where it leaves the palm (four rings round each bend,
 * the glove's edge), then a fan, and its nail; the weld from the palm's last ring to the fingers'
 * roots (the user, 2026-11-09: one piece), the palm's 24 and the roots' outline zipped (46 steps); the thumb,
 * 14 rings from halfway along its first bone, and its nail; its mound, two strips from the palm;
 * the glove's gear (the knuckles' shell, the back's plate and its stitching, the strap and its buckle).
 */
const [PALM, FINGER, THUMB, NAIL, WELD, MOUND, GEAR] = [
  12 * CUFF_SIDES,
  810,
  750,
  24,
  (CUFF_SIDES + 46) * 3,
  2 * FINGER_SIDES * 6,
  1764 + 18 * CUFF_SIDES,
];
const HAND = PALM + 4 * (FINGER + NAIL) + WELD + THUMB + NAIL + MOUND + GEAR;
const away = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

describe('body', () => {
  it('shows nothing before it knows the player, or when it is gone, and knows its id', () => {
    const body = createBody();
    const out: number[] = [];
    expect(body.id).toBe(-1);
    expect(body.pose([0, EYE, 0], 0, 0)).toBeUndefined();
    body.draw(out, [0, EYE, 0], 0, 0);
    expect(out).toEqual([]);
    watch(man({ id: 4 }), 3, body);
    expect(body.pose([0, EYE, 0], 0, 0)).toBeDefined();
    expect(body.id).toBe(4);
    body.update(undefined, DT);
    body.draw(out, [0, EYE, 0], 0, 0);
    expect(out).toEqual([]);
    expect(body.id).toBe(-1);
  });

  it('draws nothing while the camera is away from the body', () => {
    const body = watch(man(), 30);
    const out: number[] = [];
    body.draw(out, [0, EYE + 3, 0], 0, 0);
    body.draw(out, [4, EYE, 0], 0, 0);
    expect(out).toEqual([]);
    // The bob and a respawn's eased half step are well within it.
    body.draw(out, [0.03, EYE + 0.04, 0], 0, 0);
    expect(out.length).toBeGreaterThan(0);
  });

  it('wears the colours of the team: jacket, gloves, trousers and shoes, with no head', () => {
    const p = man();
    const body = watch(p, 40);
    const v = draw(body, p, -1.2);
    for (const c of [JACKET, GLOVE, PANTS, UPPER, SOLE]) {
      expect(colored(v, c).length).toBeGreaterThan(30);
    }
    for (const c of [HAIR, SHADES]) {
      expect(colored(v, c)).toHaveLength(0);
    }
    // The skin only at the bare finger tips, out of the fingerless gloves.
    expect(colored(v, FLESH).length).toBeLessThan(2 * 5 * FINGER);
    // Another team, another jacket, nothing else changes.
    const other = draw(body, p, -1.2, [0.9, 0.1, 0.1]);
    expect(other).toHaveLength(v.length);
    expect(colored(other, [0.9, 0.1, 0.1]).length).toBe(colored(v, JACKET).length);
    expect(colored(other, GLOVE).length).toBe(colored(v, GLOVE).length);
  });

  describe('arms', () => {
    it('throw a punch into the view: with no weapon and a swing, the left fist up to its middle at the strike, and down again after', () => {
      const p = man();
      const body = watch(p, 60);
      const rest = hands(p, body)[0];
      expect(seen(rest)).toBe(false);
      // The swing runs down a tick a frame, as the predictor gives it.
      const at: Vec3[] = [];
      for (let swing = PUNCH.ticks; swing >= 0; swing--) {
        body.update({ ...p, swing }, DT);
        at.push(hands(p, body)[0]);
      }
      const strike = at[PUNCH.strike];
      expect(seen(strike)).toBe(true);
      expect(Math.abs(strike[0])).toBeLessThan(0.12);
      expect(strike[1]).toBeGreaterThan(-0.3);
      expect(strike[2]).toBeGreaterThan(0.45);
      // Further out than as the swing starts and as it ends.
      expect(strike[2]).toBeGreaterThan(at[0][2] + 0.2);
      expect(strike[2]).toBeGreaterThan(at[PUNCH.ticks][2] + 0.2);
      // Over, it hangs again, out of the view.
      const after = hands(p, watch(p, 30, body))[0];
      expect(seen(after)).toBe(false);
      expect(after[1]).toBeLessThan(-0.55);
      // With a gun in hand a swing left over moves nothing.
      const armed = watch(man({ ammo: 5 }), 60);
      const [was] = hands(p, armed);
      armed.update({ ...man({ ammo: 5 }), swing: PUNCH.ticks - PUNCH.strike }, DT);
      expect(hands(p, armed)[0][2]).toBeCloseTo(was[2], 2);
    });

    it('hang along the body when idle, either side, out of the view', () => {
      const p = man();
      const [l, r] = hands(p, watch(p, 60));
      expect(l[0]).toBeLessThan(-0.15);
      expect(r[0]).toBeGreaterThan(0.15);
      for (const h of [l, r]) {
        expect(h[1]).toBeLessThan(-0.55);
        expect(seen(h)).toBe(false);
      }
      // No glove on the screen at all.
      expect(colored(draw(watch(p, 60), p), GLOVE).filter(g => seen(local(p, g.at)))).toHaveLength(
        0,
      );
    });

    it('swing like a pendulum with the stride: up into the lower view ahead, out of it behind, against each other', () => {
      for (const v of [6, 10]) {
        const body = createBody();
        const q = man({ vz: -v });
        const [gap, up, shown] = [[], [], []] as number[][];
        for (let i = 0; i < 150; i++) {
          q.z -= v * DT;
          body.update(q, DT);
          const [l, r] = hands(q, body);
          if (i > 60) {
            gap.push(l[2] - r[2]);
            up.push(r[1]);
            shown.push(
              colored(draw(body, q), GLOVE).filter(
                g => seen(local(q, g.at)) && local(q, g.at)[0] > 0,
              ).length,
            );
          }
        }
        // When one hand is forward the other is back, and then the other way round.
        expect(Math.max(...gap)).toBeGreaterThan(0.06);
        expect(Math.min(...gap)).toBeLessThan(-0.06);
        // It rises into the lower view, and drops below it again: in sight on some frames, out of it on others.
        expect(Math.max(...up)).toBeGreaterThan(-0.3);
        expect(Math.min(...up)).toBeLessThan(-0.5);
        expect(Math.max(...shown)).toBeGreaterThan(50);
        expect(Math.min(...shown)).toBe(0);
      }
    }, 30_000);

    it('swing higher and wider with the speed, a sprint the highest', () => {
      const range = (speed: number) => {
        const body = createBody();
        const q = man({ vz: -speed });
        const ys: number[] = [];
        for (let i = 0; i < 240; i++) {
          q.z -= speed * DT;
          body.update(q, DT);
          ys.push(hands(q, body)[1][1]);
        }
        return [Math.min(...ys), Math.max(...ys)];
      };
      const [walk, jog, sprint] = [range(1.5), range(5), range(10)];
      expect(jog[1]).toBeGreaterThan(walk[1] + 0.1);
      expect(sprint[1]).toBeGreaterThan(jog[1] + 0.03);
      expect(sprint[1] - sprint[0]).toBeGreaterThan(jog[1] - jog[0]);
    });

    it('pump with the stride, and stay still when standing', () => {
      const { body, p } = run(5, 90);
      p.vz = 0;
      watch(p, 120, body);
      const first = hands(p, body).flat();
      watch(p, 600, body);
      hands(p, body)
        .flat()
        .forEach((v, i) => expect(v).toBeCloseTo(first[i], 4));
    });

    it('swing wider on a sprint than on a jog', () => {
      const travel = (speed: number) => {
        const body = createBody();
        const q = man({ vz: -speed });
        let [lo, hi] = [Infinity, -Infinity];
        for (let i = 0; i < 240; i++) {
          q.z -= speed * DT;
          body.update(q, DT);
          const f = hands(q, body)[1][2];
          [lo, hi] = [Math.min(lo, f), Math.max(hi, f)];
        }
        return hi - lo;
      };
      expect(travel(9)).toBeGreaterThan(travel(3) * 1.4);
    });

    it('go up on a jump and out in a fall', () => {
      const idle = hands(man(), watch(man(), 60));
      const up = man({ mode: MODE.AIR, ground: false, y: 0.5, vy: 4 });
      const fall = { ...up, vy: -4 };
      const [rise, drop] = [up, fall].map(p => hands(p, watch(p, 40)));
      for (const i of [0, 1]) {
        expect(rise[i][1]).toBeGreaterThan(idle[i][1] + 0.12);
        expect(Math.abs(drop[i][0])).toBeGreaterThan(Math.abs(idle[i][0]) + 0.05);
      }
    });

    it('flail out and up in a stumble, swinging, and drop back when it is over', () => {
      const rest = man();
      const calm = hands(rest, watch(rest, 40));
      const p = man({ stun: 40 });
      const body = watch(p, 20);
      const swing = Array.from({ length: 12 }, () => hands(p, watch(p, 1, body)));
      for (const i of [0, 1]) {
        // Out to the sides and higher than at rest, and swinging: some frames on the hand is somewhere else.
        expect(Math.abs(swing[0][i][0])).toBeGreaterThan(Math.abs(calm[i][0]) + 0.1);
        const ys = swing.map(h => h[i][1]);
        expect(Math.max(...ys)).toBeGreaterThan(calm[i][1] + 0.1);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.1);
      }
      hands(rest, watch(rest, 60, body)).forEach((h, i) => {
        expect(h[0]).toBeCloseTo(calm[i][0], 1);
        expect(h[1]).toBeCloseTo(calm[i][1], 1);
      });
    });

    it('drive straight forward on a dash', () => {
      for (const h of hands(dash, watch(dash, 20))) {
        expect(h[2]).toBeGreaterThan(0.3);
        expect(h[1]).toBeGreaterThan(-0.2);
        expect(Math.abs(h[0])).toBeLessThan(0.25);
        expect(seen(h)).toBe(true);
      }
    });

    it('reach for the ledge in a hang, wherever it is, a hand-width apart', () => {
      for (const edge of [2.4, 3.1]) {
        const p = { ...hang, y: edge - 2, edge };
        const s = pose(watch(p, 40), p);
        const [l, r] = [J.HAND_L, J.HAND_R].map(j => s.pos[j]);
        for (const w of [l, r]) {
          // The wrist on the ledge's top, a hand short of its lip, the fingers over it.
          expect(w[1]).toBeGreaterThan(edge - 0.12);
          expect(w[1]).toBeLessThan(edge + 0.15);
          expect(p.z - w[2]).toBeGreaterThan(PLAYER_R + GRAB_GAP - 0.2);
          expect(p.z - w[2]).toBeLessThan(PLAYER_R + GRAB_GAP);
        }
        expect(r[0] - l[0]).toBeGreaterThan(0.15);
        expect(r[0] - l[0]).toBeLessThan(0.35);
      }
    });

    it('push down in the lower view as the body rises past the ledge in a climb', () => {
      const body = watch(hang, 30);
      const heights: number[] = [];
      for (const y of [0.4, 1, 1.6, 2.2, 2.4]) {
        const p = { ...hang, mode: MODE.CLIMB, y };
        watch(p, 8, body);
        heights.push(hands(p, body)[0][1]);
      }
      // The hands start above the eye and end low in the view, never out of reach.
      expect(heights[0]).toBeGreaterThan(0);
      expect(heights.at(-1)).toBeLessThan(-0.15);
      expect(heights.at(-1)).toBeGreaterThan(-0.45);
      expect(heights.every((h, i) => !i || h <= heights[i - 1] + 1e-6)).toBe(true);
    });

    it('brush the wall with the hand on its side in a wall-run', () => {
      for (const [side, yaw, toward] of [
        [SIDE.WEST, 0, -1],
        [SIDE.EAST, 0, 1],
        [SIDE.EAST, Math.PI, -1],
      ]) {
        const p = { ...wall, wall: side, yaw, vz: -8 * Math.cos(yaw) };
        const [l, r] = hands(p, watch(p, 60));
        const [near, far] = toward < 0 ? [l, r] : [r, l];
        expect(Math.abs(near[0])).toBeGreaterThan(0.36);
        expect(Math.sign(near[0])).toBe(toward);
        expect(Math.abs(near[0])).toBeGreaterThan(Math.abs(far[0]));
        expect(seen(near)).toBe(true);
      }
    });

    it('trail one hand low and wide in a slide', () => {
      const [l, r] = hands(slide, watch(slide, 40));
      expect(r[1]).toBeLessThan(l[1]);
      expect(r[0]).toBeGreaterThan(0.3);
    });
  });

  describe('hands', () => {
    /** How far the right hand's fingers go past the wrist, and how wide they spread there. */
    const fingers = (p: PlayerState, body: Body) => {
      const s = pose(body, p);
      const [wrist, f, thumb] = [
        s.pos[J.HAND_R],
        turn(s.rot[J.HAND_R], [0, -1, 0]),
        turn(s.rot[J.HAND_R], [0, 0, -1]),
      ];
      const along = (v: Vert, a: Vec3) =>
        (v.at[0] - wrist[0]) * a[0] + (v.at[1] - wrist[1]) * a[1] + (v.at[2] - wrist[2]) * a[2];
      // The glove and the bare tips round the right wrist, not the left hand's.
      const drawn = draw(body, p);
      const glove = [...colored(drawn, GLOVE), ...colored(drawn, FLESH)].filter(
        v => away(v.at, wrist) < 0.25 && v.at[0] > eyeOf(p)[0],
      );
      const tips = glove.filter(v => along(v, f) > 0.1).map(v => along(v, thumb));
      return {
        reach: Math.max(...glove.map(v => along(v, f))),
        spread: Math.max(...tips) - Math.min(...tips),
      };
    };
    const running = (v: number) => {
      const { body, p } = run(v, 120);
      return fingers(p, body);
    };

    it('close into a loose fist on a run, tighter on a sprint', () => {
      const [idle, jog, fast] = [fingers(man(), watch(man(), 60)), running(5.5), running(10)];
      for (const fist of [idle, jog]) {
        expect(fist.reach).toBeLessThan(0.14);
      }
      expect(fast.reach).toBeLessThan(jog.reach);
      expect(fast.spread).toBeLessThan(jog.spread);
    });

    it('open and spread on a ledge, against a wall, in the air and flat in a slide', () => {
      const fist = running(5.5);
      for (const p of [hang, wall, slide, man({ mode: MODE.AIR, ground: false, y: 1, vy: -3 })]) {
        const open = fingers(p, watch(p, 90));
        expect(open.reach).toBeGreaterThan(fist.reach + 0.04);
        expect(open.spread).toBeGreaterThan(fist.spread);
      }
    });

    it('are a palm, four fingers and a thumb in the glove colour, on a thinner wrist', () => {
      const p = man();
      const v = draw(watch(p, 60), p);
      // The palm and most of each finger in the glove colour (the tips bare, the gear darker); the
      // sleeve's cuff too, a few dozen vertices.
      const glove = colored(v, GLOVE).length;
      expect(glove).toBeGreaterThanOrEqual(2 * (PALM + 5 * FINGER * 0.4));
      expect(glove).toBeLessThan(2 * (PALM + 5 * FINGER) + 33 * CUFF_SIDES);
    });

    describe('as meshes', () => {
      /** The vertices of a tube as it is drawn: the first and last are its root ring and its tip. */
      const edgeKey = (a: Vec3, b: Vec3) => {
        const k = (v: Vec3) => v.map(c => Math.round(c * 1e6)).join();
        return [k(a), k(b)].sort().join('|');
      };
      /** The tubes of a hand at `curl` in its own space: the palm, then the four fingers and the thumb. */
      const tubes = (curl: number) => {
        const out: number[] = [];
        hand(out, [0, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], curl, [1, 1, 1]);
        const v = Array.from({ length: out.length / STRIDE }, (_, i) => ({
          at: out.slice(i * STRIDE, i * STRIDE + 3) as Vec3,
          n: out.slice(i * STRIDE + 3, i * STRIDE + 6) as Vec3,
        }));
        expect(v).toHaveLength(HAND);
        const thumb = PALM + 4 * (FINGER + NAIL) + WELD;
        return [
          v.slice(0, PALM),
          ...Array.from({ length: 4 }, (_, i) =>
            v.slice(PALM + i * (FINGER + NAIL), PALM + i * (FINGER + NAIL) + FINGER),
          ),
          v.slice(thumb, thumb + THUMB),
        ];
      };
      it("wears a fine strap round the wrist, with the marine's lit buttons on it (the user, 2026-11-14)", () => {
        expect(STRAP.w).toBeLessThan(0.012);
        const lit = (lights: boolean) => {
          const out: number[] = [];
          hand(
            out,
            [0, 0, 0],
            [0, 0, 1],
            [0, 1, 0],
            [1, 0, 0],
            0.9,
            [1, 1, 1],
            0,
            0,
            undefined,
            [1, 1, 1],
            0,
            false,
            lights,
          );
          const at: number[][] = [];
          for (let i = 0; i < out.length; i += STRIDE) {
            if (out[i + 8] == -2) {
              at.push(out.slice(i, i + 3));
            }
          }
          return [at, out.length] as const;
        };
        /** The vertices in the buckle's near-black. */
        const shell = (lights: boolean) => {
          const out: number[] = [];
          hand(
            out,
            [0, 0, 0],
            [0, 0, 1],
            [0, 1, 0],
            [1, 0, 0],
            0.9,
            [1, 1, 1],
            0,
            0,
            undefined,
            [1, 1, 1],
            0,
            false,
            lights,
          );
          let k = 0;
          for (let i = 0; i < out.length; i += STRIDE) {
            k += +(out[i + 6] == 0.09 && out[i + 7] == 0.09 && out[i + 9] == 0.1);
          }
          return k;
        };
        const [on, n] = lit(true);
        const [off, m] = lit(false);
        expect(off).toEqual([]);
        expect(n).toBeGreaterThan(m);
        // On the back of the wrist, in place of the buckle: no black box with them.
        expect(on.length).toBeGreaterThan(0);
        for (const [x, y, z] of on) {
          expect(Math.abs(x)).toBeLessThan(0.008);
          expect(y).toBeGreaterThan(0);
          expect(z).toBeLessThan(0.035);
        }
        expect(shell(true)).toBeLessThan(shell(false));
        // A near runner's hand has none of the small parts.
        const out: number[] = [];
        hand(
          out,
          [0, 0, 0],
          [0, 0, 1],
          [0, 1, 0],
          [1, 0, 0],
          0.9,
          [1, 1, 1],
          0,
          0,
          undefined,
          [1, 1, 1],
          0,
          true,
          true,
        );
        for (let i = 0; i < out.length; i += STRIDE) {
          expect(out[i + 8]).not.toBe(-2);
        }
      });
      /** The weld and the thumb's mound. */
      const welds = (curl: number) => {
        const out: number[] = [];
        hand(out, [0, 0, 0], [0, 0, 1], [0, 1, 0], [1, 0, 0], curl, [1, 1, 1]);
        const v = Array.from(
          { length: out.length / STRIDE },
          (_, i) => out.slice(i * STRIDE, i * STRIDE + 3) as Vec3,
        );
        const w = PALM + 4 * (FINGER + NAIL);
        const m = w + WELD + THUMB + NAIL;
        return [v.slice(w, w + WELD), v.slice(m, m + MOUND)];
      };
      // 0.9, every grip's.
      const curls = [0, 0.4, 0.75, 0.9, 1];

      it('are fingerless tactical gloves: bare tips with a nail each, a shell over the knuckles, a stitched plate, a strap', () => {
        const out: number[] = [];
        const bare = [0.8, 0.6, 0.5];
        hand(
          out,
          [0, 0, 0],
          [0, 0, 1],
          [0, 1, 0],
          [1, 0, 0],
          0,
          [0.4, 0.4, 0.4],
          0,
          0,
          undefined,
          bare,
        );
        const v = Array.from({ length: out.length / STRIDE }, (_, i) => ({
          at: out.slice(i * STRIDE, i * STRIDE + 3) as Vec3,
          c: [out[i * STRIDE + 6], out[i * STRIDE + 7], out[i * STRIDE + 9]],
        }));
        const of = (c: number[]) => v.filter(q => q.c.every((n, i) => Math.abs(n - c[i]) < 1e-6));
        // The tips bare, past the glove's end, halfway along the middle phalanx (an open hand: z out along the fingers).
        const tips = of(bare);
        expect(tips.length).toBeGreaterThan(5 * 200);
        expect(
          Math.min(...tips.filter(q => Math.abs(q.at[0]) < 0.04).map(q => q.at[2])),
        ).toBeGreaterThan(0.13);
        // A nail on each, in a paler pink, on the back (+y).
        const nails = v.filter(q => q.c[0] > 0.8 && q.c[0] < 0.9 && q.c[1] > 0.65);
        expect(nails).toHaveLength(5 * NAIL);
        // The shell stands out of the glove over the knuckles; the plate's stitching is lighter than the glove.
        const shell = of([0.09, 0.09, 0.1]);
        expect(shell.length).toBeGreaterThan(500);
        expect(Math.max(...shell.map(q => q.at[1]))).toBeGreaterThan(0.015);
        expect(of([0.58, 0.58, 0.58]).length).toBe(28 * 6);
        // The strap, darker, round the wrist.
        expect(of([0.2, 0.2, 0.2]).length).toBeGreaterThan(100);
      });

      it('stay under 7200 vertices a hand, smooth fingers, nails and the glove’s gear', () => {
        // 6000 until the fingers took four rings round each joint to close on a grip (the user, 2026-11-09).
        expect(HAND).toBeLessThanOrEqual(7200);
      });

      it('make each finger and the thumb one closed surface: no cap or face between its phalanges', () => {
        for (const curl of curls) {
          for (const t of tubes(curl).slice(1)) {
            const uses = new Map<string, number>();
            for (let i = 0; i < t.length; i += 3) {
              for (let j = 0; j < 3; j++) {
                const k = edgeKey(t[i + j].at, t[i + ((j + 1) % 3)].at);
                uses.set(k, (uses.get(k) ?? 0) + 1);
              }
            }
            const open = [...uses.values()].filter(n => n != 2);
            // Every edge joins two triangles but those of the root ring, which the palm closes.
            expect(open).toHaveLength(FINGER_SIDES);
            expect(open.every(n => n == 1)).toBe(true);
          }
        }
      });

      it('are one piece: the weld meets the palm’s last ring and the fingers’ roots vertex for vertex, in a fist and open', () => {
        const key = (p: Vec3) => p.map(c => Math.round(c * 1e6)).join();
        for (const curl of curls) {
          const [palm, ...digits] = tubes(curl);
          const [weld] = welds(curl);
          const front = Math.max(...palm.map(v => v.at[2]));
          const ring = new Set(palm.filter(v => v.at[2] > front - 1e-9).map(v => key(v.at)));
          const roots = new Set(digits.slice(0, 4).flatMap(t => t.map(v => key(v.at))));
          const seen = new Set<string>();
          for (const p of weld) {
            seen.add(key(p));
          }
          // Every vertex of the palm's last ring is welded.
          for (const k of ring) {
            expect(seen.has(k)).toBe(true);
          }
          // The weld's vertices are the palm's, the fingers' or one of the six low points of the webs.
          const own = [...seen].filter(k => !ring.has(k) && !roots.has(k));
          expect(own).toHaveLength(6);
        }
      });

      it('swell the thumb out of the palm: its mound starts on the palm and ends on the thumb’s first ring', () => {
        const key = (p: Vec3) => p.map(c => Math.round(c * 1e6)).join();
        for (const curl of curls) {
          const thumb = tubes(curl)[5];
          const [, mound] = welds(curl);
          const ring = new Set(thumb.map(v => key(v.at)));
          // On the thumb: its first ring.
          expect(mound.filter(p => ring.has(key(p))).length).toBeGreaterThan(0);
          // Its foot on the palm, by the thumb's root and within the palm's width.
          const foot = mound.filter(p => !ring.has(key(p)));
          expect(foot.length).toBeGreaterThan(0);
          expect(Math.min(...foot.map(p => p[2]))).toBeGreaterThan(0);
          expect(Math.max(...foot.map(p => Math.abs(p[0])))).toBeLessThan(0.05);
        }
      });

      it('share their vertices smoothly: one normal where triangles meet, turning gently along a finger', () => {
        for (const curl of curls) {
          for (const t of tubes(curl)) {
            const at = new Map<string, Vec3>();
            for (const { at: a, n } of t) {
              expect(Math.hypot(...n)).toBeCloseTo(1);
              const k = a.map(c => Math.round(c * 1e6)).join();
              const was = at.get(k);
              if (was) {
                expect(away(was, n)).toBeLessThan(1e-5);
              }
              at.set(k, n);
            }
            // Along a finger's edge the normal never turns more than 80 degrees, the knuckle of a fist included;
            // the palm's side, a flat edge of the few-sided ring, 110.
            const most = t.length == PALM ? 110 : 80;
            for (let i = 0; i < t.length; i += 3) {
              for (let j = 0; j < 3; j++) {
                expect(dot(t[i + j].n, t[i + ((j + 1) % 3)].n)).toBeGreaterThan(
                  Math.cos((most * Math.PI) / 180),
                );
              }
            }
          }
        }
      });

      it('keep the length of the fingers from an open hand to a fist, the thumb too', () => {
        const length = (curl: number, i: number) => {
          // From its root at the palm's front, past the ring sunk in the palm.
          const rings = finger([0, 0, 0], ...phalanges(curl, i), 0.04, 0.01, [0, 0, 1]).slice(1);
          return rings.slice(1).reduce((n, [c], k) => n + away(c, rings[k][0]), 0);
        };
        for (let i = 0; i < 4; i++) {
          const open = length(0, i);
          expect(open).toBeCloseTo(0.086, 2);
          // The knuckle is a curve, which takes a little of the length.
          expect(length(1, i)).toBeLessThan(open);
          expect(length(1, i)).toBeGreaterThan(open * 0.82);
        }
      });

      it('start at the sleeve: the palm begins on the ring of the cuff, vertex for vertex', () => {
        const [rim, wrist] = [skinOf(2).v, solve(rest()).pos[J.HAND_R]];
        const cuff: Vec3[] = [];
        for (let i = 0; i < rim.length; i += 6) {
          // The right arm's ring at y = 0.925 (the sleeve ends there), in the hand's space.
          if (rim[i] > 0 && Math.abs(rim[i + 1] - CUFF[0]) < 1e-6) {
            cuff.push([-rim[i + 2], rim[i] - wrist[0], wrist[1] - rim[i + 1]]);
          }
        }
        expect(cuff).toHaveLength(CUFF_SIDES);
        const [palm] = tubes(0.5);
        const ring = palm
          .filter(v => Math.abs(v.at[2] - (wrist[1] - CUFF[0])) < 1e-6)
          .map(v => v.at);
        for (const c of cuff) {
          expect(Math.min(...ring.map(r => away(r, c)))).toBeLessThan(1e-4);
        }
      });
    });
  });

  describe('legs', () => {
    it('are the runners: the gait strides one foot forward while the other is back', () => {
      const body = createBody();
      const p = man({ vz: -6 });
      const gap: number[] = [];
      for (let i = 0; i < 120; i++) {
        p.z -= 6 * DT;
        body.update(p, DT);
        const s = pose(body, p);
        gap.push(s.pos[J.FOOT_L][2] - s.pos[J.FOOT_R][2]);
      }
      expect(Math.max(...gap)).toBeGreaterThan(0.3);
      expect(Math.min(...gap)).toBeLessThan(-0.3);
    });

    it('put the lead leg out in front, low, in a slide, the other foot by the hip', () => {
      const s = pose(watch(slide, 60), slide);
      const ahead = (hip: number, foot: number) => s.pos[hip][2] - s.pos[foot][2];
      const legs = [
        [J.THIGH_L, J.FOOT_L],
        [J.THIGH_R, J.FOOT_R],
      ];
      // Forward is -z: one foot is well ahead of its hip, and both are low.
      expect(Math.max(...legs.map(([h, f]) => ahead(h, f)))).toBeGreaterThan(0.4);
      for (const [, foot] of legs) {
        expect(s.pos[foot][1] - slide.y).toBeLessThan(0.5);
      }
    });
  });

  it('eases between poses with no snapping, and settles', () => {
    const ground = man();
    /** The largest move of a hand, in the view, or a foot, from the player, in a frame, over `per` frames of each state in turn. */
    const worst = (steps: PlayerState[], per: number) => {
      const body = watch(steps[0], 30);
      // The camera eases to the eye height of the mode, as in effects.ts.
      let h = eyeOf(steps[0])[1];
      const joints = (p: PlayerState) => {
        h += (eyeOf(p)[1] - h) * (1 - Math.exp(-14 * DT));
        const s = body.pose([p.x, h, p.z], p.yaw, -1)!;
        return [
          ...[J.HAND_L, J.HAND_R].flatMap(j =>
            local({ ...p, y: h - EYE, mode: MODE.GROUND }, s.pos[j], -1),
          ),
          ...[J.FOOT_L, J.FOOT_R].flatMap(j => s.pos[j].map((v, i) => v - [p.x, p.y, p.z][i])),
        ];
      };
      let [prev, most] = [joints(steps[0]), 0];
      for (const p of steps) {
        for (let i = 0; i < per; i++) {
          body.update(p, DT);
          const now = joints(p);
          most = Math.max(most, ...now.map((v, k) => Math.abs(v - prev[k])));
          prev = now;
        }
      }
      return most;
    };
    // The states a few metres apart in height would be a teleport, which is not what is measured.
    const [low, flat] = [
      { ...wall, y: 0 },
      { ...dash, y: 0 },
    ];
    for (const [a, b] of [
      [ground, slide],
      [slide, ground],
      [ground, flat],
      [flat, ground],
      [ground, low],
      [low, ground],
      [{ ...ground, z: hang.z }, hang],
    ]) {
      expect(worst([a, b], 90)).toBeLessThan(0.35);
    }
    const [settled, again] = [
      hands(hang, watch(hang, 200)).flat(),
      hands(hang, watch(hang, 800)).flat(),
    ];
    settled.forEach((v, i) => expect(again[i]).toBeCloseTo(v, 3));
  });
});

describe('the gun in the right hand', () => {
  const armed = (o: Partial<PlayerState> = {}) => man({ ...o, ammo: 30, mag: 15 });
  /** The cyan glow of the gun: bright green, over a violet that is not. */
  const glow = (v: Vert[]) => v.filter(q => q.c[1] > 1.5);
  const GRIP: Vec3 = [0.22, -0.25, 0.4];

  it('is not there without the gun, nor while down', () => {
    expect(glow(draw(watch(man(), 60), man()))).toHaveLength(0);
    const down = armed({ down: 60 });
    const body = watch(down, 60);
    expect(body.pose(eyeOf(down), 0, 0)).toBeUndefined();
    const out: number[] = [];
    body.draw(out, eyeOf(down), 0, 0);
    expect(out).toEqual([]);
  });

  it('comes to hand dark and lights up, and goes dark through a swap until the new battery is in', () => {
    const p = armed();
    const bright = (body: Body, q = p) => glow(draw(body, q)).length;
    const lit = bright(watch(p, 90));
    expect(bright(watch(p, 4))).toBeLessThan(lit * 0.2);
    // Still dark until the thumb presses its button (PRESS, 0.45 s).
    expect(bright(watch(p, 24))).toBeLessThan(lit * 0.2);
    const body = watch(p, 90);
    body.update({ ...p, reload: 20 }, DT);
    expect(bright(body, { ...p, reload: 20 })).toBeLessThan(lit * 0.2);
    body.update(p, DT);
    expect(bright(body)).toBeLessThan(lit * 0.2);
    for (let i = 0; i < 90; i++) {
      body.update(p, DT);
    }
    expect(bright(body)).toBe(lit);
  });

  it('is in the lower right of the view, in front of the camera, aimed at the crosshair', () => {
    const p = armed();
    const v = draw(watch(p, 90), p);
    const g = glow(v).map(q => local(p, q.at));
    expect(g.length).toBeGreaterThan(50);
    // The gun is in the lower right: nearly all of it on the screen, none left of the middle; the
    // band round the battery's foot, under the grip, is below the view.
    expect(g.filter(seen).length).toBeGreaterThan(g.length * 0.65);
    for (const l of g) {
      expect(l[0]).toBeGreaterThan(0);
    }
    const body = watch(p, 60);
    const [mx, my, mz] = body.muzzle();
    expect(mx).toBeGreaterThan(0.05);
    expect(mx).toBeLessThan(0.3);
    expect(my).toBeLessThan(0.1);
    expect(my).toBeGreaterThan(-0.35);
    expect(mz).toBeGreaterThan(0.6);
    // The muzzle is on the screen, between the grip and the crosshair.
    expect(seen([mx, my, mz])).toBe(true);
    expect(mx).toBeLessThan(GRIP[0] + 0.02);
  });

  it('is held on the grip: the hand is where the gun puts its grip, the back of the hand to its right', () => {
    const p = armed();
    const body = watch(p, 90);
    const s = pose(body, p);
    const wrist = local(p, s.pos[J.HAND_R]);
    const q = s.rot[J.HAND_R];
    // The middle of the grip is 8 cm along the fingers and 2 cm toward the palm from the wrist.
    const g = local(
      p,
      [0, 1, 2].map(
        i => s.pos[J.HAND_R][i] + turn(q, [0, -1, 0])[i] * 0.078 - turn(q, [1, 0, 0])[i] * 0.022,
      ) as Vec3,
    );
    expect(away(g, GRIP)).toBeLessThan(0.02);
    expect(away(wrist, g)).toBeCloseTo(Math.hypot(0.078, 0.022), 2);
    // The back of the hand looks right, and the fingers go forward and down: around a grip that rises.
    const back = turn(q, [1, 0, 0]);
    expect(back[0]).toBeGreaterThan(0.9);
  });

  it('sways with the run: the hand and the muzzle move with the stride, less than the free arm', () => {
    const ys: number[] = [];
    const bob = createBody();
    const q = armed({ vz: -9 });
    for (let i = 0; i < 80; i++) {
      q.z -= 9 * DT;
      bob.update(q, DT);
      if (i > 40) {
        ys.push(bob.muzzle()[1]);
      }
    }
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.005);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(0.1);
  });

  it('kicks back and up with a shot, and comes back', () => {
    const p = armed();
    const body = watch(p, 60);
    const rest = body.muzzle();
    body.update(p, DT, 1);
    const kicked = body.muzzle();
    expect(kicked[2]).toBeLessThan(rest[2] - 0.03);
    expect(kicked[1]).toBeGreaterThan(rest[1] - 0.02);
    body.update(p, DT, 0);
    expect(away(body.muzzle(), rest)).toBeLessThan(1e-3);
  });

  it('rises from below when taken', () => {
    const p = armed();
    const body = createBody();
    body.update(man(), DT);
    for (let i = 0; i < 3; i++) {
      body.update(man(), DT);
    }
    body.update(p, DT);
    const low = body.muzzle()[1];
    for (let i = 0; i < 60; i++) {
      body.update(p, DT);
    }
    expect(body.muzzle()[1]).toBeGreaterThan(low + 0.1);
  });

  it('leaves the right hand to the ledge on a hang, and the wall on a wall-run, and shows no gun there', () => {
    const h = armed({ ...hang });
    const hung = draw(watch(h, 120), h);
    expect(glow(hung).length).toBe(0);
    const w = armed({ ...wall });
    // A wall on the east is on the right: that hand is busy; one on the left leaves it free.
    expect(glow(draw(watch(w, 120), w)).length).toBe(0);
    const left = armed({ ...wall, wall: SIDE.WEST });
    expect(glow(draw(watch(left, 120), left)).length).toBeGreaterThan(50);
  });

  it('shows it again after the hang', () => {
    const h = armed({ ...hang });
    const body = watch(h, 120);
    const g = armed();
    for (let i = 0; i < 60; i++) {
      body.update(g, DT);
    }
    const out: number[] = [];
    body.draw(out, eyeOf(g), 0, 0, 0, TEAM);
    expect(out.length).toBeGreaterThan(0);
    expect(glow(draw(body, g)).length).toBeGreaterThan(50);
  });

  it('keeps the arm within its length and the vertices finite, whatever the pose', () => {
    for (const o of [
      {},
      { vz: -9 },
      { mode: MODE.SLIDE, vz: -8 },
      { mode: MODE.AIR, ground: false, vy: 4 },
      { stun: 20 },
      dash,
    ]) {
      const p = armed(o);
      const body = watch(p, 90);
      const s = pose(body, p, 0.5);
      for (const [a, b] of [
        [J.ARM_R, J.FOREARM_R],
        [J.FOREARM_R, J.HAND_R],
      ]) {
        expect(away(s.pos[a], s.pos[b])).toBeGreaterThan(0.2);
        expect(away(s.pos[a], s.pos[b])).toBeLessThan(0.31);
      }
      const out: number[] = [];
      body.draw(out, eyeOf(p), p.yaw, 0.5, 0, TEAM);
      expect(out.every(Number.isFinite)).toBe(true);
    }
  });

  it('leaves the left hand hanging out of view while it stands with the gun, and swings it into view to run', () => {
    const idle = armed();
    const [still] = hands(idle, watch(idle, 90));
    expect(seen(still)).toBe(false);
    expect(still[1]).toBeLessThan(-0.45);
    // Running, it swings up into the view again.
    const run = armed({ vz: -9 });
    const body = createBody();
    const left: boolean[] = [];
    for (let i = 0; i < 120; i++) {
      run.z -= 9 * DT;
      body.update(run, DT);
      left.push(seen(hands(run, body)[0]));
    }
    expect(left.slice(60)).toContain(true);
    expect(left.slice(60)).toContain(false);
  });

  it('keeps the gun in a narrow screen: the grip comes in with the aspect', () => {
    const p = armed();
    const side = (aspect: number) => {
      const body = createBody();
      for (let i = 0; i < 90; i++) {
        body.update(p, DT, 0, aspect);
      }
      return body.muzzle()[0];
    };
    expect(side(1.6)).toBeGreaterThan(0.1);
    expect(side(0.55)).toBeLessThan(side(1.6) - 0.1);
    // Inside the view of a phone held upright.
    expect(side(0.55)).toBeLessThan(0.45 * TAN * 0.55 * 2);
  });
});

describe('the ammo on the back of the gun', () => {
  const armed = (mag: number) => man({ ammo: AMMO_MAX, mag });
  /** The digits drawn last: their vertices as the body drew them. */
  const digits = (p: PlayerState, body = watch(p, 90)) => {
    const out: number[] = [];
    body.draw(out, eyeOf(p), 0, 0, 0, TEAM);
    return out.slice(out.length - readout(p.mag!).length);
  };

  it('shows the digits of the shots in the battery, from the predicted state of each frame', () => {
    const p = armed(12);
    const body = watch(p, 90);
    expect(digits(p, body).length).toBe(readout(12).length);
    const q = armed(11);
    body.update(q, DT);
    expect(digits(q, body).length).toBe(readout(11).length);
    expect(readout(11).length).not.toBe(readout(12).length);
  });

  it('are cyan, and red at four and under', () => {
    /** The last vertex drawn: a digit's. */
    const last = (n: number) => digits(armed(n)).slice(-STRIDE);
    expect(last(15)[7]).toBeGreaterThan(last(15)[6]);
    expect(last(3)[6]).toBeGreaterThan(last(3)[7]);
    expect(last(5)[7]).toBeGreaterThan(last(5)[6]);
    expect(last(4)[6]).toBeGreaterThan(last(4)[7]);
  });

  it('face the eye: the digits are on a display turned toward the camera, nearly head on, on the screen', () => {
    const p = armed(42);
    const out = digits(p);
    const eye = eyeOf(p);
    const glow: number[][] = [];
    for (let i = 0; i < out.length; i += STRIDE) {
      if (out[i + 8] == -2) {
        glow.push(out.slice(i, i + STRIDE));
      }
    }
    expect(glow.length).toBeGreaterThan(40);
    const on = glow.filter(g => seen(local(p, [g[0], g[1], g[2]])));
    expect(on.length).toBe(glow.length);
    for (const g of glow) {
      const to = [eye[0] - g[0], eye[1] - g[1], eye[2] - g[2]];
      const cos = (to[0] * g[3] + to[1] * g[4] + to[2] * g[5]) / Math.hypot(...to);
      // Within about 45 degrees of head on.
      expect(cos).toBeGreaterThan(0.7);
    }
    // Two digits side by side, wider than 2 cm in the camera's space.
    const xs = glow.map(g => local(p, [g[0], g[1], g[2]])[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.02);
  });

  it('are not drawn without the gun', () => {
    const out: number[] = [];
    const p = man();
    watch(p, 60).draw(out, eyeOf(p), 0, 0, 0, TEAM);
    expect(out.length / STRIDE).toBeLessThan(26000);
    expect(out.slice(-6).every(v => Number.isFinite(v))).toBe(true);
  });
});

describe('the gun points where the beam goes', () => {
  const armed = (o: Partial<PlayerState> = {}) => man({ ...o, ammo: 30, mag: 15 });
  /** The model vertex of the gun that is nearest to a model point, and where the body drew it. */
  const spot = (out: number[], model: Vec3): Vec3 => {
    const m = gun(1);
    // The model, then its button, then the counter, last.
    const knob: number[] = [];
    button(knob, 0, 0, 1, [1, 1, 1]);
    const first =
      out.length / STRIDE - m.length / STRIDE - (knob.length + readout(15).length) / STRIDE;
    let best = 0;
    let d = Infinity;
    for (let i = 0; i < m.length / STRIDE; i++) {
      const e = Math.hypot(
        m[i * STRIDE] - model[0],
        m[i * STRIDE + 1] - model[1],
        m[i * STRIDE + 2] - model[2],
      );
      if (e < d) {
        [best, d] = [i, e];
      }
    }
    const k = (first + best) * STRIDE;
    return [out[k], out[k + 1], out[k + 2]];
  };
  const angle = (a: Vec3, b: Vec3) =>
    (Math.acos(
      Math.min(
        1,
        (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b)),
      ),
    ) *
      180) /
    Math.PI;

  it.each([
    ['a near wall', [0.1, 0.05, 3.5]],
    ['a wall at 8 m', [-0.5, 0.4, 8]],
    ['far', [0, 0.2, 60]],
    ['far and to the side', [4, -1, 70]],
  ] as [string, Vec3][])(
    'along the long axis, from the back of the body to the emitter: %s',
    (_, target) => {
      const p = armed();
      const body = createBody();
      body.aim(target);
      for (let i = 0; i < 90; i++) {
        body.update(p, DT);
      }
      const eye = eyeOf(p);
      const out: number[] = [];
      body.draw(out, eye, 0, 0, 0, TEAM);
      const emitter = spot(out, [0, MUZZLE[1], MUZZLE[2]]);
      const rear = spot(out, REAR);
      const axis: Vec3 = [emitter[0] - rear[0], emitter[1] - rear[1], emitter[2] - rear[2]];
      // The camera space of the muzzle, from the world: eye is at the origin, yaw 0 looks along -z.
      const m = body.muzzle();
      const wm: Vec3 = [eye[0] + m[0], eye[1] + m[1], eye[2] - m[2]];
      expect(away(wm, emitter)).toBeLessThan(0.03);
      // The beam: from the emitter to the target (the target is in the camera's space: forward is -z).
      const end: Vec3 = [eye[0] + target[0], eye[1] + target[1], eye[2] - target[2]];
      const beam: Vec3 = [end[0] - wm[0], end[1] - wm[1], end[2] - wm[2]];
      expect(angle(axis, beam)).toBeLessThan(2);
    },
  );
});

describe('looking down with a weapon in hand', () => {
  const blade0 = () => man({ blade: true, wield: true });
  /** A point's place against the trunk: on the body's right and ahead of the line from the pelvis to the neck, at its height. */
  const against = (s: { pos: Vec3[] }, p: Vec3) => {
    const [a, b] = [s.pos[J.PELVIS], s.pos[J.NECK]];
    const t = (p[1] - a[1]) / (b[1] - a[1]);
    return [p[0] - a[0] - (b[0] - a[0]) * t, -(p[2] - a[2] - (b[2] - a[2]) * t)];
  };
  /** Each weapon and the hands on it, and whether it follows the look down: the gun in the right hand does, the katana in both does not. */
  const weapons: [string, Partial<PlayerState>, number[], boolean][] = [
    ['the gun', { ammo: 30 }, [J.HAND_R], true],
    ['the katana', { blade: true, wield: true }, [J.HAND_L, J.HAND_R], false],
  ];

  it.each(weapons)(
    'keeps the hands out of the chest and in sight with %s, down to the feet',
    (_, o, on, follows) => {
      const p = man(o);
      const body = watch(p, 90);
      for (const pitch of [-0.8, -1.1, -1.4, -1.55]) {
        const s = pose(body, p, pitch);
        for (const j of on) {
          const [x, ahead] = against(s, s.pos[j]);
          // Within the shoulders, a hand is ahead of the chest's front (12 cm) and a fist.
          if (Math.abs(x) < 0.25) {
            expect(ahead, `pitch ${pitch}, joint ${j}`).toBeGreaterThan(0.13);
          }
        }
        // The gun, following the look, is on the screen in the right fist.
        if (follows) {
          expect(seen(hands(p, body, pitch)[1]), `pitch ${pitch}`).toBe(true);
        }
      }
    },
  );

  it.each(weapons)('leaves %s where it was when looking ahead', (_, o) => {
    const p = man(o);
    const body = watch(p, 90);
    // Level and a little down, the hands sit as low and as close as they did.
    for (const pitch of [0, -0.3]) {
      const [, r] = hands(p, body, pitch);
      expect(r[2]).toBeLessThan(0.45);
    }
  });

  it('keeps the katana upright in the guard however far down the look goes, the hands at their height', () => {
    const p = blade0();
    const body = watch(p, 90);
    const at = (pitch: number) => {
      const s = pose(body, p, pitch);
      return { hand: s.pos[J.HAND_R], ends: ends(s.pos[J.HAND_R], s.rot[J.HAND_R]) };
    };
    const guard = at(-BOW);
    for (const pitch of [-0.6, -1, -1.4, -1.55]) {
      const {
        hand,
        ends: [root, point],
      } = at(pitch);
      // The blade stands up as in the guard: its point half a metre and more over its root, the
      // straight wrists (lock()) letting it lean a few centimetres with the shoulders.
      const rise = point[1] - root[1];
      expect(rise, `pitch ${pitch}`).toBeGreaterThan(0.45);
      expect(Math.abs(rise - (guard.ends[1][1] - guard.ends[0][1])), `pitch ${pitch}`).toBeLessThan(
        0.06,
      );
      // The hands no lower than in the guard, and not sunk toward the body.
      expect(hand[1], `pitch ${pitch}`).toBeGreaterThan(guard.hand[1] - 0.03);
    }
    // In sight down to well past the guard's tilt.
    expect(seen(hands(p, body, -1.2)[1])).toBe(true);
  });
});
