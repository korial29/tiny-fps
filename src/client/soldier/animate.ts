import { strike } from '../../shared/blade';
import { EXEC, TICK_HZ } from '../../shared/constants';
import { KITS, ROLE } from '../../shared/kit';
import type { Choice, PlayerState, Rover } from '../../shared/types';
import type { World } from '../../shared/world';
import type { Tracer } from '../beams';
import { inv, reach } from '../body';
import { dashing, felled } from '../expression';
import { EXECUTE, FEAST, PUMMEL, eating, mounted, pummeling } from '../feast';
import { bare, blowOf, blowing, frame, thrown } from '../gait';
import { focus, holdOf, tiltOf } from '../gun';
import { handsFree, unfold } from '../hunter';
import { progress } from '../katana';
import { ground, track } from '../limbs';
import type { Vec3 } from '../mesh';
import { JOINT as J, mul, slerp, solve } from '../rig';
import type { Pose } from '../rig';
import { DASH_RATE, far } from './common';
import { CLOSE, fried, grasp } from './grasp';
import { AIMING, GRIN, HURT, MAD, createRunner, floorOf, same, seatOf, watched } from './runner';
import type { Runner } from './types';

/** A blow taken: seconds it lasts, and how far it throws the head and the chest back (radians). */
export const FLINCH = [0.35, 0.45, 0.12];

export const animate = (
  book: Map<number, Runner>,
  others: PlayerState[],
  dt: number,
  world?: World,
  tracer?: Pick<Tracer, 'shock' | 'spit'> & Partial<Pick<Tracer, 'gore'>>,
  rovers?: Rover[],
  builds?: ReadonlyMap<number, number>,
  looks?: ReadonlyMap<number, Choice>,
) => {
  for (const id of book.keys()) {
    if (!others.some(p => p.id == id)) {
      book.delete(id);
    }
  }
  for (const shown of others) {
    // The Hunter's shoulder cannon leaves his hands free: his arms move as with no weapon.
    const p = looks?.get(shown.id)?.role === ROLE.HUNTER ? handsFree(shown) : shown;
    const seen = book.get(p.id);
    if (seen) {
      const w = watched(p, others, seen.watching);
      seen.watch = w?.at;
      seen.watching = w?.id;
    }
    const build = builds?.get(p.id) ?? 0;
    const look = looks?.get(p.id);
    // A roster that says another body or look than the one drawn (it came after him): a new runner.
    const old = book.get(p.id);
    const r = old?.build == build && same(old.look, look) ? old : undefined;
    const seat = seatOf(p, rovers);
    if (r) {
      r.seat = seat;
      const floor = world && floorOf(world, p.y);
      r.gait.update(p, dt, floor, seat);
      r.fours?.update(p, dt, floor);
      r.dash += (+dashing(p) - r.dash) * (1 - Math.exp(-dt * DASH_RATE));
      r.since = p.shots == r.p.shots && !p.zapping ? r.since + dt : 0;
      // A shot raises the gun at once, so that it points at the shot when the beam is drawn.
      r.aim = r.since == 0 ? 1 : r.aim + (+(r.since < AIMING) - r.aim) * (1 - Math.exp(-dt * 12));
      r.focus = r.since < AIMING ? (world ? focus(p, world)[0] : far(p)) : r.focus;
      r.prog = progress(r.prog, p, dt);
      r.parry += dt;
      r.cannon = unfold(r.cannon, !!shown.railed && !p.down, dt);
      // Put down by the bolt: a burst of sparks, then more as he comes apart.
      const k = fried(p);
      if (k > 0 && k < 1) {
        if (!r.p.fried) {
          tracer?.shock([p.x, p.y + 1, p.z]);
        }
        for (let i = 0; i < 3; i++) {
          const h = (r.t * 7.3 + i * 0.37) % 1;
          tracer?.spit([p.x + Math.sin(h * 40) * 0.3, p.y + 1.8 * h, p.z + Math.cos(h * 40) * 0.3]);
        }
      }
      r.trail.update(dt);
      r.t += dt;
      r.hurt = p.hp < r.p.hp ? HURT : Math.max(r.hurt - dt, 0);
      r.mad = p.hp < r.p.hp || p.stun > r.p.stun ? MAD : Math.max(r.mad - dt, 0);
      r.grin = felled(r.p, p, id => book.get(id)?.p, others) ? GRIN : Math.max(r.grin - dt, 0);
      r.dt += dt;
      const xeno = r.look?.role === ROLE.XENO;
      r.jab += (thrown(p, xeno) - r.jab) * (1 - Math.exp(-dt * 45));
      const g = grasp(p, r.seat, r.look?.role === ROLE.HUNTER);
      r.curls = r.curls.map((c, i) => c + (g[i] - c) * (1 - Math.exp(-dt * CLOSE)));
      r.blow = thrown(p, xeno) > 0 ? blowOf(p, xeno) : r.blow;
      r.flinch = Math.max(r.flinch - dt / FLINCH[0], 0);
      // A glory kill: the two locked, a xenomorph and its prey; after it, it slides off him. Or the
      // katana's execution (exec): the other one is where the victim faces.
      const foe = p.lock && p.foe !== undefined ? others.find(q => q.id == p.foe) : undefined;
      const mate = foe && !p.exec && xeno != (book.get(foe.id)?.look?.role === ROLE.XENO);
      if (mate) {
        [r.mate, r.mount] = [foe.id, mounted(p.lock!)];
        r.size = KITS[book.get(foe.id)?.look?.role ?? ROLE.MARINE].size;
      } else {
        r.mount = Math.max((r.mount ?? 0) - dt / FEAST.DROP, 0);
      }
      const on = r.mount ? others.find(q => q.id == r.mate) : p.exec ? foe : undefined;
      r.with = on && [on.x, on.y, on.z];
      // Its prey's hands go on its belly as it was last drawn; it eats on a while after the kill.
      r.bust = !xeno && r.mount ? book.get(r.mate!)?.s?.pos[J.SPINE] : undefined;
      const fed = r.feed;
      r.feed =
        xeno && r.p.lock && !p.lock && r.mount ? FEAST.FEED[0] : Math.max((r.feed ?? 0) - dt, 0);
      // Done eating, its head comes up the rest of the way slowly (FEAST.LOW).
      r.low = fed && !r.feed ? FEAST.LOW[1] : Math.max((r.low ?? 0) - dt, 0);
      // Where its prey was as it last held him: it stays turned to him while it eats on.
      r.fedOn = xeno && r.with ? r.with : r.feed ? r.fedOn : undefined;
      // The execution's blood: a spurt on the cut down, a burst as his head goes, then the neck.
      // His body tips over from his knee, before the swordsman he knelt to (r.slain).
      const victim = (q: PlayerState) => q.exec === EXEC.VICTIM && !!q.lock;
      r.slain = p.down && r.slain ? { ...r.slain, t: r.slain.t + dt } : undefined;
      if (victim(r.p) && p.down && r.killer) {
        r.slain = { at: r.killer, t: 0 };
      }
      // The xenomorph's prey, let go of as his head goes: he falls on his side from where it
      // held him, about his right foot.
      if (!xeno && r.p.lock && !r.p.exec && p.down && r.mount && r.with) {
        r.slain = { at: r.with, t: 0, pivot: J.FOOT_R };
      }
      r.killer = victim(p) ? r.with : undefined;
      // Kneeling to fists (a killer with no katana in hand): blood and no sparks, his head burst.
      r.fist = victim(p) ? !!foe && !foe.wield : !!r.fist && !!p.down;
      if (victim(p) && victim(r.p)) {
        const was = EXEC.TICKS - r.p.lock! < EXECUTE.KNEEL[0];
        if (was && EXEC.TICKS - p.lock! >= EXECUTE.KNEEL[0]) {
          const chest: Vec3 = [p.x, p.y + (r.fist ? 1.05 : 1.25), p.z];
          tracer?.gore?.(chest, r.fist ? PUMMEL.SPURT[0] : EXECUTE.WOUND, 2.5);
          if (r.fist) {
            tracer?.gore?.([p.x, p.y + 1.5, p.z], PUMMEL.SPURT[1], 1.5);
          } else {
            tracer?.shock(chest);
          }
        }
      }
      if (victim(r.p) && p.down) {
        const head = r.s?.pos[J.HEAD];
        const neck: Vec3 =
          r.fist && head ? [head[0], head[1] + 0.1, head[2]] : [p.x, p.y + 1.05, p.z];
        if (r.fist) {
          tracer?.gore?.(neck, PUMMEL.BURST[0], PUMMEL.BURST[1]);
        } else {
          tracer?.gore?.(neck, EXECUTE.NECK, 3.5);
          tracer?.shock(neck);
        }
        r.bleed = EXECUTE.BLEEDING;
      }
      // The katana's execution's swordsman: his ticks into it, smoothed, and on past the kill.
      if (p.exec === EXEC.KILLER && p.lock && p.wield && !p.down) {
        const e = EXEC.TICKS - p.lock;
        const was = r.exe ?? -Infinity;
        r.exe = Math.abs(was - e) > 6 ? e : Math.min(Math.max(was + dt * TICK_HZ, e - 1), e + 1);
      } else if (r.exe !== undefined) {
        const off = r.exe < EXEC.TICKS - 3 || p.down || r.exe > EXEC.TICKS + 40;
        r.exe = off ? undefined : r.exe + dt * TICK_HZ;
      }
      // The fists' execution's killer: his ticks into it, smoothed, his victim's belly and head as
      // last drawn; after the kill they run on for the follow-through, kept where they were.
      if (pummeling(p) && foe && !p.down) {
        const e = EXEC.TICKS - p.lock!;
        const was = r.pum ?? -Infinity;
        r.pum = Math.abs(was - e) > 6 ? e : Math.min(Math.max(was + dt * TICK_HZ, e - 1), e + 1);
        const v = book.get(foe.id)?.s?.pos;
        const copy = (j: number): Vec3 | undefined => v && [v[j][0], v[j][1], v[j][2]];
        r.prey = { feet: [foe.x, foe.y, foe.z], belly: copy(J.SPINE), head: copy(J.HEAD) };
      } else if (r.pum !== undefined) {
        // Cut short (either went down first): no blow at the air.
        const on = r.pum >= EXEC.TICKS - 3 && !p.down;
        r.pum = on ? r.pum + dt * TICK_HZ : undefined;
        r.pum = r.pum! > EXEC.TICKS + PUMMEL.AFTER[0] + PUMMEL.AFTER[1] ? undefined : r.pum;
      }
      if (r.bleed && r.cut?.at) {
        r.bleed = Math.max(r.bleed - dt, 0);
        r.gore = (r.gore ?? 0) + EXECUTE.BLEED * dt;
        tracer?.gore?.(r.cut.at, Math.floor(r.gore), 1.5);
        r.gore %= 1;
      }
      // Its prey's blood as it eats: spurting from his head, a burst as it goes.
      if (xeno && on) {
        const head: Vec3 = [on.x, on.y + 1.55, on.z];
        if (r.p.lock && !p.lock) {
          tracer?.gore?.(head, FEAST.GORE[1], 3.5);
        }
        r.gore = (r.gore ?? 0) + eating(p.lock ?? 0, r.mount) * FEAST.GORE[0] * dt;
        tracer?.gore?.(head, Math.floor(r.gore), 2.5);
        r.gore %= 1;
        // And from his thighs, where its feet grip them, a leg at a time, dripping down.
        if (p.lock) {
          const [rate, across, up] = FEAST.GRIP;
          const [dx, dz] = [on.x - p.x, on.z - p.z];
          const d = Math.hypot(dx, dz) || 1;
          r.grip = (r.grip ?? 0) + rate * r.mount * dt;
          for (; r.grip >= 1; r.grip--) {
            const side = (r.drops = (r.drops ?? 0) + 1) % 2 ? across : -across;
            tracer?.gore?.([on.x - (dz / d) * side, on.y + up, on.z + (dx / d) * side], 1, 0.5);
          }
        }
      }
      // A blow of his fists the host counted: the nearest he reaches, in his arc, flinches.
      const hit = world && bare(p) && p.hits != r.p.hits && p.swing;
      if (hit) {
        const near = strike(
          world,
          p,
          others.filter(q => q.id != p.id),
          blowing(p, xeno),
        );
        const d = (q: PlayerState) => (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
        const foe = near.sort((a, b) => d(a) - d(b))[0];
        const fr = foe && book.get(foe.id);
        if (fr) {
          fr.flinch = 1;
        }
      }
      r.p = { ...p };
    } else {
      book.set(p.id, createRunner(p, seat, build, look));
    }
    track(book.get(p.id)!, dt, ground(world, p.y), !r, tracer);
  }
};

/** The pose with the right arm `k` of the way to holding the gun's grip at `grip`, its axes `ax` (aimed(), shouldered()). */
export const lifted = (
  pose: Pose,
  s: ReturnType<typeof solve>,
  [grip, ax]: [Vec3, Vec3[]],
  k: number,
  kind = 0,
): Pose => {
  const rot = pose.rot.slice();
  const q = { ...pose, rot };
  // The grip's tilt and place in the hand, as the weapon's kind has them (tiltOf(), holdOf()).
  const [tilt, [far, palm]] = [tiltOf(kind), holdOf(kind)];
  const [uh, fh] = [ax[0], ax[2].map((v, i) => v * tilt[1] - ax[1][i] * tilt[0]) as Vec3];
  const wrist = grip.map((v, i) => v - far * fh[i] + palm * uh[i]) as Vec3;
  const pole: Vec3 = [uh[0] * 0.7, -1, uh[2] * 0.7];
  reach(
    q,
    s,
    J.ARM_R,
    wrist.map((v, i) => s.pos[J.HAND_R][i] + (v - s.pos[J.HAND_R][i]) * k) as Vec3,
    pole,
  );
  rot[J.HAND_R] = slerp(rot[J.HAND_R], mul(inv(solve(q).rot[J.FOREARM_R]), frame(uh, fh)), k);
  return q;
};
