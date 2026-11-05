import { describe, expect, it } from 'vitest';
import { PLAYER_H } from '../shared/constants';
import { MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { MOVE, MOVES, createGait } from './gait';
import type { Floor, Gait } from './gait';
import type { Vec3 } from './mesh';
import { JOINT as J, JOINTS, solve, turn } from './rig';
import type { Quat } from './rig';

const DT = 1 / 60;
const D = 180 / Math.PI;

const state = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 0,
  y: 0,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  mode: MODE.GROUND,
  t: 0,
  wall: 0,
  edge: 0,
  jumps: 1,
  dashes: 1,
  dash: 0,
  stun: 0,
  coyote: 0,
  buffer: 0,
  held: 0,
  ev: 0,
  fall: 0,
  ...o,
});

type Frame = ReturnType<typeof solve> & { at: Vec3; phase: number; steps: number };

/** Runs a player for `secs`: `drive` moves it before each frame; returns the solved poses. */
const sim = (
  g: Gait,
  p: PlayerState,
  secs: number,
  drive: (p: PlayerState, t: number) => void,
  { dt = DT, floor }: { dt?: number; floor?: Floor } = {},
) => {
  const frames: Frame[] = [];
  for (let t = 0; t < secs - 1e-9; t += dt) {
    drive(p, t);
    g.update(p, dt, floor);
    frames.push({
      ...solve(g.pose()),
      at: [p.x, p.y, p.z],
      phase: g.phase,
      steps: g.steps,
    });
  }
  return frames;
};

/** Runs straight ahead (yaw 0 faces -z) at `v`. */
const jog = (v: number, secs: number, id = 1, opt: Parameters<typeof sim>[4] = {}) => {
  const dt = opt.dt ?? DT;
  const g = createGait();
  const p = state({ id, vz: -v });
  return { g, p, frames: sim(g, p, secs, q => (q.z += q.vz * dt), opt) };
};

/** The frames of the last whole stride: from a wrap of the phase to the next. */
const stride = (frames: Frame[]) => {
  const wraps = frames.flatMap((f, i) => (i && f.phase < frames[i - 1].phase ? [i] : []));
  return frames.slice(wraps[wraps.length - 2], wraps[wraps.length - 1]);
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const spread = (v: number[]) => Math.max(...v) - Math.min(...v);

/** Knee flexion in radians, signed: negative when the shin bends the wrong way (forward). */
const knee = (f: Frame, side: 'L' | 'R') => {
  const [a, b, c] = side == 'L' ? [J.THIGH_L, J.SHIN_L, J.FOOT_L] : [J.THIGH_R, J.SHIN_R, J.FOOT_R];
  const [t, s] = [sub(f.pos[b], f.pos[a]), sub(f.pos[c], f.pos[b])];
  // Facing -z, the body's right is +x: a flexing knee turns the shin about -x.
  return -Math.atan2(cross(t, s)[0], dot(t, s));
};
const elbow = (f: Frame, side: 'L' | 'R') => {
  const [a, b, c] =
    side == 'L' ? [J.ARM_L, J.FOREARM_L, J.HAND_L] : [J.ARM_R, J.FOREARM_R, J.HAND_R];
  const [u, w] = [sub(f.pos[b], f.pos[a]), sub(f.pos[c], f.pos[b])];
  return Math.acos(dot(u, w) / (Math.hypot(...u) * Math.hypot(...w)));
};

/** The sole's two ends in the world: the heel 7 cm behind the ankle, the ball 13 cm ahead, 6 cm down. */
const sole = (f: Frame, side: 'L' | 'R') => {
  const j = side == 'L' ? J.FOOT_L : J.FOOT_R;
  return [
    [0, -0.06, 0.07],
    [0, -0.06, -0.13],
  ].map(o => {
    const d = turn(f.rot[j], o as Vec3);
    return [f.pos[j][0] + d[0], f.pos[j][1] + d[1], f.pos[j][2] + d[2]] as Vec3;
  });
};

/** Runs of frames in which a point is on the ground: the point's xz at each, per run. */
const contacts = (
  frames: Frame[],
  side: 'L' | 'R',
  end: 0 | 1,
  floor = (_x: number, _z: number) => 0,
) => {
  const runs: Vec3[][] = [];
  let run: Vec3[] = [];
  for (const f of frames) {
    const q = sole(f, side)[end];
    if (q[1] - floor(q[0], q[2]) < 0.004) {
      run.push(q);
    } else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  return runs.filter(r => r.length > 3);
};

const yawOf = (q: Quat) => {
  const f = turn(q, [0, 0, -1]);
  return Math.atan2(-f[0], -f[2]);
};
/** The angle between two rotations. */
const apart = (a: Quat, b: Quat) =>
  2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
const lean = (f: Frame) => {
  const d = sub(f.pos[J.NECK], f.pos[J.PELVIS]);
  return Math.atan2(-d[2], d[1]);
};
/** The trunk's lean to the right of a runner facing `yaw`. */
const roll = (f: Frame, yaw = 0) => {
  const d = sub(f.pos[J.NECK], f.pos[J.PELVIS]);
  return Math.atan2(d[0] * Math.cos(yaw) - d[2] * Math.sin(yaw), d[1]);
};

describe('gait: the stride', () => {
  it('comes back to where it started after a stride', () => {
    for (const v of [1.4, 5, 9]) {
      const f = stride(jog(v, 5, 1, { dt: 1 / 1000 }).frames);
      const [a, b] = [f[0], f[f.length - 1]];
      const d = Math.abs(b.phase - a.phase);
      expect(Math.min(d, 1 - d)).toBeLessThan(0.01);
      const local = (x: Frame, j: number) => sub(x.pos[j], x.at);
      for (let j = 0; j < JOINTS; j++) {
        const d = sub(local(a, j), local(b, j));
        expect(Math.hypot(...d)).toBeLessThan(0.015);
        expect(apart(a.rot[j], b.rot[j]), `v ${v} joint ${j}`).toBeLessThan(0.05);
      }
    }
  });

  it('plants the stance foot: a few millimetres of drift at a walk, a run and a sprint', () => {
    for (const v of [1.4, 5, 9]) {
      const frames = jog(v, 5).frames.slice(120);
      for (const side of ['L', 'R'] as const) {
        for (const end of [0, 1] as const) {
          // The heel is on the floor from the strike to the flat foot, the ball from there to the toe-off.
          const runs = contacts(frames, side, end);
          // A sprinter lands on the ball of the foot: no heel strike.
          expect(runs.length).toBeGreaterThan(v > 8 && end == 0 ? -1 : 1);
          for (const r of runs) {
            expect(spread(r.map(q => q[0]))).toBeLessThan(0.005);
            expect(spread(r.map(q => q[2]))).toBeLessThan(0.005);
          }
        }
      }
    }
  });

  it('keeps the sole on the floor and never through it', () => {
    for (const v of [1.4, 5, 9]) {
      const frames = jog(v, 4).frames.slice(60);
      const lowest = frames.map(f =>
        Math.min(...(['L', 'R'] as const).flatMap(s => sole(f, s).map(q => q[1]))),
      );
      expect(Math.min(...lowest)).toBeGreaterThan(-0.008);
      // One foot is down, or both are flying (a run), and then none is far above it.
      expect(Math.max(...lowest)).toBeLessThan(v < 3 ? 0.01 : 0.3);
    }
  });

  it('plants along a heading that is not the look: strafing and turned', () => {
    const g = createGait();
    const p = state({ vx: 4.2, vz: -4.2, yaw: 0.4 });
    const frames = sim(g, p, 4, q => {
      q.x += q.vx * DT;
      q.z += q.vz * DT;
    }).slice(90);
    for (const side of ['L', 'R'] as const) {
      for (const end of [0, 1] as const) {
        for (const r of contacts(frames, side, end)) {
          expect(spread(r.map(q => q[0]))).toBeLessThan(0.006);
          expect(spread(r.map(q => q[2]))).toBeLessThan(0.006);
        }
      }
    }
  });

  it('bends the knee most in the swing, loads it in the stance, and never hyperextends it', () => {
    for (const v of [1.4, 5, 9]) {
      const frames = stride(jog(v, 5).frames);
      const flex = frames.map(f => knee(f, 'L'));
      const down = frames.map(f => sole(f, 'L').some(q => q[1] < 0.004));
      expect(Math.min(...flex)).toBeGreaterThan(-0.02);
      const peak = (on: boolean) => Math.max(...flex.filter((_, i) => down[i] == on)) * D;
      expect(peak(false)).toBeGreaterThan(peak(true) + 25);
      // A real swing folds the knee past a right angle at a run; the stance bends it to 20 to 50 degrees.
      if (v >= 5) {
        expect(peak(false)).toBeGreaterThan(95);
        expect(peak(true)).toBeGreaterThan(25);
        expect(peak(true)).toBeLessThan(60);
      }
    }
  });

  it('holds hip and ankle angles in the ranges of real strides', () => {
    for (const [v, hip, ankle] of [
      [1.4, [25, 45], [-35, -15]],
      [5, [50, 75], [-50, -25]],
      [9, [55, 85], [-60, -30]],
    ] as const) {
      const frames = stride(jog(v, 5).frames);
      // Hip flexion: the thigh's angle forward of the vertical.
      const flex = frames.map(f => {
        const t = sub(f.pos[J.SHIN_L], f.pos[J.THIGH_L]);
        return Math.atan2(-t[2], -t[1]) * D;
      });
      const toes = frames.map(f => Math.asin(turn(f.rot[J.FOOT_L], [0, 0, -1])[1]) * D);
      expect(Math.max(...flex)).toBeGreaterThan(hip[0]);
      expect(Math.max(...flex)).toBeLessThan(hip[1]);
      expect(Math.min(...flex)).toBeGreaterThan(-45);
      expect(Math.min(...toes)).toBeGreaterThan(ankle[0]);
      expect(Math.min(...toes)).toBeLessThan(ankle[1]);
    }
  });

  it('folds the elbows deeper the faster it goes', () => {
    const bend = [1.4, 5, 9].map(v => mean(stride(jog(v, 5).frames).map(f => elbow(f, 'L') * D)));
    expect(bend[0]).toBeLessThan(40);
    expect(bend[1]).toBeGreaterThan(bend[0] + 30);
    expect(bend[2]).toBeGreaterThan(bend[1] + 8);
    expect(bend[2]).toBeGreaterThan(80);
  });

  it('swings the arms against the legs', () => {
    const frames = stride(jog(5, 5).frames);
    // The left hand is forward when the right foot is.
    const hand = frames.map(f => -f.pos[J.HAND_L][2] + f.pos[J.PELVIS][2]);
    const foot = frames.map(f => -f.pos[J.FOOT_R][2] + f.pos[J.PELVIS][2]);
    const [mh, mf] = [mean(hand), mean(foot)];
    const cov = mean(hand.map((h, i) => (h - mh) * (foot[i] - mf)));
    expect(cov).toBeGreaterThan(0.005);
    expect(spread(hand)).toBeGreaterThan(0.4);
  });

  it('takes more steps per second and longer ones as it speeds up', () => {
    const rate: number[] = [];
    const length: number[] = [];
    for (const v of [1.4, 3, 5, 7, 9]) {
      const { frames } = jog(v, 8);
      const per =
        (frames[frames.length - 1].steps - frames[179].steps) / ((frames.length - 180) * DT);
      rate.push(per);
      length.push(v / per);
    }
    rate.forEach((r, i) => i && expect(r).toBeGreaterThan(rate[i - 1]));
    length.forEach((l, i) => i && expect(l).toBeGreaterThan(length[i - 1]));
    // About 110 steps a minute walking, 170 running; steps of 0.75 m and about 2 m.
    expect(rate[0] * 60).toBeGreaterThan(100);
    expect(rate[0] * 60).toBeLessThan(125);
    expect(rate[2] * 60).toBeGreaterThan(155);
    expect(rate[2] * 60).toBeLessThan(190);
    expect(length[0]).toBeGreaterThan(0.6);
    expect(length[0]).toBeLessThan(0.85);
    expect(length[2]).toBeGreaterThan(1.6);
    expect(length[2]).toBeLessThan(2.3);
  });

  it('has a flight phase at a run and none at a walk', () => {
    const airborne = (v: number) => {
      const frames = stride(jog(v, 5).frames);
      const none = frames.filter(f =>
        [sole(f, 'L'), sole(f, 'R')].every(s => s.every(q => q[1] > 0.01)),
      );
      return none.length / frames.length;
    };
    expect(airborne(1.4)).toBe(0);
    expect(airborne(5)).toBeGreaterThan(0.1);
    expect(airborne(9)).toBeGreaterThan(0.15);
  });

  it('keeps the pelvis as high as the legs allow: a bounce of a few centimetres, higher when sprinting than walking', () => {
    const range = (v: number) => spread(stride(jog(v, 5).frames).map(f => f.pos[J.PELVIS][1]));
    expect(range(1.4)).toBeGreaterThan(0.02);
    expect(range(1.4)).toBeLessThan(0.07);
    expect(range(5)).toBeGreaterThan(0.04);
    expect(range(5)).toBeLessThan(0.11);
    // Every frame stands the runner at a plausible height.
    for (const f of jog(5, 4).frames.slice(60)) {
      expect(f.pos[J.PELVIS][1]).toBeGreaterThan(0.8);
      expect(f.pos[J.PELVIS][1]).toBeLessThan(1);
    }
  });

  it('drops the pelvis on the swing side and turns it against the shoulders', () => {
    const frames = stride(jog(1.4, 5).frames);
    const [swingL, swingR] = [[], []] as number[][];
    for (const f of frames) {
      const [onL, onR] = (['L', 'R'] as const).map(s => sole(f, s).some(q => q[1] < 0.004));
      const drop = f.pos[J.THIGH_L][1] - f.pos[J.THIGH_R][1];
      if (onR && !onL) {
        swingL.push(drop);
      } else if (onL && !onR) {
        swingR.push(drop);
      }
    }
    expect(mean(swingL)).toBeLessThan(-0.004);
    expect(mean(swingR)).toBeGreaterThan(0.004);
    for (const v of [1.4, 5, 9]) {
      const fs = stride(jog(v, 5).frames);
      const pelvis = fs.map(f =>
        yawOf(solve({ at: [0, 0, 0], yaw: 0, hips: [0, 0, 0], rot: f.rot }).rot[J.PELVIS]),
      );
      const chest = fs.map(f => yawOf(f.rot[J.CHEST]));
      const [mp, mc] = [mean(pelvis), mean(chest)];
      const cov = mean(pelvis.map((p, i) => (p - mp) * (chest[i] - mc)));
      expect(cov).toBeLessThan(0);
      expect(spread(pelvis) * D).toBeGreaterThan(5);
    }
  });

  it('keeps the head steadier than the chest', () => {
    const frames = stride(jog(7, 5).frames);
    const [c0, h0] = [frames[0].rot[J.CHEST], frames[0].rot[J.HEAD]];
    const chest = Math.max(...frames.map(f => apart(f.rot[J.CHEST], c0)));
    const head = Math.max(...frames.map(f => apart(f.rot[J.HEAD], h0)));
    expect(chest).toBeGreaterThan(0.08);
    expect(head).toBeLessThan(chest * 0.6);
  });

  it('keeps the head on the look: yaw and pitch of the player', () => {
    const g = createGait();
    const p = state({ vz: -6, yaw: 0.5, pitch: 0.4 });
    const frames = sim(g, p, 2, q => {
      q.x -= Math.sin(q.yaw) * 6 * DT;
      q.z -= Math.cos(q.yaw) * 6 * DT;
      q.vx = -Math.sin(q.yaw) * 6;
      q.vz = -Math.cos(q.yaw) * 6;
    });
    const f = frames[frames.length - 1];
    const ahead = turn(f.rot[J.HEAD], [0, 0, -1]);
    expect(Math.atan2(-ahead[0], -ahead[2])).toBeCloseTo(0.5, 1);
    expect(Math.asin(ahead[1])).toBeGreaterThan(0.25);
  });
});

describe('gait: the layers', () => {
  it('leans forward with the speed, further while it accelerates, back while it brakes', () => {
    const at = (v0: number, v1: number) => {
      const g = createGait();
      const p = state({ vz: -v0 });
      const frames = sim(g, p, 3, (q, t) => {
        q.vz = -(t < 1 ? v0 : v0 + Math.sign(v1 - v0) * Math.min(Math.abs(v1 - v0), 20 * (t - 1)));
        q.z += q.vz * DT;
      });
      // Averaged over the stride that holds the instant: the 0.25 s after the first second.
      return mean(frames.slice(66, 78).map(lean));
    };
    const steady = at(6, 6);
    expect(steady).toBeGreaterThan(0.02);
    expect(at(6, 6) - at(2, 2)).toBeGreaterThan(0.05);
    expect(at(6, 12)).toBeGreaterThan(steady + 0.05);
    expect(at(6, 1)).toBeLessThan(steady - 0.05);
  });

  it('banks into a turn, the way it turns, and not on a straight line', () => {
    const turning = (rate: number) => {
      const g = createGait();
      const p = state();
      const frames = sim(g, p, 2.5, (q, t) => {
        q.yaw = t > 1 ? rate * (t - 1) : 0;
        q.vx = -Math.sin(q.yaw) * 6;
        q.vz = -Math.cos(q.yaw) * 6;
        q.x += q.vx * DT;
        q.z += q.vz * DT;
      });
      // The frame is the runner's: its right is +x, so a lean to the left is negative.
      return mean(frames.slice(-30).map(f => roll(f, p.yaw)));
    };
    const [left, straight, right] = [turning(2), turning(0), turning(-2)];
    expect(Math.abs(straight)).toBeLessThan(0.03);
    expect(left).toBeLessThan(straight - 0.05);
    expect(right).toBeGreaterThan(straight + 0.05);
    expect(Math.abs(turning(4))).toBeLessThan(0.45);
  });

  it('gives every player a stride of their own: two ids are out of phase', () => {
    const [a, b, c] = [1, 2, 3].map(id => jog(6, 3, id));
    const apartBy = (x: number, y: number) => Math.abs(((x - y + 1.5) % 1) - 0.5);
    expect(apartBy(a.g.phase, b.g.phase)).toBeGreaterThan(0.05);
    expect(apartBy(a.g.phase, c.g.phase)).toBeGreaterThan(0.05);
    // And the limbs show it: the left foot is at another place of its swing.
    const [fa, fb] = [a, b].map(r =>
      sub(r.frames[r.frames.length - 1].pos[J.FOOT_L], r.frames[r.frames.length - 1].at),
    );
    expect(Math.hypot(...sub(fa, fb))).toBeGreaterThan(0.05);
    // The same player twice is the same stride.
    const again = jog(6, 3, 1);
    expect(again.g.phase).toBe(a.g.phase);
  });

  it('stands with a slight sway and a breath, and does not step', () => {
    const g = createGait();
    const p = state();
    const frames = sim(g, p, 12, () => undefined);
    expect(g.steps).toBe(0);
    const chest = frames.map(f => lean(f));
    expect(spread(chest)).toBeGreaterThan(0.005);
    expect(spread(chest)).toBeLessThan(0.08);
    const hips = frames.map(f => f.pos[J.PELVIS][0]);
    expect(spread(hips)).toBeGreaterThan(0.005);
    expect(spread(hips)).toBeLessThan(0.04);
    // The feet stay where they are.
    const toe = frames.map(f => f.pos[J.TOE_L]);
    expect(spread(toe.map(q => q[2]))).toBeLessThan(0.003);
    expect(frames[0].pos[J.PELVIS][1]).toBeGreaterThan(0.9);
    expect(frames[0].pos[J.HEAD][1]).toBeGreaterThan(1.5);
    expect(frames[0].pos[J.HEAD][1]).toBeLessThan(PLAYER_H);
  });

  it('keeps the stride phase continuous while the speed changes, with no joint jump', () => {
    const g = createGait();
    const p = state();
    const frames = sim(g, p, 6, (q, t) => {
      q.vz = -(2 + 7 * (0.5 - 0.5 * Math.cos(t * 1.5)));
      q.z += q.vz * DT;
    });
    let worst = 0;
    frames.forEach((f, i) => {
      if (i) {
        const dph = (f.phase - frames[i - 1].phase + 1) % 1;
        expect(dph).toBeLessThan(2.2 * DT);
        for (let j = 0; j < JOINTS; j++) {
          const d = Math.hypot(
            ...sub(sub(f.pos[j], f.at), sub(frames[i - 1].pos[j], frames[i - 1].at)),
          );
          worst = Math.max(worst, d);
        }
      }
    });
    // A sprinting foot moves 20 cm in a frame at the most; a pop would be more.
    expect(worst).toBeLessThan(0.3);
  });

  it('follows the floor: a slope, with the feet on it', () => {
    const floor: Floor = (_x, z) => -0.15 * z;
    const g = createGait();
    const p = state({ vz: -4.5 });
    const frames = sim(
      g,
      p,
      5,
      q => {
        q.z += q.vz * DT;
        q.y = floor(q.x, q.z);
      },
      { floor },
    ).slice(120);
    const runs = [0, 1].flatMap(e => contacts(frames, 'L', e as 0 | 1, floor));
    expect(runs.length).toBeGreaterThan(2);
    for (const r of runs) {
      expect(spread(r.map(q => q[0]))).toBeLessThan(0.005);
      expect(spread(r.map(q => q[2]))).toBeLessThan(0.005);
    }
    for (const f of frames) {
      const low = Math.min(
        ...sole(f, 'L')
          .concat(sole(f, 'R'))
          .map(q => q[1] - floor(q[0], q[2])),
      );
      // The floor is read under the ankle: a 15% slope puts the heel and the ball 2 cm off it.
      expect(low).toBeGreaterThan(-0.025);
    }
  });

  it('lowers the pelvis in a crouch, and a landing dips it and lets it come back', () => {
    const stand = jog(0.01, 2).frames.pop()!;
    const g = createGait();
    const p = state({ mode: MODE.CROUCH, vz: -2.5 });
    const low = sim(g, p, 3, q => (q.z += q.vz * DT)).pop()!;
    expect(low.pos[J.PELVIS][1]).toBeLessThan(stand.pos[J.PELVIS][1] - 0.2);
    expect(Math.min(knee(low, 'L'), knee(low, 'R')) * D).toBeGreaterThan(20);
    // Lands from a fall at 12 m/s.
    const h = createGait();
    const q = state({ mode: MODE.AIR, vy: -12, y: 3 });
    const fall = sim(h, q, 3, (s, t) => {
      if (t < 0.5) {
        s.y = 3 - 12 * t;
      } else {
        Object.assign(s, { mode: MODE.GROUND, y: 0, vy: 0, ev: 8 });
      }
    });
    const heights = fall.slice(31).map(f => f.pos[J.PELVIS][1]);
    expect(Math.min(...heights)).toBeLessThan(stand.pos[J.PELVIS][1] - 0.15);
    expect(heights[heights.length - 1]).toBeGreaterThan(stand.pos[J.PELVIS][1] - 0.04);
  });
});

describe('gait: the other moves', () => {
  /** From a stand to a move, then back: the poses relative to the runner. */
  const switchTo = (to: Partial<PlayerState>, hold = 1) => {
    const g = createGait();
    const p = state({ id: 4 });
    const drive = (q: PlayerState, t: number) =>
      Object.assign(q, t < 1 || t >= 1 + hold ? state({ id: 4 }) : to);
    return sim(g, p, 2 + hold, drive);
  };
  const local = (f: Frame, j: number) => sub(f.pos[j], f.at);
  const step = (a: Frame, b: Frame) =>
    Math.max(
      ...Array.from({ length: JOINTS }, (_, j) => Math.hypot(...sub(local(a, j), local(b, j)))),
    );

  const MOVES_TO: [string, Partial<PlayerState>][] = [
    ['air', { mode: MODE.AIR, vy: -3 }],
    ['rise', { mode: MODE.AIR, vy: 6 }],
    ['dash', { mode: MODE.AIR, dash: 59 }],
    ['wall run', { mode: MODE.WALLRUN, wall: 1 }],
    ['hang', { mode: MODE.HANG, wall: 4, edge: 2 }],
    ['climb', { mode: MODE.CLIMB, wall: 4, edge: 1.5 }],
    ['slide', { mode: MODE.SLIDE }],
    ['stumble', { stun: 40 }],
  ];

  it.each(MOVES_TO)('eases into %s and back with no pop', (_name, to) => {
    const frames = switchTo(to);
    const steps = frames.map((f, i) => (i ? step(f, frames[i - 1]) : 0));
    // 60 frames of standing, then the move: the first frame hardly moves, none jumps.
    expect(steps[60]).toBeLessThan(0.04);
    expect(Math.max(...steps.slice(60))).toBeLessThan(0.16);
    // The changes of speed between frames are small too: no frame is a kink.
    const kink = steps.map((s, i) => (i > 1 ? Math.abs(s - steps[i - 1]) : 0));
    expect(Math.max(...kink)).toBeLessThan(0.08);
    // It reaches the pose and leaves it.
    expect(step(frames[60], frames[119])).toBeGreaterThan(0.3);
    expect(step(frames[0], frames[frames.length - 1])).toBeLessThan(0.03);
  });

  it('blends a run into the air and a landing into a run without a jump of the joints', () => {
    const g = createGait();
    const p = state({ vz: -6 });
    const frames = sim(g, p, 3, (q, t) => {
      Object.assign(
        q,
        t >= 1 && t < 1.6 ? { mode: MODE.AIR, vy: 3 - 10 * (t - 1) } : { mode: MODE.GROUND, vy: 0 },
      );
      q.y = t >= 1 && t < 1.6 ? 3 * (t - 1) - 5 * (t - 1) ** 2 : 0;
      q.z -= 6 * DT;
    });
    const steps = frames.map((f, i) => (i ? step(f, frames[i - 1]) : 0));
    const run = Math.max(...steps.slice(30, 55));
    // A sprinting leg moves up to 20 cm a frame; the switches add nothing beyond a few centimetres.
    expect(Math.max(...steps.slice(55))).toBeLessThan(run + 0.07);
    const kink = steps.map((s, i) => (i > 1 ? Math.abs(s - steps[i - 1]) : 0));
    expect(Math.max(...kink.slice(55))).toBeLessThan(Math.max(...kink.slice(30, 55)) + 0.07);
  });

  it('poses a wall on the left as the mirror of a wall on the right', () => {
    const wall = (side: number) => {
      const g = createGait();
      const p = state({ id: 9, vz: -6, mode: MODE.WALLRUN, wall: side });
      return sim(g, p, 3, q => (q.z -= 6 * DT)).pop()!;
    };
    const [r, l] = [wall(1), wall(2)];
    const pairs = [
      [J.HAND_R, J.HAND_L],
      [J.FOOT_R, J.FOOT_L],
      [J.SHIN_R, J.SHIN_L],
      [J.FOREARM_L, J.FOREARM_R],
    ];
    for (const [a, b] of pairs) {
      const [pa, pb] = [local(r, a), local(l, b)];
      expect(pa[0]).toBeCloseTo(-pb[0], 1);
      expect(pa[1]).toBeCloseTo(pb[1], 1);
      expect(pa[2]).toBeCloseTo(pb[2], 1);
    }
    expect(MOVES[MOVE.WALL_L][2]).toBeCloseTo(-MOVES[MOVE.WALL_R][2], 9);
  });

  it('leans away from the wall it runs along', () => {
    const wall = (side: number) => {
      const g = createGait();
      const p = state({ vz: -6, mode: MODE.WALLRUN, wall: side });
      return roll(sim(g, p, 3, q => (q.z -= 6 * DT)).pop()!);
    };
    expect(wall(1)).toBeLessThan(-0.1);
    expect(wall(2)).toBeGreaterThan(0.1);
  });

  it('faces the wall it hangs from, and the way it slides', () => {
    const g = createGait();
    const north = sim(g, state({ mode: MODE.HANG, wall: 4, edge: 2 }), 2, () => undefined).pop()!;
    expect(yawOf(north.rot[J.PELVIS])).toBeCloseTo(0, 1);
    const h = createGait();
    // A wall to the east (+x): the runner turns to face it, a quarter turn to the right.
    const east = sim(h, state({ mode: MODE.HANG, wall: 1, edge: 2 }), 2, () => undefined).pop()!;
    expect(yawOf(east.rot[J.PELVIS])).toBeCloseTo(-Math.PI / 2, 1);
    // Sliding forward while looking to the side: the body follows the velocity.
    const s = createGait();
    const side = sim(
      s,
      state({ mode: MODE.SLIDE, vx: -8, yaw: 0 }),
      2,
      q => (q.x -= 8 * DT),
    ).pop()!;
    expect(yawOf(side.rot[J.PELVIS])).toBeCloseTo(Math.PI / 2, 1);
  });

  it('somersaults on a double jump, and the head stays level to the look', () => {
    const g = createGait();
    const p = state({ mode: MODE.AIR, vy: 3, y: 2, jumps: 1 });
    const frames = sim(g, p, 1.5, (q, t) => {
      q.y = 2 + 3 * t - 5 * t * t;
      q.vy = 3 - 10 * t;
      if (t >= 0.3 && q.jumps) {
        q.jumps = 0;
        q.vy += 6;
      }
    });
    const turned = frames.map(f =>
      Math.abs(
        Math.atan2(turn(f.rot[J.PELVIS], [0, 1, 0])[2], turn(f.rot[J.PELVIS], [0, 1, 0])[1]),
      ),
    );
    // Most of a turn at the mid-flip, none before it and none after it.
    expect(Math.max(...turned)).toBeGreaterThan(2);
    expect(turned[10]).toBeLessThan(0.5);
    expect(turned[frames.length - 1]).toBeLessThan(0.5);
  });

  it('starts over after a respawn: no easing across the jump', () => {
    const g = createGait();
    const p = state({ vz: -6 });
    sim(g, p, 2, q => (q.z -= 6 * DT));
    expect(g.steps).toBeGreaterThan(4);
    Object.assign(p, { x: 80, z: -50 });
    g.update(p, DT);
    expect(g.steps).toBe(0);
    const f = solve(g.pose());
    expect(Math.min(...[J.FOOT_L, J.FOOT_R].map(j => f.pos[j][1]))).toBeLessThan(0.15);
    expect(f.pos[J.PELVIS][1]).toBeGreaterThan(0.8);
  });
});

describe('gait: the contract', () => {
  it('hands out one pose, rewritten by each frame, with unit rotations', () => {
    const g = createGait();
    const p = state({ vz: -6 });
    g.update(p, DT);
    const a = g.pose();
    expect(g.pose()).toBe(a);
    expect(a.rot).toHaveLength(JOINTS);
    p.z -= 1;
    g.update(p, DT);
    expect(g.pose()).toBe(a);
    expect(a.at[2]).toBeCloseTo(p.z, 9);
    for (const q of a.rot) {
      expect(Math.hypot(...q)).toBeCloseTo(1, 5);
    }
  });

  it('never produces a NaN, whatever the states it is fed', () => {
    const g = createGait();
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const p = state({ id: 5 });
    for (let i = 0; i < 4000; i++) {
      if (i % 40 == 0) {
        const mode = Math.floor(rnd() * 7);
        Object.assign(p, {
          mode,
          vx: (rnd() - 0.5) * 30,
          vz: (rnd() - 0.5) * 30,
          vy: (rnd() - 0.5) * 20,
          yaw: rnd() * 7,
          pitch: (rnd() - 0.5) * 3,
          wall: Math.floor(rnd() * 5),
          edge: rnd() * 3,
          dash: Math.floor(rnd() * 60),
          stun: rnd() < 0.2 ? 30 : 0,
          jumps: rnd() < 0.5 ? 0 : 1,
        });
      }
      p.x += p.vx / 60;
      p.z += p.vz / 60;
      p.y = Math.max(0, p.y + p.vy / 60);
      g.update(p, rnd() < 0.1 ? 0 : 1 / (30 + rnd() * 110));
      const f = solve(g.pose());
      for (let j = 0; j < JOINTS; j++) {
        expect(f.rot[j].every(Number.isFinite)).toBe(true);
        expect(Math.hypot(...sub(f.pos[j], [p.x, p.y, p.z]))).toBeLessThan(3);
      }
    }
  });

  it('is cheap: well under 50 microseconds a runner and a frame', () => {
    const gaits = Array.from({ length: 16 }, () => createGait());
    const ps = gaits.map((_, i) => state({ id: i + 1, vz: -6 }));
    const frame = () =>
      gaits.forEach((g, i) => {
        ps[i].z -= 0.1;
        g.update(ps[i], DT);
        g.pose();
      });
    for (let i = 0; i < 300; i++) {
      frame();
    }
    const t0 = performance.now();
    for (let i = 0; i < 600; i++) {
      frame();
    }
    const per = ((performance.now() - t0) * 1000) / (600 * gaits.length);
    expect(per).toBeLessThan(50);
  });
});
