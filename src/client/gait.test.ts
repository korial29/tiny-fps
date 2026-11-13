import { describe, expect, it } from 'vitest';
import {
  CLIMB_FWD_SPEED,
  CLIMB_RISE,
  PLAYER_H,
  STUMBLE_DRAG,
  STUMBLE_KNOCK,
  STUMBLE_TICKS,
  PUNCH,
  DOWN_TICKS,
} from '../shared/constants';
import { felled } from '../shared/gun';
import { FALL, MODE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { MOVE, MOVES, createGait, thrown } from './gait';
import type { Floor, Gait, Seat } from './gait';
import { basis } from './mesh';
import { grips } from './rover';
import type { Vec3 } from './mesh';
import { JOINT as J, JOINTS, PARENT, REST, solve, turn } from './rig';
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
  hp: 5,
  ammo: -1,
  cool: 0,
  down: 0,
  shots: 0,
  hits: 0,
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

  it('hangs the arms along the body at rest with a gun in hand, and swings them like a pendulum in a stride', () => {
    const armed = createGait();
    const [still] = sim(armed, state({ ammo: 0 }), 3, () => undefined).slice(-1);
    for (const [hand, shoulder] of [
      [J.HAND_L, J.ARM_L],
      [J.HAND_R, J.ARM_R],
    ]) {
      const d = sub(still.pos[hand], still.pos[shoulder]);
      // Straight down from the shoulder, a little bent and out: nowhere near the front of the body.
      expect(d[1]).toBeLessThan(-0.45);
      expect(Math.abs(d[0])).toBeLessThan(0.15);
      expect(Math.abs(d[2])).toBeLessThan(0.15);
    }
    // Running, the same hands go up and forward and back and down, by a good half metre.
    const frames = stride(jog(6, 5).frames);
    const [fore, up] = [J.HAND_R].flatMap(j => [
      frames.map(f => -(f.pos[j][2] - f.pos[J.ARM_R][2])),
      frames.map(f => f.pos[j][1] - f.pos[J.ARM_R][1]),
    ]);
    expect(spread(fore)).toBeGreaterThan(0.4);
    expect(spread(up)).toBeGreaterThan(0.2);
    // It pumps higher the faster it goes.
    const rise = (v: number) => spread(stride(jog(v, 5).frames).map(f => f.pos[J.HAND_L][1]));
    expect(rise(9)).toBeGreaterThan(rise(3));
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
    // Lower than it was: bare-handed, he stands in a fighter's guard (below).
    expect(frames[0].pos[J.PELVIS][1]).toBeGreaterThan(0.84);
    expect(frames[0].pos[J.HEAD][1]).toBeGreaterThan(1.45);
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
    expect(low.pos[J.PELVIS][1]).toBeLessThan(stand.pos[J.PELVIS][1] - 0.15);
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
    // The feet come in from the guard's spread: a hang draws them up 16 cm in a frame at most.
    expect(Math.max(...steps.slice(60))).toBeLessThan(0.17);
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

  it('tucks on a double jump without a somersault (the user, 2026-11-08): the body stays upright', () => {
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
    // Upright all through: no turn of the pelvis past what a jump's lean gives.
    expect(Math.max(...turned)).toBeLessThan(0.5);
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

describe('gait: the contacts', () => {
  /** The unit vector toward a wall on each SIDE (EAST +x, WEST -x, SOUTH +z, NORTH -z). */
  const TO = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  const at = { x: 5, y: 1, z: -3 };
  /** A runner that holds the state `o` for `n` frames, `drive` moving it before each; its last frame. */
  const hold = (o: Partial<PlayerState>, n = 120, drive?: (p: PlayerState) => void) => {
    const g = createGait();
    const p = state({ id: 3, ...at, ...o });
    const frame = (): Frame => ({
      ...solve(g.pose()),
      at: [p.x, p.y, p.z],
      phase: g.phase,
      steps: g.steps,
    });
    g.update(p, DT);
    let f = frame();
    for (let i = 0; i < n; i++) {
      drive?.(p);
      g.update(p, DT);
      f = frame();
    }
    return { f, p, g };
  };
  /** The fingertips: 19 cm along the hand. */
  const tip = (f: Frame, j: number): Vec3 => {
    const d = turn(f.rot[j], [0, -0.19, 0]);
    return [f.pos[j][0] + d[0], f.pos[j][1] + d[1], f.pos[j][2] + d[2]];
  };
  /** A point as (metres toward the wall, metres above the ledge top), from the runner's centre. */
  const rel = (q: Vec3, wall: number, edge: number) => [
    (q[0] - at.x) * TO[wall][0] + (q[2] - at.z) * TO[wall][1],
    q[1] - edge,
  ];

  it.each([1, 2, 3, 4])('hangs by both hands on the lip, on side %i, the body below it', wall => {
    const { f } = hold({ mode: MODE.HANG, ground: false, wall, edge: 3 });
    const hands = [J.HAND_L, J.HAND_R];
    for (const j of hands) {
      // The wrist is at the lip (the wall is 0.43 m from the centre) and over it; the fingers lie on the top.
      const [along, up] = rel(f.pos[j], wall, 3);
      expect(Math.abs(along - 0.43)).toBeLessThan(0.05);
      expect(Math.abs(up)).toBeLessThan(0.05);
      const [far, top] = rel(tip(f, j), wall, 3);
      expect(far).toBeGreaterThan(0.43 + 0.1);
      expect(Math.abs(top)).toBeLessThan(0.06);
    }
    // A shoulder's width apart, along the wall.
    const [a, b] = hands.map(j => f.pos[j]);
    expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(0.3);
    // The body hangs below, against the wall, facing it.
    expect(f.pos[J.HEAD][1]).toBeLessThan(3);
    expect(Math.min(...[J.FOOT_L, J.FOOT_R].map(j => f.pos[j][1]))).toBeLessThan(1.4);
    expect(rel(f.pos[J.PELVIS], wall, 3)[0]).toBeGreaterThan(0.1);
    expect(rel(f.pos[J.PELVIS], wall, 3)[0]).toBeLessThan(0.3);
    const ahead = turn(f.rot[J.CHEST], [0, 0, -1]);
    expect(ahead[0] * TO[wall][0] + ahead[2] * TO[wall][1]).toBeGreaterThan(0.9);
  });

  it('sways a little as it hangs: the feet a few centimetres, the hands not at all, each player in their own time', () => {
    const swing = (id: number) =>
      sim(
        createGait(),
        state({ id, ...at, mode: MODE.HANG, ground: false, wall: 4, edge: 3 }),
        8,
        () => undefined,
      );
    const [a, b] = [swing(3), swing(4)];
    for (const fs of [a, b]) {
      for (const j of [J.FOOT_L, J.FOOT_R]) {
        const move = Math.hypot(...[0, 1, 2].map(k => spread(fs.map(f => f.pos[j][k]))));
        expect(move).toBeGreaterThan(0.03);
        expect(move).toBeLessThan(0.1);
      }
      // The wrists stay on the lip, within the tolerance of the hang, and in fact where they were.
      for (const j of [J.HAND_L, J.HAND_R]) {
        for (const f of fs) {
          const [along, up] = rel(f.pos[j], 4, 3);
          expect(Math.abs(along - 0.43)).toBeLessThan(0.05);
          expect(Math.abs(up)).toBeLessThan(0.05);
        }
        expect(Math.max(...[0, 1, 2].map(k => spread(fs.map(f => f.pos[j][k]))))).toBeLessThan(
          0.005,
        );
      }
    }
    // Not in unison: the two feet of two players are not at the same place at the same time.
    expect(
      Math.max(...a.map((f, i) => Math.abs(f.pos[J.FOOT_R][2] - b[i].pos[J.FOOT_R][2]))),
    ).toBeGreaterThan(0.02);
  });

  it('keeps both hands planted on the ledge for the whole climb, sliding in under the shoulders as they pass over it', () => {
    // The physics of a 3 m ledge: 20 frames of hang, the rise at CLIMB_RISE, then the body goes in 0.63 m, then it is over.
    const edge = 3;
    const g = createGait();
    const p = state({ id: 3, ...at, mode: MODE.HANG, ground: false, wall: 4, edge });
    const z0 = p.z;
    const fs = sim(g, p, 1.2, (q, t) => {
      if (t < 20 * DT) {
        return;
      }
      if (q.y < edge) {
        [q.mode, q.y] = [MODE.CLIMB, Math.min(edge, q.y + CLIMB_RISE * DT)];
      } else if (z0 - q.z < 0.63) {
        q.z -= CLIMB_FWD_SPEED * DT;
      } else {
        Object.assign(q, { mode: MODE.GROUND, ground: true, wall: 0, edge: 0 });
      }
    });
    const end = fs.findIndex(f => f.at[1] >= edge && f.at[2] < z0 - 0.62);
    expect(end).toBeGreaterThan(30);
    for (const f of fs.slice(0, end)) {
      for (const [j, arm] of [
        [J.HAND_L, J.ARM_L],
        [J.HAND_R, J.ARM_R],
      ]) {
        // On the top, or just over it: never below the lip, never in the air.
        const [along, up] = rel(f.pos[j], 4, edge);
        expect(up).toBeGreaterThan(-0.02);
        expect(up).toBeLessThan(0.08);
        expect(along).toBeGreaterThan(0.35);
        // And the arm holds it: it is never stretched past its length.
        expect(Math.hypot(...sub(f.pos[j], f.pos[arm]))).toBeLessThan(0.56);
      }
    }
    // At the top the arms stand straight under the shoulders, pressing the ledge.
    const top = fs[end - 1];
    for (const [j, arm] of [
      [J.HAND_L, J.ARM_L],
      [J.HAND_R, J.ARM_R],
    ]) {
      const d = sub(top.pos[arm], top.pos[j]);
      expect(d[1]).toBeGreaterThan(0.45);
      expect(Math.hypot(d[0], d[2])).toBeLessThan(0.15);
    }
    // The hands let go once the climb is over: the body stands up and runs on.
    const last = fs[fs.length - 1];
    expect(last.pos[J.HAND_L][1]).toBeGreaterThan(edge + 0.3);
    expect(last.pos[J.PELVIS][1]).toBeGreaterThan(edge + 0.8);
  });

  it('keeps the hands on the lip as the body climbs, then puts a foot over it', () => {
    const climb = (y: number) => hold({ mode: MODE.CLIMB, ground: false, wall: 4, edge: 3, y }, 90);
    const [low, mid, top] = [climb(1.2), climb(1.9), climb(2.9)];
    for (const { f } of [low, mid]) {
      for (const j of [J.HAND_L, J.HAND_R]) {
        const [along, up] = rel(f.pos[j], 4, 3);
        expect(along).toBeGreaterThan(0.3);
        expect(along).toBeLessThan(0.65);
        expect(Math.abs(up)).toBeLessThan(0.06);
      }
    }
    // Early on both feet hang below; at the top a foot is on the ledge, beyond its lip, the knee high.
    const feet = (r: typeof low) => [J.FOOT_L, J.FOOT_R].map(j => rel(r.f.pos[j], 4, 3));
    expect(Math.max(...feet(low).map(q => q[1]))).toBeLessThan(-1.2);
    const [foot] = feet(top).filter(q => q[0] > 0.43);
    expect(foot).toBeDefined();
    expect(Math.abs(foot[1] - 0.06)).toBeLessThan(0.06);
    expect(top.f.pos[J.SHIN_R][1]).toBeGreaterThan(3 - 0.2);
    // The trunk is further forward than in the hang.
    expect(lean(top.f)).toBeGreaterThan(
      lean(hold({ mode: MODE.HANG, ground: false, wall: 4, edge: 3 }).f) + 0.2,
    );
  });

  it.each([
    ['east', 1, 0, -7],
    ['west', 2, 0, -7],
    ['east, running the other way', 1, Math.PI, 7],
  ])(
    'runs the %s wall with the near sole and hand on it, the legs cycling along it',
    (_n, wall, yaw, vz) => {
      const g = createGait();
      const p = state({ id: 6, ...at, mode: MODE.WALLRUN, ground: false, wall, vz, yaw });
      const frames = sim(g, p, 3, q => (q.z += vz * DT)).slice(90);
      // Facing -z the right hand is +x: the wall is on the side of the runner that matches.
      const right = TO[wall][0] * Math.cos(yaw) - TO[wall][1] * Math.sin(yaw) > 0;
      const [foot, hand] = right ? ['R', J.HAND_R] : ['L', J.HAND_L];
      const x = (q: Vec3) => (q[0] - p.x) * TO[wall][0];
      const near = frames.map(f => Math.min(...sole(f, foot as 'L' | 'R').map(q => 0.4 - x(q))));
      // In the stance the whole sole lies on the wall plane (a few mm), in the swing it comes off it.
      const planted = near.filter(d => Math.abs(d) < 0.03).length;
      expect(planted).toBeGreaterThan(frames.length * 0.4);
      expect(Math.max(...near)).toBeGreaterThan(0.1);
      expect(Math.min(...near)).toBeGreaterThan(-0.03);
      for (const f of frames) {
        expect(0.4 - x(f.pos[hand])).toBeLessThan(0.1);
        expect(0.4 - x(f.pos[hand])).toBeGreaterThan(0.01);
      }
      // The sole faces the wall in the stance: the ball and the heel at the same distance.
      const flat = frames.filter((_, i) => Math.abs(near[i]) < 0.01);
      expect(flat.length).toBeGreaterThan(10);
      for (const f of flat) {
        const [heel, ball] = sole(f, foot as 'L' | 'R');
        expect(Math.abs(x(heel) - x(ball))).toBeLessThan(0.03);
      }
      // A run, not a pose: the foot moves along the wall, both feet cycle, and nothing goes through it.
      const z = frames.map(f => f.pos[right ? J.FOOT_R : J.FOOT_L][2] - f.pos[J.PELVIS][2]);
      expect(spread(z)).toBeGreaterThan(0.4);
      expect(
        spread(frames.map(f => f.pos[right ? J.FOOT_L : J.FOOT_R][2] - f.pos[J.PELVIS][2])),
      ).toBeGreaterThan(0.4);
      for (const f of frames) {
        for (let j = 0; j < JOINTS; j++) {
          expect(x(f.pos[j])).toBeLessThan(0.4 + 0.01);
        }
      }
    },
  );

  it('slides on the back hip, the lead foot out ahead and a hand on the floor', () => {
    const { f } = hold({ mode: MODE.SLIDE, vz: -8 }, 120, p => (p.z -= 8 * DT));
    const floor = at.y;
    expect(f.pos[J.PELVIS][1] - floor).toBeLessThan(0.35);
    expect(f.pos[J.HEAD][1] - floor).toBeLessThan(0.95);
    // One hand rests on the floor behind the hip.
    const [low, high] = [J.HAND_L, J.HAND_R].map(j => f.pos[j]).sort((a, b) => a[1] - b[1]);
    expect(low[1] - floor).toBeLessThan(0.06);
    expect(low[1] - floor).toBeGreaterThan(0);
    expect(low[2]).toBeGreaterThan(f.pos[J.PELVIS][2]);
    expect(high[1]).toBeGreaterThan(low[1] + 0.2);
    // The lead leg goes out ahead, low, and nothing sinks into the floor.
    const lead = f.pos[J.FOOT_R];
    expect(f.pos[J.PELVIS][2] - lead[2]).toBeGreaterThan(0.6);
    expect(lead[1] - floor).toBeLessThan(0.3);
    for (let j = 0; j < JOINTS; j++) {
      expect(f.pos[j][1] - floor).toBeGreaterThan(-0.03);
    }
  });

  it('lies on the floor when down: knees give, then the body goes over, the head with it', () => {
    const { f, p } = hold({ down: 100 }, 120);
    const floor = p.y;
    for (let j = 0; j < JOINTS; j++) {
      expect(f.pos[j].every(Number.isFinite)).toBe(true);
      expect(f.pos[j][1] - floor).toBeGreaterThan(-0.03);
      expect(f.pos[j][1] - floor).toBeLessThan(0.5);
    }
    expect(f.pos[J.HEAD][1] - floor).toBeLessThan(0.4);
    // Stood up again a moment after the respawn.
    const { f: up } = hold({ down: 0 }, 120);
    expect(up.pos[J.HEAD][1] - floor).toBeGreaterThan(1.4);
  });

  it('keeps the knees giving before the body is over: half a second in, the pelvis is low but the head is not yet on the floor', () => {
    const g = createGait();
    const p = state({ id: 3, ...at, down: 100 });
    g.update(p, DT);
    // The first state of a player is its pose at once; follow the fall from the state before it.
    const q = state({ id: 3, ...at });
    const h = createGait();
    h.update(q, DT);
    for (let i = 0; i < 12; i++) {
      h.update(p, DT);
    }
    const early = solve(h.pose());
    expect(early.pos[J.PELVIS][1] - at.y).toBeLessThan(0.85);
    expect(early.pos[J.HEAD][1] - at.y).toBeGreaterThan(0.7);
  });

  it('keeps every bone its length in every move, the IK included', () => {
    const states: Partial<PlayerState>[] = [
      { mode: MODE.HANG, wall: 3, edge: 3 },
      { mode: MODE.CLIMB, wall: 2, edge: 3, y: 2.5 },
      { mode: MODE.WALLRUN, wall: 1, vz: -7 },
      { mode: MODE.WALLRUN, wall: 2, vz: -7, yaw: 1 },
      { mode: MODE.SLIDE, vz: -8 },
      { mode: MODE.AIR, vy: 5, vz: -6 },
      { mode: MODE.CROUCH, vz: -2 },
      { stun: 30 },
      { down: 100 },
      { down: 100, mode: MODE.CROUCH },
    ];
    for (const o of states) {
      const { f } = hold(o, 80, p => (p.z += (p.vz ?? 0) * DT));
      PARENT.forEach((up, j) => {
        if (up >= 0) {
          expect(Math.hypot(...sub(f.pos[j], f.pos[up]))).toBeCloseTo(Math.hypot(...REST[j]), 4);
        }
      });
    }
  });

  it('never produces a NaN or a stretched limb, in any mode, wall, ledge or timing', () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 6; n++) {
      const g = createGait();
      const p = state({ id: n + 1 });
      for (let i = 0; i < 1500; i++) {
        if (i % 25 == 0) {
          Object.assign(p, {
            mode: Math.floor(rnd() * 7),
            wall: Math.floor(rnd() * 5),
            edge: rnd() < 0.2 ? 0 : p.y + rnd() * 3 - 0.5,
            yaw: rnd() * 7,
            vx: (rnd() - 0.5) * 20,
            vz: (rnd() - 0.5) * 20,
            vy: (rnd() - 0.5) * 12,
            stun: rnd() < 0.2 ? 30 : 0,
          });
        }
        p.x += p.vx * DT;
        p.z += p.vz * DT;
        p.y += p.vy * DT * 0.2;
        g.update(p, rnd() < 0.05 ? 0 : 1 / (20 + rnd() * 140));
        const f = solve(g.pose());
        for (let j = 0; j < JOINTS; j++) {
          expect(f.rot[j].every(Number.isFinite)).toBe(true);
          expect(Math.abs(Math.hypot(...f.rot[j]) - 1)).toBeLessThan(1e-4);
          expect(f.pos[j].every(Number.isFinite)).toBe(true);
          expect(Math.hypot(...sub(f.pos[j], [p.x, p.y, p.z]))).toBeLessThan(2.5);
        }
      }
    }
  }, 60_000);
});

describe('gait: the poses of the other moves', () => {
  const frames = (
    to: Partial<PlayerState>,
    secs = 1.5,
    drive?: (p: PlayerState, t: number) => void,
  ) => sim(createGait(), state({ id: 2, ...to }), secs, drive ?? (() => undefined));
  const pelvis = (f: Frame) => f.pos[J.PELVIS][1] - f.at[1];

  it('takes off and rises with one knee driven up and the arms thrown up', () => {
    const f = frames({ mode: MODE.AIR, ground: false, vy: 6, vz: -6 }).pop()!;
    const [kl, kr] = [J.SHIN_L, J.SHIN_R].map(j => f.pos[j][1]);
    expect(Math.abs(kl - kr)).toBeGreaterThan(0.2);
    expect(Math.max(kl, kr)).toBeGreaterThan(f.pos[J.PELVIS][1] - 0.25);
    for (const j of [J.HAND_L, J.HAND_R]) {
      expect(f.pos[j][1]).toBeGreaterThan(f.pos[J.NECK][1]);
    }
  });

  it('falls with the legs reaching down and the arms out for balance', () => {
    const f = frames({ mode: MODE.AIR, ground: false, vy: -8, vz: -6 }).pop()!;
    for (const j of [J.FOOT_L, J.FOOT_R]) {
      expect(f.pos[J.PELVIS][1] - f.pos[j][1]).toBeGreaterThan(0.6);
    }
    for (const j of [J.HAND_L, J.HAND_R]) {
      expect(Math.abs(f.pos[j][0] - f.pos[J.PELVIS][0])).toBeGreaterThan(0.45);
      expect(Math.abs(f.pos[j][1] - f.pos[J.CHEST][1])).toBeLessThan(0.4);
    }
  });

  it('absorbs a landing by the knees and the trunk, deeper for a harder fall', () => {
    const land = (v: number) => {
      const g = createGait();
      const p = state({ id: 2, mode: MODE.AIR, ground: false, y: 3, vy: -v });
      const fs = sim(g, p, 1.5, (q, t) => {
        if (t < 0.4) {
          q.y = 3 - v * t;
        } else {
          Object.assign(q, { mode: MODE.GROUND, ground: true, y: 0, vy: 0 });
        }
      }).slice(24);
      return fs.reduce((a, b) => (pelvis(b) < pelvis(a) ? b : a));
    };
    const [soft, hard] = [land(5), land(14)];
    expect(pelvis(hard)).toBeLessThan(pelvis(soft) - 0.08);
    expect(pelvis(hard)).toBeLessThan(0.8);
    expect(lean(hard)).toBeGreaterThan(lean(soft));
    // The hands come forward of the hips to balance.
    expect(hard.pos[J.HAND_L][2]).toBeLessThan(hard.pos[J.PELVIS][2] - 0.15);
  });

  it('dashes in a lunge: the trunk low and forward, the arms swept back, the legs split', () => {
    const f = frames({ mode: MODE.AIR, ground: false, dash: 59, vz: -16 }, 1).pop()!;
    expect(lean(f)).toBeGreaterThan(0.6);
    for (const j of [J.HAND_L, J.HAND_R]) {
      expect(f.pos[j][2]).toBeGreaterThan(f.pos[J.PELVIS][2] + 0.05);
    }
    expect(Math.abs(f.pos[J.FOOT_L][2] - f.pos[J.FOOT_R][2])).toBeGreaterThan(0.5);
  });

  it('reels in a stumble with the arms flailing, and is upright again once it is over', () => {
    const fs = frames({ stun: 40, vz: -2 }, 0.8, (p, t) => (p.stun = Math.max(0, 40 - 60 * t)));
    // The hands swing against each other: the heights of the two differ and change sign.
    const diff = fs.slice(20, 40).map(f => f.pos[J.HAND_L][1] - f.pos[J.HAND_R][1]);
    expect(Math.max(...diff)).toBeGreaterThan(0.1);
    expect(Math.min(...diff)).toBeLessThan(-0.1);
    // Still again, the runner stands in its guard: leaning forward a little, not reeling.
    const end = frames({}, 3).pop()!;
    expect(lean(end)).toBeGreaterThan(0.05);
    expect(lean(end)).toBeLessThan(0.25);
  });

  describe('a knock', () => {
    /**
     * A runner who looks along `yaw`, thrown (right, back) of it at the speed of a tackle, slowing at
     * the stumble's drag. `lean` is the neck's offset from the pelvis along the push and across it.
     */
    const knocked = (right: number, back: number, yaw = 0, secs = 2) => {
      const u: Vec3 = [
        right * Math.cos(yaw) + back * Math.sin(yaw),
        0,
        back * Math.cos(yaw) - right * Math.sin(yaw),
      ];
      const g = createGait();
      const fs = sim(g, state({ id: 2, yaw }), secs, (q, t) => {
        const s = t < 0.5 ? STUMBLE_KNOCK - STUMBLE_DRAG * t : 0;
        [q.vx, q.vz] = [u[0] * s, u[2] * s];
        q.x += q.vx * DT;
        q.z += q.vz * DT;
        q.stun = Math.max(0, STUMBLE_TICKS - 60 * t);
      });
      const lean = (f: Frame): [number, number] => {
        const d = sub(f.pos[J.NECK], f.pos[J.PELVIS]);
        return [dot(d, u), dot(d, cross(u, [0, 1, 0]))];
      };
      return { fs, g, u, lean };
    };

    it.each([
      ['from behind: ahead of the pelvis', 0, -1, 0],
      ['from the front: behind it', 0, 1, 0],
      ['from the left: to the right', 1, 0, 0],
      ['from the right: to the left', -1, 0, 0],
      ['from behind, looking the other way', 0, -1, 2.2],
      ['from the right, looking the other way', -1, 0, 2.2],
    ])('throws the chest along the push, %s', (_n, right, back, yaw) => {
      const { fs, lean } = knocked(right, back, yaw);
      const [along, across] = lean(fs[18]);
      expect(along).toBeGreaterThan(0.1);
      expect(Math.abs(across)).toBeLessThan(0.06);
    });

    it('comes in with the hit, and eases out as the knock slides away and the stun ends', () => {
      const { fs, lean } = knocked(0, -1);
      const a = fs.map(f => lean(f)[0]);
      // Fast: most of the lean is there 0.1 s in, and the peak a little later.
      expect(a[6]).toBeGreaterThan(0.08);
      const peak = Math.max(...a);
      expect(peak).toBeGreaterThan(0.14);
      expect(a.indexOf(peak)).toBeLessThan(24);
      // Out again with the knock, and back in the guard before the stun is over.
      // The same runner (its own tilt) left standing: the neck ahead of the pelvis in its guard.
      const still = sim(createGait(), state({ id: 2 }), 2, () => {}).at(-1)!;
      const guard = -sub(still.pos[J.NECK], still.pos[J.PELVIS])[2];
      expect(a[36] - guard).toBeLessThan((peak - guard) * 0.5);
      expect(Math.abs(a[48] - guard)).toBeLessThan(0.03);
      expect(Math.abs(a[a.length - 1] - guard)).toBeLessThan(0.03);
    });

    it('never pops: no joint jumps between two frames, whichever way it is thrown', () => {
      const local = (f: Frame) => f.pos.map(q => sub(q, f.at));
      for (const [right, back] of [
        [0, -1],
        [0, 1],
        [1, 0],
      ]) {
        // The first frames are the gait settling in from nothing.
        const poses = knocked(right, back).fs.slice(10).map(local);
        const steps = poses
          .slice(1)
          .map((a, i) => Math.max(...a.map((q, j) => Math.hypot(...sub(q, poses[i][j])))));
        expect(Math.max(...steps)).toBeLessThan(0.25);
        const kinks = steps.slice(1).map((s, i) => Math.abs(s - steps[i]));
        expect(Math.max(...kinks)).toBeLessThan(0.15);
      }
    });

    it('takes catching steps along the push, not a frozen stance', () => {
      for (const [right, back] of [
        [0, -1],
        [0, 1],
        [1, 0],
        [-1, 0],
      ]) {
        const { fs, g, u } = knocked(right, back);
        expect(g.steps).toBeGreaterThanOrEqual(3);
        // Each foot goes along the push relative to the pelvis, and comes back under it.
        for (const j of [J.FOOT_L, J.FOOT_R]) {
          const along = fs.slice(0, 40).map(f => dot(sub(f.pos[j], f.pos[J.PELVIS]), u));
          expect(spread(along)).toBeGreaterThan(0.25);
        }
      }
    });
  });

  it('walks crouched: low, the trunk forward, the hands ready in front', () => {
    const fs = frames({ mode: MODE.CROUCH, vz: -2.2 }, 3, p => (p.z -= 2.2 * DT));
    const f = fs[fs.length - 1];
    expect(pelvis(f)).toBeLessThan(0.75);
    expect(lean(f)).toBeGreaterThan(0.2);
    for (const j of [J.HAND_L, J.HAND_R]) {
      expect(f.pos[j][2]).toBeLessThan(f.pos[J.PELVIS][2] - 0.2);
    }
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

  it('is cheap: well under 150 microseconds a runner and a frame (a frame is 16,000)', () => {
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
    expect(per).toBeLessThan(150);
  });
});

describe('seated in a rover', () => {
  /** The seat point's frame: x right, y up, a ahead of it, as the rover leans. */
  const local = (seat: Seat, p: PlayerState, [x, y, z]: Vec3): Vec3 => {
    const [r, u, f] = basis(seat.yaw, seat.pitch, seat.roll);
    const d = [x - p.x, y - p.y, z - p.z];
    return [r, u, f].map(v => v[0] * d[0] + v[1] * d[1] + v[2] * d[2]) as Vec3;
  };
  const LEVEL: Seat = { yaw: 0, pitch: 0, roll: 0, steer: 0, s: 0 };
  /** The pose of who has sat for a second, in the seat's frame. */
  const sit = (seat: Seat | undefined, o: Partial<PlayerState> = {}) => {
    const p = state({
      mode: MODE.RIDE,
      ground: false,
      x: 3,
      y: 2,
      z: -5,
      yaw: seat?.yaw ?? 0,
      ...o,
    });
    const g = createGait();
    for (let i = 0; i < 60; i++) {
      g.update(p, DT, undefined, seat);
    }
    const s = solve(g.pose());
    const ref = seat ?? { ...LEVEL, yaw: p.yaw };
    return s.pos.map(q => local(ref, p, q));
  };
  // The seat of rover.ts, from the seat point: the cushion's top, the back's foot and top, the
  // roll hoop's top and feet, the tub's floor and the dash.
  const [CUSHION, BACK, BACK_TOP, HOOP, FLOOR, DASH] = [0.13, -0.3, 0.97, 1.45, -0.09, 0.8];

  for (const s of [0, 1]) {
    it(`sits ${s ? 'the rider' : 'the driver'} on the cushion, his back to the seat's, his head over it and under the hoop, his feet in the footwell`, () => {
      const at = sit({ ...LEVEL, s });
      const [, py, pa] = at[J.PELVIS];
      // The pelvis: a buttock over the cushion, ahead of the back.
      expect(py - CUSHION).toBeGreaterThan(0.06);
      expect(py - CUSHION).toBeLessThan(0.17);
      expect(pa).toBeGreaterThan(BACK + 0.08);
      expect(pa).toBeLessThan(0);
      // The chest stays ahead of the back, which leans away.
      expect(at[J.CHEST][2]).toBeGreaterThan(BACK - 0.14 * (at[J.CHEST][1] / 0.84) + 0.08);
      // The head: over the back's top, under the hoop, between its feet.
      const [hx, hy, ha] = at[J.HEAD];
      expect(hy + 0.1).toBeGreaterThan(BACK_TOP - 0.05);
      expect(hy + 0.3).toBeLessThan(HOOP);
      expect(Math.abs(hx)).toBeLessThan(0.1);
      expect(ha).toBeGreaterThan(-0.45);
      // Thighs level, knees up and ahead, ankles on the floor under the dash.
      for (const leg of [J.THIGH_L, J.THIGH_R]) {
        const [knee, ankle, toe] = [at[leg + 1], at[leg + 2], at[leg + 3]];
        expect(knee[2]).toBeGreaterThan(0.25);
        expect(knee[1]).toBeGreaterThan(py - 0.1);
        expect(knee[1]).toBeLessThan(0.62);
        expect(ankle[1]).toBeGreaterThan(FLOOR + 0.04);
        expect(ankle[1]).toBeLessThan(FLOOR + 0.2);
        expect(ankle[2]).toBeGreaterThan(0.45);
        expect(toe[2]).toBeLessThan(DASH);
        expect(toe[1]).toBeGreaterThan(FLOOR);
        expect(Math.abs(ankle[0])).toBeLessThan(0.2);
      }
      expect(at[J.FOOT_L][0]).toBeLessThan(at[J.FOOT_R][0]);
    });
  }

  it("puts the driver's hands on the yoke's grips, and they go round with the wheels", () => {
    for (const steer of [0, 0.45, -0.3]) {
      const at = sit({ ...LEVEL, steer });
      const [l, r] = grips(steer);
      // The wrist is a palm short of the grip.
      for (const [hand, grip] of [
        [at[J.HAND_L], l],
        [at[J.HAND_R], r],
      ]) {
        expect(Math.hypot(hand[0] - grip[0], hand[1] - grip[1])).toBeLessThan(0.03);
        expect(grip[2] - hand[2]).toBeGreaterThan(0.04);
        expect(grip[2] - hand[2]).toBeLessThan(0.11);
      }
    }
    // The elbows are bent: he is not at arm's length.
    const at = sit(LEVEL);
    expect(Math.hypot(...at[J.HAND_L].map((v, i) => v - at[J.ARM_L][i]))).toBeLessThan(0.52);
    const [straight, right] = [sit(LEVEL), sit({ ...LEVEL, steer: 0.45 })];
    expect(right[J.HAND_R][1]).toBeLessThan(straight[J.HAND_R][1] - 0.05);
    expect(right[J.HAND_L][1]).toBeGreaterThan(straight[J.HAND_L][1] + 0.05);
  });

  it("rests the rider's free right hand on the rail beside him, and leaves it to his weapon when he has one", () => {
    const free = sit({ ...LEVEL, s: 1 });
    expect(free[J.HAND_R][0]).toBeGreaterThan(0.22);
    expect(free[J.HAND_R][1]).toBeGreaterThan(0.33);
    const armed = sit({ ...LEVEL, s: 1 }, { ammo: 5 });
    expect(armed[J.HAND_R][0]).toBeLessThan(0.2);
    // The other hand lies on his thigh, over the knee's height and inside the seat: not at a yoke.
    for (const hand of [free[J.HAND_L], armed[J.HAND_L], armed[J.HAND_R]]) {
      expect(hand[1]).toBeGreaterThan(0.33);
      expect(hand[1]).toBeLessThan(0.48);
      expect(hand[2]).toBeLessThan(0.3);
      expect(Math.abs(hand[0])).toBeLessThan(0.2);
    }
  });

  it('leans with the rover about the seat point, and faces its nose whatever the look and the speed', () => {
    const level = sit(LEVEL);
    for (const seat of [
      { ...LEVEL, pitch: 0.5 },
      { ...LEVEL, roll: -0.6 },
      { yaw: 2, pitch: -0.4, roll: 0.3, steer: 0.2, s: 0 },
    ]) {
      const at = sit({ ...seat, steer: 0 }, { yaw: seat.yaw + 0.9, vx: 15, vz: -9 });
      // The same pose in the seat's own frame: the trunk and the limbs. The head keeps to the look.
      [J.PELVIS, J.CHEST, J.HAND_L, J.HAND_R, J.FOOT_L, J.FOOT_R, J.SHIN_R].forEach(j =>
        at[j].forEach((v, i) => expect(v).toBeCloseTo(level[j][i], 2)),
      );
    }
    // In the world, the head of a rover nose up is behind and lower.
    const p = state({ mode: MODE.RIDE });
    const g = createGait();
    g.update(p, 0, undefined, { ...LEVEL, pitch: 0.6 });
    const up = solve(g.pose()).pos[J.HEAD];
    const g0 = createGait();
    g0.update(p, 0, undefined, LEVEL);
    const flat = solve(g0.pose()).pos[J.HEAD];
    expect(up[2]).toBeGreaterThan(flat[2] + 0.3);
    expect(up[1]).toBeLessThan(flat[1] - 0.05);
  });

  it('turns the head toward the look as far as a neck goes, and a rider turns his shoulders a part of the way', () => {
    const facing = (look: number, s: number) => {
      const p = state({ mode: MODE.RIDE, yaw: look });
      const g = createGait();
      g.update(p, 0, undefined, { ...LEVEL, s });
      const { rot } = solve(g.pose());
      const dir = (j: number) => {
        const f = turn(rot[j], [0, 0, -1]);
        return Math.atan2(-f[0], -f[2]);
      };
      return [dir(J.HEAD), dir(J.CHEST)];
    };
    const [head, chest] = facing(1, 1);
    expect(head).toBeGreaterThan(0.7);
    expect(chest).toBeGreaterThan(0.2);
    expect(chest).toBeLessThan(0.7);
    // Looking back over the shoulder: the head stops short.
    const [back] = facing(3, 1);
    expect(back).toBeGreaterThan(1);
    expect(back).toBeLessThan(1.7);
    // The driver's shoulders stay square to the yoke.
    expect(Math.abs(facing(1, 0)[1])).toBeLessThan(0.1);
  });

  it('sits level, facing his look, when his rover is not known, and stands up again on foot', () => {
    const at = sit(undefined, { yaw: 1.2 });
    expect(at[J.PELVIS][1]).toBeLessThan(0.35);
    expect(at[J.FOOT_L][2]).toBeGreaterThan(0.45);
    const p = state({ mode: MODE.RIDE });
    const g = createGait();
    g.update(p, 0, undefined, LEVEL);
    expect(solve(g.pose()).pos[J.HEAD][1]).toBeLessThan(1.1);
    for (let i = 0; i < 60; i++) {
      g.update({ ...p, mode: MODE.GROUND }, DT);
    }
    expect(solve(g.pose()).pos[J.HEAD][1]).toBeGreaterThan(1.45);
  });
});

describe('gait: the sword guard (the user, 2026-11-10: stand like a samurai)', () => {
  /** The pose after `n` frames of standing with the state `o`. */
  const stood = (g: Gait, o: Partial<PlayerState>, n = 90) => {
    for (let i = 0; i < n; i++) {
      g.update(state(o), DT);
    }
    return solve(g.pose());
  };

  it('lifts the left heel, sets the right foot further ahead and straightens the back, with the katana in hand only', () => {
    // Against one with a gun: the plain guard (bare-handed it is a fighter's, lower and longer).
    const [bare, sword] = [stood(createGait(), { ammo: 0 }), stood(createGait(), { wield: true })];
    // The heel up on the ball of the foot: the ankle higher, the toes where they were.
    expect(sword.pos[J.FOOT_L][1]).toBeGreaterThan(bare.pos[J.FOOT_L][1] + 0.025);
    expect(sword.pos[J.TOE_L][1]).toBeCloseTo(bare.pos[J.TOE_L][1], 2);
    expect(sword.pos[J.FOOT_R][1]).toBeCloseTo(bare.pos[J.FOOT_R][1], 3);
    // Facing -z: ahead is less z.
    expect(sword.pos[J.FOOT_R][2]).toBeLessThan(bare.pos[J.FOOT_R][2] - 0.015);
    const lean = (s: ReturnType<typeof solve>) => Math.asin(-turn(s.rot[J.CHEST], [0, 1, 0])[2]);
    expect(lean(sword)).toBeLessThan(lean(bare) - 0.08);
    expect(lean(sword)).toBeGreaterThan(0);
  });

  it('eases into the guard and out of it: no joint jumps when the katana comes to hand or leaves it', () => {
    const g = createGait();
    let was = stood(g, {});
    for (const wield of [true, false]) {
      for (let i = 0; i < 60; i++) {
        g.update(state({ wield }), DT);
        const s = solve(g.pose());
        s.pos.forEach((p, j) =>
          expect(Math.hypot(...p.map((v, k) => v - was.pos[j][k]))).toBeLessThan(0.035),
        );
        was = s;
      }
    }
  });

  it("leaves the eye's own body as it stands", () => {
    const [bare, sword] = [stood(createGait(0), {}), stood(createGait(0), { wield: true })];
    expect(sword.pos).toEqual(bare.pos);
  });
});

describe('gait: the bare-handed guard and the breath (the user, 2026-11-11: a fighting stance, the arms out as in karate; see him breathe)', () => {
  const stood = (o: Partial<PlayerState>, secs = 2) => {
    const g = createGait();
    return { g, frames: sim(g, state(o), secs, () => undefined) };
  };
  const last = (o: Partial<PlayerState>) => stood(o).frames.pop()!;

  it('holds the arms out before him with nothing in his hands: the right nearly straight at the chest, the left half way, not along the body', () => {
    const s = last({});
    const fwd = (a: number, b: number) => -(s.pos[a][2] - s.pos[b][2]);
    // The right hand 40 cm and more ahead of its shoulder, about its height; the elbow nearly straight.
    expect(fwd(J.HAND_R, J.ARM_R)).toBeGreaterThan(0.4);
    expect(Math.abs(s.pos[J.HAND_R][1] - s.pos[J.ARM_R][1])).toBeLessThan(0.25);
    const reach = Math.hypot(...sub(s.pos[J.HAND_R], s.pos[J.ARM_R]));
    expect(reach).toBeGreaterThan(0.5);
    // The left hand ahead too, less far, under the right, before the trunk; its elbow well bent.
    expect(fwd(J.HAND_L, J.ARM_L)).toBeGreaterThan(0.18);
    expect(fwd(J.HAND_L, J.ARM_L)).toBeLessThan(fwd(J.HAND_R, J.ARM_R) - 0.1);
    expect(s.pos[J.HAND_L][1]).toBeLessThan(s.pos[J.HAND_R][1]);
    expect(s.pos[J.HAND_L][1]).toBeGreaterThan(s.pos[J.PELVIS][1] + 0.1);
    // Neither hangs: both hands are over the belt and inside the shoulders' width.
    for (const [hand, shoulder] of [
      [J.HAND_L, J.ARM_L],
      [J.HAND_R, J.ARM_R],
    ]) {
      expect(s.pos[hand][1] - s.pos[shoulder][1]).toBeGreaterThan(-0.4);
      expect(Math.abs(s.pos[hand][0])).toBeLessThan(Math.abs(s.pos[shoulder][0]) + 0.05);
    }
  });

  it('stands lower, longer and wider than with a weapon: the right foot well ahead, the knees bent', () => {
    const [bare, gun] = [last({}), last({ ammo: 0 })];
    const span = (s: Frame) => s.pos[J.FOOT_L][2] - s.pos[J.FOOT_R][2];
    const width = (s: Frame) => s.pos[J.FOOT_R][0] - s.pos[J.FOOT_L][0];
    expect(span(bare)).toBeGreaterThan(span(gun) + 0.12);
    expect(span(bare)).toBeGreaterThan(0.35);
    expect(width(bare)).toBeGreaterThan(width(gun) + 0.04);
    expect(bare.pos[J.PELVIS][1]).toBeLessThan(gun.pos[J.PELVIS][1] - 0.02);
    expect(Math.min(knee(bare, 'L'), knee(bare, 'R')) * D).toBeGreaterThan(12);
    // The feet flat on the floor, the head over them.
    expect(bare.pos[J.TOE_L][1]).toBeCloseTo(gun.pos[J.TOE_L][1], 2);
    expect(Math.abs(bare.pos[J.HEAD][0])).toBeLessThan(0.08);
  });

  it('keeps the guard for bare hands and for standing: not with a gun, a rifle or the katana, not on the run, not down', () => {
    const out = (s: Frame) => -(s.pos[J.HAND_R][2] - s.pos[J.ARM_R][2]);
    for (const o of [{ ammo: 0 }, { ammo: 3, rifled: true, rifle: 5 }]) {
      expect(out(last(o))).toBeLessThan(0.2);
    }
    // On the run the arms swing by the body: the hands under the shoulders.
    const run = jog(6, 3).frames.slice(-60);
    const drop = run.reduce((m, f) => m + f.pos[J.HAND_R][1] - f.pos[J.ARM_R][1], 0) / run.length;
    expect(drop).toBeLessThan(-0.1);
    // It comes and goes in a fraction of a second, with no jump.
    const g = createGait();
    let was = sim(g, state({ ammo: 0 }), 1, () => undefined).pop()!;
    const frames = sim(g, state({}), 1.2, () => undefined);
    for (const s of frames) {
      s.pos.forEach((p, j) => expect(Math.hypot(...sub(p, was.pos[j]))).toBeLessThan(0.035));
      was = s;
    }
    expect(out(frames.pop()!)).toBeGreaterThan(0.4);
  });

  it('breathes: a loop of three seconds or so that lifts the chest, the shoulders and the hands, in faster than out', () => {
    const { frames } = stood({}, 14);
    const steady = frames.slice(Math.round(2 / DT));
    const chest = steady.map(f => f.pos[J.NECK][1]);
    const hand = steady.map(f => f.pos[J.HAND_R][1]);
    const shoulder = steady.map(f => f.pos[J.ARM_R][1] - f.pos[J.CHEST][1]);
    // Seen: the chest rises and falls by a centimetre or two, the hands with it, the shoulders on the chest.
    expect(spread(chest)).toBeGreaterThan(0.008);
    expect(spread(chest)).toBeLessThan(0.04);
    expect(spread(hand)).toBeGreaterThan(0.01);
    expect(spread(hand)).toBeLessThan(0.08);
    expect(spread(shoulder)).toBeGreaterThan(0.004);
    // A loop: the same height again every 1 / 0.3 s, three or four breaths in twelve seconds.
    const mid = (Math.max(...chest) + Math.min(...chest)) / 2;
    const ups = chest.flatMap((v, i) => (i && v >= mid && chest[i - 1] < mid ? [i * DT] : []));
    expect(ups.length).toBeGreaterThanOrEqual(3);
    expect(ups.length).toBeLessThanOrEqual(4);
    const gaps = ups.slice(1).map((t, i) => t - ups[i]);
    for (const gap of gaps) {
      expect(gap).toBeCloseTo(1 / 0.3, 1);
    }
    // In faster than out: less time rising than falling.
    const rising = chest.filter((v, i) => i && v > chest[i - 1]).length;
    expect(rising).toBeLessThan(chest.length * 0.47);
    // The feet do not move with it, and nobody steps.
    expect(spread(steady.map(f => f.pos[J.TOE_R][1]))).toBeLessThan(0.002);
    // With a gun in hand he breathes too, the shoulders still.
    const armed = stood({ ammo: 0 }, 8).frames.slice(Math.round(2 / DT));
    expect(spread(armed.map(f => f.pos[J.NECK][1]))).toBeGreaterThan(0.006);
  });
});

describe('thrown: how far out the fist of a punch is', () => {
  it('goes out to the strike and comes back by the end of the swing, for bare hands only', () => {
    const at = (swing: number, o: Partial<PlayerState> = {}) => thrown(state({ swing, ...o }));
    expect(at(0)).toBe(0);
    expect(at(PUNCH.ticks)).toBe(0);
    expect(at(PUNCH.ticks - PUNCH.strike)).toBeCloseTo(1, 9);
    // Rising to the strike, falling after it, never past 1.
    const curve = Array.from({ length: PUNCH.ticks + 1 }, (_, k) => at(PUNCH.ticks - k));
    for (let k = 1; k <= PUNCH.ticks; k++) {
      expect(curve[k]).toBeLessThanOrEqual(1);
      expect(Math.sign(curve[k] - curve[k - 1])).toBe(k <= PUNCH.strike ? 1 : -1);
    }
    // Out in 6 ticks, back in 14: faster out.
    expect(PUNCH.strike).toBeLessThan(PUNCH.ticks - PUNCH.strike);
    // A swing with a weapon is no punch, nor one of a player down.
    for (const o of [{ ammo: 0 }, { blade: true }, { rail: 3 }, { rifle: 3 }, { down: 10 }]) {
      expect(at(PUNCH.ticks - PUNCH.strike, o)).toBe(0);
    }
  });
});

describe('a fall when he goes down (the user, 2026-11-13)', () => {
  /** Stands half a second facing -z, then goes down with `fell`; the frame `secs` after. */
  const die = (fell: number, secs: number, floor?: Floor) => {
    const g = createGait();
    const p = state();
    sim(g, p, 0.5, () => {}, { floor });
    p.fell = fell;
    p.down = DOWN_TICKS;
    const f = sim(g, p, secs, q => (q.down = Math.max(q.down - 1, 1)), { floor });
    return f[f.length - 1];
  };
  /** Which way the chest's front looks, world y: 1 up, -1 down. */
  const front = (f: Frame) => turn(f.rot[J.CHEST], [0, 0, -1])[1];

  it('is thrown the way a shot went: on his back when hit from the front, on his face from behind', () => {
    const back = die(felled(FALL.SHOT, 0, 1), 1.2);
    const [pb, hb] = [back.pos[J.PELVIS], back.pos[J.HEAD]];
    expect(pb[2]).toBeGreaterThan(1.2);
    expect(hb[2] - pb[2]).toBeGreaterThan(0.4);
    expect([pb[1], hb[1]].every(y => y < 0.4)).toBe(true);
    expect(front(back)).toBeGreaterThan(0.7);
    const face = die(felled(FALL.SHOT, 0, -1), 1.2);
    expect(face.pos[J.PELVIS][2]).toBeLessThan(-1.2);
    expect(face.pos[J.HEAD][2] - face.pos[J.PELVIS][2]).toBeLessThan(-0.4);
    expect(front(face)).toBeLessThan(-0.7);
  });

  it('turns to the way a shot from the side went, and is thrown along it', () => {
    const f = die(felled(FALL.SHOT, 1, 0), 1.2);
    const [p, h] = [f.pos[J.PELVIS], f.pos[J.HEAD]];
    expect(p[0]).toBeGreaterThan(1.2);
    expect(Math.abs(p[2])).toBeLessThan(0.2);
    expect(h[0] - p[0]).toBeGreaterThan(0.4);
  });

  it('is thrown no further than the roof goes on', () => {
    const f = die(felled(FALL.SHOT, 0, 1), 1.2, (_, z) => (z > 0.9 ? -10 : 0));
    expect(f.pos[J.PELVIS][2]).toBeLessThan(1);
    expect(f.pos[J.PELVIS][2]).toBeGreaterThan(0.5);
  });

  it('struck, drops to his knees, then goes over on the side the blow pushes and lies there', () => {
    const knees = die(felled(FALL.STRUCK, 1, 0), 0.5);
    const p = knees.pos[J.PELVIS];
    expect(Math.max(knees.pos[J.SHIN_L][1], knees.pos[J.SHIN_R][1])).toBeLessThan(0.15);
    expect(p[1]).toBeGreaterThan(0.4);
    expect(p[1]).toBeLessThan(0.65);
    expect(knees.pos[J.HEAD][1] - p[1]).toBeGreaterThan(0.4);
    for (const s of [1, -1]) {
      const f = die(felled(FALL.STRUCK, s, 0), 1.6);
      const [q, h] = [f.pos[J.PELVIS], f.pos[J.HEAD]];
      expect(h[1]).toBeLessThan(0.45);
      expect(q[1]).toBeLessThan(0.35);
      expect(s * (h[0] - q[0])).toBeGreaterThan(0.3);
      // Where he knelt: not thrown.
      expect(Math.hypot(q[0], q[2])).toBeLessThan(0.6);
      // He lay down whole: still at the end.
      const later = die(felled(FALL.STRUCK, s, 0), 1.8);
      expect(later.pos[J.HEAD][1]).toBeCloseTo(h[1], 3);
    }
  });
});
