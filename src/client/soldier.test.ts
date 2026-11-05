import { describe, expect, it } from 'vitest';
import { DASH_COOLDOWN, PLAYER_H, PLAYER_R } from '../shared/constants';
import { STILL } from '../shared/physics';
import { MODE, SIDE } from '../shared/types';
import type { PlayerState } from '../shared/types';
import { SKIN, SOLE } from './figure';
import { STRIDE } from './mesh';
import type { Vec3 } from './mesh';
import { animate, createRunner, pose, soldier, step } from './soldier';
import type { Pose, Runner } from './soldier';

const DT = 1 / 60;
const man = (o: Partial<PlayerState> = {}): PlayerState => ({
  id: 1,
  x: 5,
  y: 1,
  z: -3,
  vy: 0,
  yaw: 0,
  pitch: 0,
  ground: true,
  ...STILL,
  ...o,
});
const air = (o: Partial<PlayerState> = {}) => man({ mode: MODE.AIR, ground: false, ...o });
/** A runner that has held the state `o` for `n` frames, run along -z when it has a speed. */
const hold = (o: Partial<PlayerState>, n = 90, from: Partial<PlayerState> = o) => {
  let p = man(from);
  const r = createRunner(p);
  for (let i = 0; i < n; i++) {
    p = man({ ...o, z: p.z + (o.vz ?? 0) * DT });
    step(r, p, DT);
  }
  return r;
};
const run = (vz: number, n = 90) => hold({ vz }, n);
/** The pose in the runner's own frame, so that x is its right, y up and z ahead of it. */
const look = (r: Runner) => pose(r);
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** The ankle farthest from the pelvis of a pose, and the nearest. */
const reach = (j: Pose) => j.legs.map(l => dist(l.end, j.pelvis));
const WALKS: Partial<PlayerState> = { mode: MODE.GROUND };
/** Hanging 2 m under the top of a ledge ahead (toward -z). */
const HANGS = {
  mode: MODE.HANG,
  ground: false,
  y: 1,
  wall: SIDE.NORTH,
  edge: 3,
};

describe('step: what it finds in the changes', () => {
  it('sees a double jump in a spent air jump, not in a jump just after an edge (coyote)', () => {
    const r = createRunner(air({ vy: -4, jumps: 1 }));
    step(r, air({ vy: -4.3, jumps: 1 }), DT);
    expect(r.flip).toBe(0);
    // A coyote jump kicks the speed up with the extra jump left: no somersault.
    step(r, air({ vy: 6, jumps: 1 }), DT);
    expect(r.flip).toBe(0);
    step(r, air({ vy: 6, jumps: 0 }), DT);
    expect(r.flip).toBe(0);
    // The extra jump spends one and kicks up.
    step(r, air({ vy: -2, jumps: 1 }), DT);
    step(r, air({ vy: 6, jumps: 0 }), DT);
    expect(r.flip).toBeGreaterThan(0);
  });

  it('does not take the first jump from the floor for a double one', () => {
    const r = createRunner(man());
    step(r, air({ vy: 7 }), DT);
    expect(r.flip).toBe(0);
  });

  it('turns once while it flips, ends upright, and finishes quicker on a floor', () => {
    const r = createRunner(air({ vy: 4, jumps: 1 }));
    step(r, air({ vy: 6, jumps: 0 }), DT);
    const seen: number[] = [];
    let n = 0;
    while (r.flip && n++ < 100) {
      step(r, air({ vy: 2, jumps: 0 }), DT);
      seen.push(r.flip);
    }
    expect(r.flip).toBe(0);
    // About 0.45 s in the air.
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(35);
    expect(seen.slice(0, -1).every((f, i) => !i || f > seen[i - 1])).toBe(true);
    const q = createRunner(air({ vy: 4, jumps: 1 }));
    step(q, air({ vy: 6, jumps: 0 }), DT);
    step(q, man({ jumps: 0 }), DT);
    let m = 0;
    while (q.flip && m++ < 100) {
      step(q, man({ jumps: 0 }), DT);
    }
    expect(m).toBeLessThan(n / 2);
  });

  it('dips at a landing in proportion to the fall, and not for a short drop or a step', () => {
    const land = (vy: number) => {
      const r = createRunner(air({ vy }));
      step(r, air({ vy }), DT);
      step(r, man(), DT);
      return r;
    };
    expect(land(-12).kick).toBe(1);
    expect(land(-6).kick).toBeCloseTo(0.5);
    expect(land(-3.5).kick).toBeCloseTo(0.3);
    expect(land(-2).kick).toBe(0);
    // The deepest speed of the fall counts, not the last.
    const r = createRunner(air({ vy: -9 }));
    step(r, air({ vy: -9 }), DT);
    step(r, air({ vy: -1 }), DT);
    step(r, man(), DT);
    expect(r.kick).toBeCloseTo(0.75);
    // Walking about on a floor is no landing.
    const w = createRunner(man());
    step(w, man({ vz: -5 }), DT);
    expect(w.kick).toBe(0);
  });

  it('lands the dip and lets it go: the knees bend, then come back', () => {
    const r = createRunner(air({ vy: -10 }));
    step(r, air({ vy: -10 }), DT);
    const hip: number[] = [];
    for (let i = 0; i < 90; i++) {
      step(r, man(), DT);
      hip.push(look(r).pelvis[1]);
    }
    expect(Math.min(...hip)).toBeLessThan(0.7);
    expect(hip.at(-1)).toBeGreaterThan(0.86);
  });

  it('starts over at a respawn, far from where it was', () => {
    const r = hold({ mode: MODE.SLIDE, vz: -8 });
    expect(r.w.slide).toBeGreaterThan(0.9);
    step(r, man({ x: 90, y: 4, z: 30 }), DT);
    expect(r.w.slide).toBe(0);
    expect(r.p.x).toBe(90);
  });

  it('keeps a new runner in the pose it is first seen in', () => {
    const r = createRunner(man(HANGS));
    expect(r.w.hang).toBe(1);
    expect(r.w.air).toBe(0);
  });

  it('adds the stride with the distance, only on its feet', () => {
    const r = createRunner(man());
    step(r, man({ z: -3.5, vz: -6 }), DT);
    step(r, man({ z: -4, vz: -6 }), DT);
    expect(r.phase).toBeCloseTo(1 * 2.3, 0);
    const before = r.phase;
    step(r, air({ z: -4.5, vz: -6 }), DT);
    expect(r.phase).toBe(before);
  });

  it('keeps one runner per player and drops the ones that left', () => {
    const book = new Map<number, Runner>();
    animate(book, [man({ id: 1 }), man({ id: 2 })], DT);
    expect([...book.keys()]).toEqual([1, 2]);
    const first = book.get(1);
    animate(book, [man({ id: 1, x: 6 })], DT);
    expect([...book.keys()]).toEqual([1]);
    expect(book.get(1)).toBe(first);
    expect(first!.p.x).toBe(6);
  });
});

describe('blends', () => {
  it('converge on the move asked for, and nothing else is left', () => {
    const r = hold({ mode: MODE.SLIDE, vz: -8 }, 120, { vz: -8 });
    expect(r.w.slide).toBeCloseTo(1, 2);
    expect(r.w.low).toBeCloseTo(1, 2);
    expect(r.w.sprint).toBeLessThan(0.01);
    expect(r.w.speed).toBeLessThan(0.01);
    const a = hold({ mode: MODE.AIR, vy: -3 }, 120, {});
    expect(a.w.air).toBeCloseTo(1, 2);
    expect(a.w.rise).toBeLessThan(0.01);
    const d = hold({ dash: DASH_BURST, vz: -14 }, 60, {});
    expect(d.w.dash).toBeCloseTo(1, 2);
  });

  it('move the body smoothly from one move to the next: no joint jumps in a frame', () => {
    // Every joint of the pose, in metres, to compare one frame with the next.
    const joints = (j: Pose) =>
      [j.pelvis, j.head, ...[...j.arms, ...j.legs].flatMap(l => [l.mid, l.end])].flat();
    // The states in turn, the floor and the ledge climbed at the speed of the host.
    const rise = (i: number) => ({ ...HANGS, mode: MODE.CLIMB, y: Math.min(3, 1 + i * 0.13) });
    const chain: ((i: number) => Partial<PlayerState>)[] = [
      () => ({ vz: -9 }),
      () => ({ mode: MODE.SLIDE, vz: -8 }),
      () => ({ mode: MODE.AIR, ground: false, vy: 6, vz: -6 }),
      () => ({ mode: MODE.AIR, ground: false, vy: -5, vz: -6 }),
      () => ({ mode: MODE.WALLRUN, ground: false, wall: SIDE.WEST, vz: -8 }),
      () => ({ mode: MODE.AIR, ground: false, vy: 5, vz: -6 }),
      () => HANGS,
      rise,
      () => ({ vz: -3, mode: MODE.CROUCH }),
      () => ({ dash: DASH_BURST, vz: -14 }),
      () => ({}),
    ];
    const r = createRunner(man(chain[0](0)));
    let prev = joints(look(r));
    let worst = 0;
    for (const o of chain) {
      for (let i = 0; i < 40; i++) {
        step(r, man(o(i)), DT);
        const now = joints(look(r));
        worst = Math.max(worst, ...now.map((v, k) => Math.abs(v - prev[k])));
        prev = now;
      }
    }
    // The fastest limb moves well under half a metre in a sixtieth of a second.
    expect(worst).toBeLessThan(0.3);
  });

  it('start from the pose of the state: no ease on the first frame', () => {
    const r = createRunner(man({ mode: MODE.SLIDE, vz: -8 }));
    expect(look(r).pelvis[1]).toBeLessThan(0.3);
  });
});

const DASH_BURST = DASH_COOLDOWN - 2;

describe('pose', () => {
  it('stands: the hips at 0.88, the feet on the floor under them, the arms down the sides', () => {
    const j = look(run(0));
    expect(j.pelvis[1]).toBeCloseTo(0.88, 1);
    expect(j.legs.map(l => l.end[1])).toEqual([expect.closeTo(0.07, 1), expect.closeTo(0.07, 1)]);
    for (const [i, side] of [-1, 1].entries()) {
      expect(j.arms[i].end[0] * side).toBeGreaterThan(0.15);
      expect(j.arms[i].end[1]).toBeGreaterThan(0.7);
      expect(j.arms[i].end[1]).toBeLessThan(1.0);
    }
  });

  it('runs with a longer stride, a harder lift and a lean that all grow with the speed', () => {
    const spans = (vz: number) => {
      // The ankles' reach ahead and behind, and their lift, over one stride.
      const reachZ: number[] = [];
      const lift: number[] = [];
      const r = run(vz, 60);
      for (let i = 0; i < 90; i++) {
        step(r, man({ vz, z: r.p.z + vz * DT }), DT);
        const j = look(r);
        reachZ.push(...j.legs.map(l => l.end[2]));
        lift.push(...j.legs.map(l => l.end[1]));
      }
      return [Math.max(...reachZ) - Math.min(...reachZ), Math.max(...lift), look(r).spine[2]];
    };
    const [walk, jog, sprint] = [spans(-2), spans(-6), spans(-9)];
    expect(jog[0]).toBeGreaterThan(walk[0] + 0.1);
    expect(sprint[0]).toBeGreaterThan(jog[0] + 0.05);
    expect(sprint[1]).toBeGreaterThan(jog[1]);
    expect(jog[1]).toBeGreaterThan(walk[1]);
    // The lean of the spine forward: a little standing, a lot at a sprint.
    expect(walk[2]).toBeLessThan(0.2);
    expect(sprint[2]).toBeGreaterThan(jog[2] + 0.1);
    expect(sprint[2]).toBeGreaterThan(0.35);
  });

  it('pumps the arms against the legs, the hand forward as the opposite foot is', () => {
    const r = run(-9, 70);
    for (let i = 0; i < 60; i++) {
      step(r, man({ vz: -9, z: r.p.z - 9 * DT }), DT);
      const j = look(r);
      const [leftFoot, rightFoot] = j.legs.map(l => l.end[2]);
      const [leftHand, rightHand] = j.arms.map(l => l.end[2]);
      // Left hand with right foot: they are forward together.
      expect((leftHand - rightHand) * (rightFoot - leftFoot)).toBeGreaterThanOrEqual(-0.01);
    }
  });

  it('tucks the legs and lifts the arms in a jump, spreads the arms in a fall', () => {
    const stand = look(run(0));
    const jump = look(hold({ mode: MODE.AIR, ground: false, vy: 5, vz: -6 }));
    const fall = look(hold({ mode: MODE.AIR, ground: false, vy: -6, vz: -6 }));
    // The tuck: at least one ankle well up toward the hips.
    expect(Math.min(...reach(jump))).toBeLessThan(Math.min(...reach(stand)) - 0.2);
    expect(jump.legs.some(l => l.end[1] > 0.4)).toBe(true);
    // The hands over the head.
    for (const a of jump.arms) {
      expect(a.end[1]).toBeGreaterThan(jump.head[1]);
    }
    // In a fall the arms go out at the sides, level with the shoulders, and the feet hang.
    expect(fall.arms[0].end[0]).toBeLessThan(-0.55);
    expect(fall.arms[1].end[0]).toBeGreaterThan(0.55);
    for (const a of fall.arms) {
      expect(Math.abs(a.end[1] - a.root[1])).toBeLessThan(0.3);
    }
    expect(fall.legs.every(l => l.end[1] > 0.1)).toBe(true);
  });

  it('flips in a double jump: upside down half way, upright at the end, knees tucked', () => {
    const r = createRunner(air({ vy: 4, jumps: 1 }));
    step(r, air({ vy: 6, jumps: 0 }), DT);
    const ups: number[] = [];
    const tucks: number[] = [];
    while (r.flip) {
      step(r, air({ vy: 2, jumps: 0 }), DT);
      const j = look(r);
      ups.push(j.spine[1]);
      tucks.push(Math.min(...reach(j)));
    }
    expect(Math.min(...ups)).toBeLessThan(-0.7);
    // It rotates forward: the head goes ahead of the hips before it comes round.
    expect(ups.at(-1)).toBeGreaterThan(0.8);
    expect(Math.min(...tucks)).toBeLessThan(0.65);
  });

  it('lunges in a dash: low, leaning far forward, the arms back, a leg trailing', () => {
    const j = look(hold({ dash: DASH_BURST, vz: -14 }, 60, {}));
    expect(j.pelvis[1]).toBeLessThan(0.75);
    expect(j.spine[2]).toBeGreaterThan(0.75);
    for (const a of j.arms) {
      expect(a.end[2]).toBeLessThan(a.root[2]);
    }
    const [back, ahead] = [
      Math.min(...j.legs.map(l => l.end[2])),
      Math.max(...j.legs.map(l => l.end[2])),
    ];
    expect(back).toBeLessThan(-0.4);
    expect(ahead).toBeGreaterThan(0.4);
  });

  it('hangs: both hands on the ledge at its height, the body hanging below it, the legs loose', () => {
    const r = hold(HANGS, 60);
    const j = look(r);
    // The ledge top is 2 m above the feet; the hands are at it, a hand-width apart, ahead.
    for (const a of j.arms) {
      expect(a.end[1]).toBeGreaterThan(1.95);
      expect(a.end[1]).toBeLessThan(2.15);
      expect(a.end[2]).toBeGreaterThan(0.35);
    }
    expect(j.arms[1].end[0] - j.arms[0].end[0]).toBeGreaterThan(0.2);
    expect(j.head[1]).toBeLessThan(2.0);
    expect(j.pelvis[1]).toBeLessThan(1.1);
    // The legs hang from the hips, straight down.
    for (const l of j.legs) {
      expect(l.end[1]).toBeLessThan(0.3);
      expect(l.root[1] - l.end[1]).toBeGreaterThan(0.6);
    }
  });

  it('faces the ledge it holds, whichever way it looks, and hangs against it', () => {
    // The wall is toward -z: the body turns to face it.
    const r = hold({ ...HANGS, yaw: Math.PI / 2 }, 60);
    const walls = Math.abs(Math.atan2(Math.sin(r.yaw), Math.cos(r.yaw)));
    expect(walls).toBeLessThan(0.05);
    const east = hold({ ...HANGS, wall: SIDE.EAST, yaw: 1 }, 60);
    expect(Math.sin(east.yaw)).toBeCloseTo(-1, 1);
  });

  it('climbs: the hands stay on the lip as the body rises, then a knee comes over it', () => {
    const climb = (y: number) => look(hold({ ...HANGS, mode: MODE.CLIMB, y }, 40, HANGS));
    const [low, mid, top] = [climb(1.2), climb(1.9), climb(2.95)];
    for (const [j, y] of [
      [low, 1.2],
      [mid, 1.9],
    ] as const) {
      for (const a of j.arms) {
        // Hands on the lip: at the height of the ledge, whatever height the body is.
        expect(a.end[1] + y).toBeCloseTo(3.03, 1);
      }
    }
    // Early on the legs dangle; near the top a foot is on the ledge, past its lip, its knee high.
    expect(Math.max(...low.legs.map(l => l.end[2]))).toBeLessThan(0.3);
    const foot = top.legs.reduce((a, b) => (a.end[2] > b.end[2] ? a : b));
    expect(foot.end[2]).toBeGreaterThan(0.45);
    expect(foot.end[1]).toBeGreaterThan(0.1);
    expect(foot.end[1]).toBeLessThan(0.3);
    expect(foot.mid[1]).toBeGreaterThan(foot.end[1]);
    expect(top.spine[2]).toBeGreaterThan(low.spine[2] + 0.3);
  });

  it('runs a wall tilted away from it, the near foot on it, the far arm out, on either side', () => {
    // Heading -z with the wall at -x has it on the left (side -1); heading +z, on the right.
    for (const [yaw, vz, side] of [
      [0, -8, -1],
      [Math.PI, 8, 1],
    ] as const) {
      const r = hold({ mode: MODE.WALLRUN, ground: false, wall: SIDE.WEST, vz, yaw }, 90, {
        ...WALKS,
      });
      const j = look(r);
      const [near, far] = side < 0 ? j.legs : [...j.legs].reverse();
      // The spine leans away from the wall, whichever side that is.
      expect(j.spine[0] * side).toBeLessThan(-0.2);
      // The near ankle goes out to the wall, up off the floor: a foot on it.
      expect(near.end[0] * side).toBeGreaterThan(0.3);
      expect(near.end[1]).toBeGreaterThan(0.4);
      expect(Math.abs(far.end[0])).toBeLessThan(0.2);
      // The sole turns to the wall, the top of the foot away from it.
      expect(near.tilt * side).toBeLessThan(-1);
      // The far arm is held out wide, away from the wall.
      const out = (side < 0 ? j.arms : [...j.arms].reverse())[1];
      expect(out.end[0] * side).toBeLessThan(-0.7);
    }
  });

  it('slides on its back hip: low, the torso laid back, the lead leg out ahead, a hand on the floor', () => {
    const j = look(hold({ mode: MODE.SLIDE, vz: -8 }, 90));
    expect(j.pelvis[1]).toBeLessThan(0.3);
    expect(j.spine[2]).toBeLessThan(-0.6);
    expect(j.head[1]).toBeLessThan(0.7);
    const lead = j.legs.reduce((a, b) => (a.end[2] > b.end[2] ? a : b));
    expect(lead.end[2]).toBeGreaterThan(0.5);
    expect(lead.end[1]).toBeLessThan(0.5);
    // One hand trails low behind, the other reaches ahead.
    const [low, high] = [...j.arms].sort((a, b) => a.end[1] - b.end[1]);
    expect(low.end[1]).toBeLessThan(0.15);
    expect(low.end[2]).toBeLessThan(high.end[2]);
  });

  it('turns to its heading in a slide, a dash and a wall-run, and keeps its look otherwise', () => {
    // Looking left, going forward.
    const [slide, walk] = [
      hold({ mode: MODE.SLIDE, vz: -8, yaw: 1.2 }, 90),
      hold({ vz: -4, yaw: 1.2 }, 90),
    ];
    expect(slide.yaw).toBeCloseTo(0, 1);
    expect(walk.yaw).toBeCloseTo(1.2, 5);
  });

  it('crouches: the hips low, the knees bent, the torso forward', () => {
    const j = look(hold({ mode: MODE.CROUCH, vz: -2 }, 90));
    expect(j.pelvis[1]).toBeGreaterThan(0.35);
    expect(j.pelvis[1]).toBeLessThan(0.6);
    expect(j.spine[2]).toBeGreaterThan(0.3);
  });

  it('keeps each bone its length in every move: no limb stretches', () => {
    for (const o of [
      {},
      { vz: -9 },
      { mode: MODE.SLIDE, vz: -8 },
      { mode: MODE.AIR, ground: false, vy: 5 },
      HANGS,
      { dash: DASH_BURST, vz: -14 },
    ]) {
      const j = look(hold(o, 60));
      for (const [l, a, b] of [
        ...j.arms.map(l => [l, 0.31, 0.27] as const),
        ...j.legs.map(l => [l, 0.43, 0.38] as const),
      ]) {
        expect(dist(l.root, l.mid)).toBeCloseTo(a, 2);
        expect(dist(l.mid, l.end)).toBeCloseTo(b, 2);
      }
    }
  });
});

describe('soldier', () => {
  const GREEN = [0.1, 0.8, 0.2];
  /** A runner that has held the state, set down at (5, y, -3) to be measured. */
  const draw = (o?: Partial<PlayerState>, lod = 1, n = 60) => {
    const r = hold({ ...o }, n);
    r.p.z = -3;
    return build(out => soldier(out, r, GREEN, lod));
  };
  const build = (f: (out: number[]) => void) => {
    const out: number[] = [];
    f(out);
    return out;
  };
  /** Vertices of a model, as [x, y, z, layer, r, g, b] after the position and normal. */
  const rows = (v: number[]) =>
    Array.from({ length: v.length / STRIDE }, (_, i) => {
      const k = i * STRIDE;
      return [v[k], v[k + 1], v[k + 2], v[k + 8], v[k + 6], v[k + 7], v[k + 9]];
    });
  const dyed = (v: number[][], c: number[]) =>
    v.filter(p => p[4] == c[0] && p[5] == c[1] && p[6] == c[2]);
  const MOVES: Partial<PlayerState>[] = [
    {},
    { vz: -9 },
    { vz: -5, yaw: 2 },
    { mode: MODE.AIR, ground: false, vy: 5, vz: -6 },
    { mode: MODE.AIR, ground: false, vy: -8, vz: -6 },
    { dash: DASH_BURST, vz: -14 },
    HANGS,
    { ...HANGS, mode: MODE.CLIMB, y: 1.6 },
    { mode: MODE.WALLRUN, ground: false, wall: SIDE.WEST, vz: -8 },
    { mode: MODE.SLIDE, vz: -8 },
    { mode: MODE.CROUCH, vz: -2 },
  ];

  it('stays under 2500 vertices near and about half of that far, in every move, as whole triangles', () => {
    for (const o of MOVES) {
      const [near, far] = [1, 0].map(lod => draw(o, lod).length / STRIDE);
      expect(near).toBeLessThan(2500);
      expect(near).toBeGreaterThan(1500);
      expect(far).toBeLessThan(near * 0.55);
      expect(near % 3).toBe(0);
      expect(far % 3).toBe(0);
    }
  });

  it('adds only the streaks to a dash, and glows them', () => {
    const plain = draw({ vz: -14 }).length / STRIDE;
    const dash = rows(draw({ dash: DASH_BURST, vz: -14 }));
    const glow = dash.filter(p => p[3] == -2);
    expect(glow.length).toBeGreaterThan(15);
    expect(dash.length - glow.length).toBe(plain);
    expect(draw({ vz: -14 }).length / STRIDE).toBe(plain);
    expect(rows(draw({ vz: -14 })).every(p => p[3] == -1)).toBe(true);
    // They trail behind the runner: the way it came from, +z.
    expect(Math.min(...glow.map(p => p[2]))).toBeGreaterThan(-3 - 0.4);
  });

  it('has finite vertices and unit normals, in every move', () => {
    for (const o of MOVES) {
      for (const lod of [0, 1]) {
        const v = draw({ ...o, yaw: 1 }, lod);
        for (let i = 0; i < v.length; i += STRIDE) {
          expect(v.slice(i, i + STRIDE).every(Number.isFinite)).toBe(true);
          expect(Math.hypot(v[i + 3], v[i + 4], v[i + 5])).toBeCloseTo(1);
        }
      }
    }
  });

  it('stands PLAYER_H tall on its feet, all inside PLAYER_R when standing, at every level', () => {
    for (const lod of [0, 1]) {
      const v = rows(draw(undefined, lod));
      expect(Math.min(...v.map(p => p[1]))).toBeCloseTo(1, 1);
      expect(Math.max(...v.map(p => p[1]))).toBeCloseTo(1 + PLAYER_H, 1);
      expect(Math.max(...v.map(p => p[1]))).toBeLessThanOrEqual(1 + PLAYER_H + 1e-6);
      for (const p of v) {
        expect(Math.hypot(p[0] - 5, p[2] + 3)).toBeLessThan(PLAYER_R);
      }
    }
  });

  it('is a runner: the jacket in the colour, dark trousers, skin, hair and light shoes', () => {
    const v = rows(draw());
    const jacket = dyed(v, GREEN);
    expect(jacket.length).toBeGreaterThan(300);
    expect(Math.min(...jacket.map(p => p[1]))).toBeGreaterThan(1 + 0.6);
    expect(Math.max(...jacket.map(p => p[1]))).toBeLessThan(1 + 1.55);
    const legs = v.filter(p => p[1] < 1 + 0.8);
    expect(dyed(legs, GREEN)).toHaveLength(0);
    expect(legs.filter(p => p[4] + p[5] + p[6] < 0.6).length).toBeGreaterThan(300);
    expect(dyed(v, SKIN).length).toBeGreaterThan(100);
    expect(dyed(v, SOLE).length).toBeGreaterThan(30);
    const head = v.filter(p => p[1] > 1 + 1.55);
    expect(head.length).toBeGreaterThan(100);
    expect(dyed(head, SKIN).length).toBeGreaterThan(30);
    expect(head.some(p => p[4] + p[5] + p[6] < 0.35)).toBe(true);
  });

  it('turns with its yaw: the shades, at the front of the face, go where it looks', () => {
    const shades = (yaw: number) =>
      rows(draw({ yaw })).filter(p => p[1] > 1 + 1.55 && p[4] + p[5] + p[6] < 0.15);
    const [a, b] = [shades(0), shades(Math.PI / 2)];
    const mean = (v: number[][], i: number) => v.reduce((s, p) => s + p[i], 0) / v.length;
    expect(a.length).toBeGreaterThan(10);
    expect(mean(a, 2) + 3).toBeLessThan(-0.05);
    expect(Math.abs(mean(a, 0) - 5)).toBeLessThan(0.01);
    expect(mean(b, 0) - 5).toBeLessThan(-0.05);
    expect(Math.abs(mean(b, 2) + 3)).toBeLessThan(0.01);
  });

  it('draws the hands at the ledge in the world when hanging', () => {
    const v = rows(draw(HANGS));
    // The skin above the head: the two hands, at the top of the ledge, 2 m above the feet.
    const hands = dyed(v, SKIN).filter(p => p[1] > 1 + 1.85);
    expect(hands.length).toBeGreaterThan(20);
    expect(Math.max(...hands.map(p => p[1]))).toBeLessThan(1 + 2.2);
    // Ahead, toward the wall (-z) of the player at z = -3.
    expect(hands.every(p => p[2] < -3)).toBe(true);
  });

  it('draws the sole on the wall in a wall-run', () => {
    // On a wall to the left (-x): the lowest part of the near shoe is turned toward it.
    const v = rows(draw({ mode: MODE.WALLRUN, ground: false, wall: SIDE.WEST, vz: -8 }));
    const soles = dyed(v, SOLE);
    const left = soles.filter(p => p[0] < 5 - 0.25);
    expect(left.length).toBeGreaterThan(20);
    // The sole is a flat patch facing the wall: little spread in x, a lot in the other axes.
    const sx = Math.max(...left.map(p => p[0])) - Math.min(...left.map(p => p[0]));
    const sz = Math.max(...left.map(p => p[2])) - Math.min(...left.map(p => p[2]));
    expect(sx).toBeLessThan(sz);
  });
});
