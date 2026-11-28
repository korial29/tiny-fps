// The scars a melee hit leaves (the user, 2026-11-28: bright yellow and orange marks where he is
// hit): a glowing gash on the victim's chest along the blade's way, white hot, then yellow and
// orange, cooling to an ember over SCAR_LIFE seconds. Each is kept in the runner's own frame (his
// feet, turned with his yaw), so it goes with him; gone when he is down. No DOM, no GL.
import { BLOW } from '../../shared/constants';
import { CUT } from '../../shared/types';
import { heightOf } from '../../shared/physics';
import type { PlayerState } from '../../shared/types';
import type { Vec3 } from '../mesh';
import type { Out } from '../verts';
import {
  CHEST_AT,
  CLAW_GAP,
  HEAT,
  HEAVY_SCAR,
  SCAR,
  SCAR_LIFE,
  SCARS_MAX,
  SKIN,
} from './constants';
import type { Kind } from './hits';

/** A gash: its ends and its outward normal in the runner's frame, its half width, its age. */
interface Scar {
  a: Vec3;
  b: Vec3;
  n: Vec3;
  w: number;
  age: number;
}

/** `v` turned `yaw` radians round y: yaw 0 faces -z, as forward() has it. */
export const turnY = ([x, y, z]: Vec3, yaw: number): Vec3 => {
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  return [x * c + z * s, y, -x * s + z * c];
};

/** The colour of a scar `age` seconds old, between the HEAT keys. */
export const heat = (age: number): number[] => {
  // Past the last key, the last colour.
  const next = HEAT.findIndex(k => k[0] > age);
  const i = next < 0 ? HEAT.length - 1 : Math.max(0, next - 1);
  const [a, b] = [HEAT[i], HEAT[Math.min(i + 1, HEAT.length - 1)]];
  const k = b[0] > a[0] ? Math.min(1, (age - a[0]) / (b[0] - a[0])) : 1;
  return [1, 2, 3].map(j => a[j] + (b[j] - a[j]) * k);
};

/**
 * The way the blow of `by` goes across the victim, in the world, unit: a cut across from high on
 * the side it starts on to low on the other, a slash straight down, a thrust (and the tail's stab)
 * a point: a short cross. `side` 1 goes from the attacker's left to his right.
 */
export const strokeOf = (
  by: PlayerState,
  kind: Kind,
): { d: Vec3; side: number; point: boolean } => {
  const c = by.cut ?? 0;
  const side =
    kind === 'claw'
      ? c === BLOW.CLAW_L
        ? 1
        : c === BLOW.CLAW_R
          ? -1
          : 0
      : c === CUT.LEFT || c === CUT.ARC_L
        ? 1
        : c === CUT.RIGHT || c === CUT.ARC_R
          ? -1
          : 0;
  const right: Vec3 = [Math.cos(by.yaw), 0, -Math.sin(by.yaw)];
  const d: Vec3 = side
    ? [right[0] * side, -0.6, right[2] * side]
    : [right[0] * 0.15, -1, right[2] * 0.15];
  const l = Math.hypot(...d);
  const point = kind === 'blade' ? c === CUT.THRUST || c === CUT.LUNGE : side === 0 && c === 0;
  return { d: d.map(v => v / l) as Vec3, side, point };
};

export const createScars = () => {
  const book = new Map<number, Scar[]>();
  return {
    /** The blow of `by` (of `kind`) on `victim`, as both stand now: its gash, or the claws' three. */
    add(by: PlayerState, victim: PlayerState, kind: Kind) {
      const { d, point } = strokeOf(by, kind);
      // Out of his axis toward the attacker, at the chest, a little up or down each time.
      const [ux, uz] = [by.x - victim.x, by.z - victim.z];
      const ul = Math.hypot(ux, uz) || 1;
      const n: Vec3 = [ux / ul, 0, uz / ul];
      const h = heightOf(victim) * (CHEST_AT + 0.08 * (Math.random() - 0.5));
      const along = (Math.random() - 0.5) * 0.12;
      const t: Vec3 = [-n[2], 0, n[0]];
      const mid: Vec3 = [n[0] * SKIN + t[0] * along, h, n[2] * SKIN + t[2] * along];
      // The way across, flattened onto the skin: no part of it into him or out of him.
      const dn = d[0] * n[0] + d[2] * n[2];
      const flat: Vec3 = [d[0] - n[0] * dn, d[1], d[2] - n[2] * dn];
      const fl = Math.hypot(...flat) || 1;
      const len = SCAR[0] * (by.heavy ? HEAVY_SCAR : 1) * (point ? 0.35 : 1);
      const ways: Vec3[] = point
        ? [
            [t[0] * 0.7, 0.7, t[2] * 0.7],
            [-t[0] * 0.7, 0.7, -t[2] * 0.7],
          ]
        : [flat.map(v => v / fl) as Vec3];
      const offsets = kind === 'claw' && !point ? [-CLAW_GAP, 0, CLAW_GAP] : [0];
      const list = book.get(victim.id) ?? [];
      const yaw = victim.yaw;
      for (const w of ways) {
        // Across the stroke, on the skin: the claws' streaks side by side.
        const across: Vec3 = [
          n[1] * w[2] - n[2] * w[1],
          n[2] * w[0] - n[0] * w[2],
          n[0] * w[1] - n[1] * w[0],
        ];
        for (const o of offsets) {
          const c: Vec3 = [0, 1, 2].map(i => mid[i] + across[i] * o) as Vec3;
          const a: Vec3 = [0, 1, 2].map(i => c[i] - (w[i] * len) / 2) as Vec3;
          const b: Vec3 = [0, 1, 2].map(i => c[i] + (w[i] * len) / 2) as Vec3;
          list.push({
            a: turnY(a, -yaw),
            b: turnY(b, -yaw),
            n: turnY(n, -yaw),
            w: SCAR[1] * (kind === 'claw' ? 0.7 : 1),
            age: 0,
          });
        }
      }
      book.set(victim.id, list.slice(-SCARS_MAX * offsets.length));
    },
    update(dt: number, players: PlayerState[]) {
      for (const [id, list] of book) {
        const p = players.find(q => q.id === id);
        const left = p && !p.down ? list.filter(s => (s.age += dt) < SCAR_LIFE) : [];
        if (left.length) {
          book.set(id, left);
        } else {
          book.delete(id);
        }
      }
    },
    /** Appends the scars of `players` as drawn, in the vertex format of mesh.ts: unlit lenses, both faces. */
    draw(out: Out, players: PlayerState[]) {
      for (const p of players) {
        const list = book.get(p.id);
        if (!list || p.down) {
          continue;
        }
        for (const s of list) {
          const at = (v: Vec3): Vec3 => {
            const r = turnY(v, p.yaw);
            return [p.x + r[0], p.y + r[1], p.z + r[2]];
          };
          const [a, b, n] = [at(s.a), at(s.b), turnY(s.n, p.yaw)];
          const k = s.age / SCAR_LIFE;
          // Narrower as it cools.
          const w = s.w * (1 - 0.5 * k);
          const m = a.map((v, i) => (v + b[i]) / 2);
          const ab = b.map((v, i) => v - a[i]);
          const x: Vec3 = [
            n[1] * ab[2] - n[2] * ab[1],
            n[2] * ab[0] - n[0] * ab[2],
            n[0] * ab[1] - n[1] * ab[0],
          ];
          const xl = Math.hypot(...x) || 1;
          const l = m.map((v, i) => v + (x[i] / xl) * w) as Vec3;
          const r = m.map((v, i) => v - (x[i] / xl) * w) as Vec3;
          const c = heat(s.age);
          for (const v of [a, l, b, a, b, r, a, b, l, a, r, b]) {
            out.push(...v, n[0], n[1], n[2], c[0], c[1], -2, c[2]);
          }
        }
      }
    },
  };
};
