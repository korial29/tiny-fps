import { HEAT_MAX } from '../../shared/constants';
import { ROLE } from '../../shared/kit';
import { floored } from '../../shared/physics';
import { LIMB } from '../../shared/types';
import { PAD, SASH, armor } from '../armor';
import { RAKE, hands, inv, stowed } from '../body';
import { cigar } from '../cigar';
import { dashing, strain } from '../expression';
import { toneFor } from '../features';
import { flesh } from '../flesh';
import { axes, cellsOf, grip, handOf, held, kindOf, span, swapOf, tip } from '../gun';
import { HEAD_SCALE, STYLE, hair, styleOf, sway } from '../hair';
import { helm } from '../helm';
import { helmet } from '../helmet';
import {
  CANNON_MUZZLE,
  DISC_HOLD,
  DISC_HOOK,
  DISC_SPREAD,
  blendHunter,
  drawDisc,
  drawHarpoon,
  harpoonFeed,
  hunterPose,
  stripSwing,
} from '../hunter';
import { PARRY_IN, cutting, ends as swordEnds, held as sword } from '../katana';
import { piece } from '../limbs';
import { CLOTH, dress, mask } from '../mask';
import { CHITIN, STRIDE, TWILL, WEAVE, add, basis } from '../mesh';
import type { Vec3 } from '../mesh';
import { CUP_F, crotch, hose, pack } from '../pack';
import { pads } from '../pads';
import { pouch } from '../pouch';
import { JOINT as J, axis, mul, turn } from '../rig';
import type { Quat, solve } from '../rig';
import { blades, drape } from '../sash';
import {
  REGION,
  beardOf,
  beast,
  body,
  capOf,
  cut,
  eyesOf,
  hairOf,
  palette,
  skin,
  swing,
  tressOf,
} from '../skin';
import type { Skin } from '../skin';
import { ID, ORIGIN, mesh } from '../store';
import type { Pieces } from '../store';
import { room } from '../verts';
import type { Out } from '../verts';
import { CHITIN_X, FOOT_TIP, HEAD, PART, PIPE, SHELL, lashOf, partsOf, tail } from '../xeno';
import type { Part } from '../xeno';
import { ease } from './carry';
import { RAW } from './common';
import { dissolve, driving, fried, streaks } from './grasp';
import {
  cannonOf,
  hunterAt,
  hunterKey,
  hunterPieces,
  hunterTrail,
  placeHunterPart,
} from './hunter';
import type { HunterLod } from './hunter';
import { HURT, MAD, WATCH } from './runner';
import { stance } from './stance';
import type { Runner } from './types';

/**
 * The runner's hands on his wrists (hands() in body.ts), the fingers closed as r.curls says: none
 * far, where the skin's sleeves end in mittens; lighter near. A space suit's gloves cover the
 * fingertips. Not the hand of an arm a cut took off.
 */
const gloves = (
  out: Out,
  r: Runner,
  s: ReturnType<typeof solve>,
  colors: number[][],
  lod: number,
  suit: boolean,
  limb: number = LIMB.NONE,
  lights = false,
  claws = false,
) => {
  if (!lod) {
    return;
  }
  const { p } = r;
  const glove = colors[REGION.GLOVE];
  hands(
    out,
    s,
    r.build ?? 0,
    claws ? r.curls.map(c => Math.min(c, RAKE)) : r.curls,
    glove,
    suit ? glove : colors[REGION.FLESH],
    // The left thumb up the rifle's handguard; the marine's lit buttons on the wrists.
    {
      // The Hunter's disc (`rifled`) is in one hand: no left hand on a handguard.
      cup: +(!!p.rifled && r.look?.role !== ROLE.HUNTER && !p.down && !floored(p) && !driving(r)),
      lights,
      claws,
      spread: p.rifled && r.look?.role === ROLE.HUNTER ? DISC_SPREAD : 1,
      hook: p.rifled && r.look?.role === ROLE.HUNTER ? DISC_HOOK : 0,
    },
    lod < 3,
    limb == LIMB.ARM_L ? J.HAND_L : limb == LIMB.ARM_R ? J.HAND_R : -1,
  );
};

/** The xenomorph's legs and arms (partsOf()): the shin, foot, toe and upper arm joints, left then right. */
const LIMBS_X = [
  [J.SHIN_L, J.FOOT_L, J.TOE_L, J.ARM_L],
  [J.SHIN_R, J.FOOT_R, J.TOE_R, J.ARM_R],
];

/** The ninja's boots: black cloth, a shade lighter than his suit so they show on it. */
const BOOT = [0.06, 0.06, 0.066];

/** Draws the runner and gives back its solved skeleton, or nothing once a bolt has burnt it away. */
export const soldier = (
  out: Out,
  r: Runner,
  color: number[],
  lod = 1,
  helmets = false,
  armored = helmets,
  /** The frame's pieces of the store: the rigid ones go there (store.ts), but on one coming apart. */
  list?: Pieces,
) => {
  const { p } = r;
  const k = fried(p);
  if (k >= 1) {
    return;
  }
  // A body coming apart stays posed by the shader, which burns it away (Fz, dissolve()): skinned
  // on the CPU, it cost 5 to 75 ms a frame for the bolt's 0.9 s.
  const [gpu, n0] = [list, list?.length ?? 0];
  /** A rigid piece on a joint: into `out`, or made once at the origin into the store and placed there, `scale` its size. */
  const rigid = (
    key: string,
    at: Vec3,
    q: Quat,
    make: (o: Out, at: Vec3, q: Quat) => void,
    scale = 1,
    /** Armour: worn (Draw.w). */
    w = false,
    /** Too fine for a shadow (Draw.s). */
    thin = false,
  ) =>
    gpu
      ? gpu.push({ m: mesh(key, o => make(o, ORIGIN, ID)), q, t: at, k: scale, w, s: thin })
      : make(out, at, q);
  r.tip = undefined;
  const [build, picked] = [r.build ?? 0, r.look];
  // The ninja (the user, 2026-11-12): a tight black suit, his team's colour on its side stripes and
  // its belt, a hood and a guard over the mouth; an armour of his own (2026-11-13): armor.ts's
  // `alone` plates, and the shoulder pads and collar of pads.ts.
  const ninja = picked?.role === ROLE.NINJA;
  const isHunter = picked?.role === ROLE.HUNTER;
  // The xenomorph: a body of its own (beast() in skin.ts, xeno.ts) in black chitin, a glowing line
  // down its spine in the team's colour; no armour, hair or helmet.
  const xeno = picked?.role === ROLE.XENO;
  helmets &&= !xeno && !isHunter;
  const plated = armored && !xeno && !isHunter;
  armored &&= !ninja && !xeno && !isHunter;
  const colors = palette(
    ninja || xeno ? CLOTH : color,
    xeno ? CHITIN_X : build ? tressOf(p.id, picked) : hairOf(p.id, picked),
    eyesOf(p.id, picked),
    armored,
    xeno ? CHITIN_X : toneFor(p.id, picked),
    build || xeno ? 0 : beardOf(p.id),
    !!build,
  );
  if (xeno) {
    const { PANTS, UPPER, GLOVE, JACKET, TRIM, SOLE, FLESH, CAP, STRIPE, BELT, HAIR } = REGION;
    // HAIR: its carapace, the dome (CREST in skin.ts), glossy black.
    colors[HAIR] = SHELL;
    // BELT: its spine up the back, the tail's smooth black (backOf() in xeno.ts).
    for (const k of [PANTS, UPPER, GLOVE, JACKET, SOLE, BELT]) {
      colors[k] = CHITIN_X;
    }
    // The pipes up its neck are its skin's (backOf() in xeno.ts).
    [colors[TRIM], colors[FLESH], colors[CAP], colors[STRIPE]] = [
      HEAD,
      CHITIN_X.map(v => v * 0.6),
      color,
      PIPE,
    ];
  }
  if (ninja) {
    const { PANTS, UPPER, GLOVE, STRIPE, STRIPE_LOW, BELT } = REGION;
    [colors[PANTS], colors[UPPER], colors[GLOVE]] = [CLOTH, CLOTH, BOOT];
    // His boots: black cloth a shade over the suit's (the user, 2026-11-17), the sole darker.
    [colors[UPPER], colors[REGION.SOLE]] = [BOOT, BOOT.map(c => c * 0.25)];
    // His belt is cut in a V by armor() (BELT in armor.ts), the skin's under it black; the suit's
    // stripes black as it (the user, 2026-11-28: they were his team's colour, his mask is now).
    [colors[STRIPE], colors[STRIPE_LOW], colors[BELT]] = [CLOTH, CLOTH, CLOTH];
  }
  if (build && styleOf(p.id, picked) == STYLE.UNDERCUT) {
    // A shaved side: the scalp's hair is stubble, the skin showing through it.
    colors[4] = colors[4].map((v, i) => v * 0.5 + colors[3][i] * 0.42);
  }
  // The armour: white in space, else in the team's colour.
  const plate = helmets ? undefined : color;
  const marine = plated && !ninja && !!plate;
  const { s, sink, yaw, carry } = stance(r);
  r.s = s;
  // His face: a wince when hit, a grimace down, a shout in a cut or a dash, effort in a sprint or a
  // climb, focus aiming, a grin; the eyes on his aim from where the head points.
  // The head on the runner he looks at, as far as it turns; the eyes on him, or on the aim.
  const [hx, hy, hz] = s.pos[J.HEAD];
  const to =
    r.watch && turn(inv(s.rot[J.HEAD]), [r.watch[0] - hx, r.watch[1] - hy, r.watch[2] - hz]);
  const want = to
    ? [Math.atan2(to[0], -to[2]), Math.atan2(to[1], Math.hypot(to[0], to[2]))].map((a, i) =>
        Math.min(Math.max(a, -WATCH.turn[i]), WATCH.turn[i]),
      )
    : [0, 0];
  const near = 1 - Math.exp(-r.dt * WATCH.rate);
  r.gaze = (r.gaze ?? [0, 0]).map((a, i) => a + (want[i] - a) * near);
  if (Math.hypot(...r.gaze) > 1e-4) {
    s.rot[J.HEAD] = mul(
      s.rot[J.HEAD],
      mul(axis([0, 1, 0], -r.gaze[0]), axis([1, 0, 0], r.gaze[1])),
    );
  }
  const look = turn(
    inv(s.rot[J.HEAD]),
    r.watch ? [r.watch[0] - hx, r.watch[1] - hy, r.watch[2] - hz] : basis(p.yaw, p.pitch)[2],
  );
  r.face.update(r.dt, {
    down: p.down > 0,
    hurt: r.hurt / HURT,
    effort: strain(p),
    focus: Math.max(r.aim, +!!p.charge),
    shout: +(r.prog >= 0 || dashing(p) || !!r.mount),
    grin: +(r.grin > 0),
    anger: Math.min((2 * r.mad) / MAD, 1),
    gx: Math.atan2(look[0], -look[2]),
    gy: Math.atan2(look[1], Math.hypot(look[0], look[2])),
  });
  r.dt = 0;
  const blade = p.wield && !p.down && !driving(r);
  /**
   * The skin `sk` in the pose `at` with the face `face`, the armour cut out of it and the ninja's
   * hood of the build `hood`: posed by the shader (flesh.ts), or drawn into `out`.
   */
  const clad = (
    sk: Skin,
    face?: ArrayLike<number>,
    hood?: number,
    at = s,
    armour = plated || ninja,
  ) => {
    const [from, n0] = [out.length, gpu?.length ?? 0];
    if (gpu) {
      flesh(
        gpu,
        sk,
        at,
        colors,
        face,
        armour ? { fine: lod > 2, plate, accent: color, ninja, bare: !plated } : undefined,
        hood,
        p.id,
        xeno,
        ninja,
      );
      // The armour's plates are worn.
      gpu.forEach((d, i) => i >= n0 && d.f?.kind == 2 && (d.w = true));
      return;
    }
    skin(out, sk, at, colors, face);
    if (hood !== undefined) {
      // The hood painted on the head, the face under the guard pressed in.
      dress(out, from, sk, s.pos[J.HEAD], s.rot[J.HEAD], hood);
    }
    // The armour, cut out of the skin just drawn.
    if (armour) {
      armor(out, from, sk, lod > 2, plate, ninja, color, !plated);
    }
  };
  if (r.cut && !xeno) {
    const cs = cut(lod, r.cut.limb, build)[0];
    if (r.cut.eaten) {
      colors[REGION.CAP] = RAW;
    }
    // Posed by the shader as the whole body is: on the CPU, the skin of a body lying cut close by
    // took some 20 ms a frame.
    clad(cs, r.face.w);
    r.cut.at = capOf(cs, s);
    if (ninja) {
      rigid(`blades ${build}`, s.pos[J.PELVIS], s.rot[J.PELVIS], (o, a, q) =>
        blades(o, a, q, build),
      );
      drape(out, s, build, r.t, Math.hypot(p.vx, p.vz), PAD, lod);
    }
    if (!r.cut.eaten) {
      piece(
        out,
        r.cut,
        colors,
        lod,
        sink,
        r.face.w,
        armored,
        gpu && ((sk, at) => clad(sk, r.face.w, undefined, at, false)),
      );
    }
    gloves(out, r, s, colors, lod, armored, r.cut.limb, marine);
  } else {
    const from = out.length;
    if (isHunter) {
      // His own bones carried by the runner's animated skeleton (hunterPose()), one rigid piece
      // on each: the gait, the blade's cuts and the falls move him as they move the marine.
      const detail = Math.min(lod, 1) as HunterLod;
      const joints = hunterPose(s.pos, s.rot, [p.x, p.y, p.z], yaw, hunterAt);
      const rig = hunterPieces(detail);
      for (const band of rig.bands) {
        blendHunter(out, band, joints, s.rot);
      }
      for (const piece of rig.pieces) {
        // A weapon in hand is drawn there, not where it is carried; one he has not found on a rack
        // is not on him at all (the user, 2026-11-26): the harpoon, the disc, the shoulder cannon.
        if (
          (piece.harpoon && (p.ammo < 0 || (handOf(p) === 0 && !p.sided))) ||
          (piece.disc && ((p.rifle ?? -1) < 0 || p.rifled || !!p.clip)) ||
          (piece.cannon && (p.rail ?? -1) < 0)
        ) {
          continue;
        }
        if (piece.cannon) {
          const [hinge, q] = cannonOf(joints[J.CHEST], s.rot[J.CHEST], p, r.cannon);
          rigid(
            hunterKey(detail, piece),
            hinge,
            q,
            (o, position, rotation) => placeHunterPart(o, piece.vertices, position, rotation),
            1,
            true,
          );
          // Its shots are seen to leave from its muzzle (combat.ts gun()).
          if (r.cannon > 0) {
            const m = add(hinge, turn(q, CANNON_MUZZLE));
            r.tip = [m[0] - p.x, m[1] - p.y, m[2] - p.z];
          }
          continue;
        }
        // A strip under the belt hangs on its hinge, swung out of a thigh's way (stripSwing()).
        const [at, q] = piece.strip
          ? stripSwing(piece.strip, joints[J.PELVIS], s.rot[J.PELVIS], joints)
          : [joints[piece.joint], s.rot[piece.joint]];
        rigid(
          hunterKey(detail, piece),
          at,
          q,
          (o, position, rotation) => placeHunterPart(o, piece.vertices, position, rotation),
          1,
          true,
          piece.thin,
        );
      }
      if (blade) {
        const [elbow, q] = [joints[J.FOREARM_R], s.rot[J.FOREARM_R]];
        const [base, tip] = hunterTrail.map(p => add(elbow, turn(q, p)));
        r.trail.mark(base, tip, cutting(r.prog) || (r.parry >= 0 && r.parry < 2 * PARRY_IN));
      }
    } else {
      const bs = xeno ? beast(lod) : body(lod, build);
      // Under a helmet's dark visor no face shows: its channels are not worth their time.
      const face = helmets || xeno ? undefined : r.face.w;
      clad(bs, face, ninja && !helmets ? build : undefined);
    }
    if (xeno) {
      tail(
        out,
        s,
        r.t,
        Math.min(Math.hypot(p.vx, p.vz) / 18, 1),
        lashOf(p, r.t),
        color,
        lod,
        r.fours?.weight,
        p,
      );
      const part = partsOf(lod);
      const put = ({ key, make, thin }: Part, at: Vec3, q: Quat) =>
        rigid(key, at, q, make, 1, false, thin);
      for (const [shin, foot, toe, arm] of LIMBS_X) {
        put(part[PART.SHIN], s.pos[shin], s.rot[shin]);
        put(part[PART.FOOT], s.pos[foot], s.rot[foot]);
        // The toes at the foot's end, turned as the toe joint: level on a floor (prowl()).
        put(part[PART.TOES], add(s.pos[foot], turn(s.rot[foot], FOOT_TIP)), s.rot[toe]);
        put(part[PART.ELBOW], s.pos[arm + 1], s.rot[arm + 1]);
        if (lod) {
          // The windows in its thigh, on the joint over the shin's.
          put(
            part[shin == J.SHIN_L ? PART.THIGH_L : PART.THIGH_R],
            s.pos[shin - 1],
            s.rot[shin - 1],
          );
          // The disc where the shoulder ends and the arm begins.
          put(part[arm == J.ARM_L ? PART.CUFF_L : PART.CUFF_R], s.pos[arm], swing(s.rot, arm));
          // The window down the outside of its forearm.
          put(
            part[arm == J.ARM_L ? PART.FOREARM_L : PART.FOREARM_R],
            s.pos[arm + 1],
            s.rot[arm + 1],
          );
        }
      }
      put(part[PART.CHEST], s.pos[J.CHEST], s.rot[J.CHEST]);
      put(part[PART.SPINE], s.pos[J.SPINE], s.rot[J.SPINE]);
      if (lod) {
        put(part[PART.HIPS], s.pos[J.PELVIS], s.rot[J.PELVIS]);
      }
      put(part[PART.HEAD], s.pos[J.HEAD], s.rot[J.HEAD]);
      if (lod) {
        put(part[PART.FINE], s.pos[J.HEAD], s.rot[J.HEAD]);
      }
    } else if (!isHunter) {
      rigid('pouch', s.pos[J.PELVIS], s.rot[J.PELVIS], pouch);
    }
    if (ninja) {
      rigid(`blades ${build}`, s.pos[J.PELVIS], s.rot[J.PELVIS], (o, a, q) =>
        blades(o, a, q, build),
      );
      drape(out, s, build, r.t, Math.hypot(p.vx, p.vz), PAD, lod);
    }
    if (xeno && lod) {
      // Its hands in its chitin (the user, 2026-11-17: the skin's texture on them): each a rigid
      // piece on its wrist, so the texture lies on the hand's own rest place and does not swim;
      // one a step of the fingers' curl, not one a frame.
      const glove = colors[REGION.GLOVE];
      for (const j of [J.HAND_L, J.HAND_R]) {
        const i = +(j == J.HAND_R);
        const curl = Math.round(Math.min(r.curls[i], RAKE) * 20) / 20;
        rigid(`xeno hand ${lod < 3} ${i} ${curl}`, s.pos[j], s.rot[j], (o, a, q) => {
          const at: ReturnType<typeof solve> = { ...s, pos: [], rot: [] };
          [at.pos[j], at.rot[j]] = [a, q];
          const from = o.length;
          hands(
            o,
            at,
            0,
            [curl, curl],
            glove,
            // Its fingertips in the same chitin, up to the claws.
            glove,
            { claws: true },
            lod < 3,
            j == J.HAND_R ? J.HAND_L : J.HAND_R,
          );
          const v = room(o, 0);
          for (let n = from; n < o.length; n += STRIDE) {
            if (v[n + 8] == -1 && v[n + 6] == glove[0] && v[n + 9] == glove[2]) {
              v[n + 8] = CHITIN;
            }
          }
        });
      }
    } else if (ninja && lod) {
      // His hands as the xenomorph's, rigid pieces a step of the curl (the user, 2026-11-17: improve
      // the hands), so the shader's textures lie on them: the glove woven as his suit, and the
      // plate on the back of the hand and the knuckles' shell in the guard's brushed metal.
      const glove = colors[REGION.GLOVE];
      const cup = +(!!p.rifled && !p.down && !floored(p) && !driving(r));
      for (const j of [J.HAND_L, J.HAND_R]) {
        const i = +(j == J.HAND_R);
        const curl = Math.round(r.curls[i] * 20) / 20;
        rigid(
          `ninja hand ${lod < 3} ${i} ${curl} ${cup} ${build}`,
          s.pos[j],
          s.rot[j],
          (o, a, q) => {
            const at: ReturnType<typeof solve> = { ...s, pos: [], rot: [] };
            [at.pos[j], at.rot[j]] = [a, q];
            const from = o.length;
            hands(
              o,
              at,
              build,
              [curl, curl],
              glove,
              glove,
              { cup },
              lod < 3,
              j == J.HAND_R ? J.HAND_L : J.HAND_R,
            );
            const v = room(o, 0);
            for (let n = from; n < o.length; n += STRIDE) {
              if (v[n + 8] != -1) {
                continue;
              }
              const k = v[n + 6] / glove[0];
              if (Math.abs(k - 1) < 1e-6) {
                v[n + 8] = WEAVE;
              } else if (Math.abs(k - 0.72) < 1e-6 || v[n + 6] == 0.09) {
                // The plate (0.72 of the glove's colour in hand()) and the shell (its SHELL).
                [v[n + 6], v[n + 7], v[n + 9], v[n + 8]] = [SASH[0], SASH[1], SASH[2], TWILL];
              }
            }
          },
        );
      }
    } else if (!isHunter) {
      gloves(out, r, s, colors, lod, armored, LIMB.NONE, marine, xeno);
    }
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // Her hair, on her head while it is on her; tucked in under a helmet or the ninja's hood.
  if (build && !helmets && !ninja && !xeno && !isHunter && r.cut?.limb !== LIMB.HEAD) {
    const from = out.length;
    hair(
      out,
      s.pos[J.HEAD],
      s.rot[J.HEAD],
      styleOf(p.id, picked),
      tressOf(p.id, picked),
      lod,
      sway(r.gait.phase, Math.hypot(p.vx, p.vz), r.t),
      r.t,
      gpu,
    );
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // The man's cigar, not on a far runner: not under a helmet or the ninja's guard, and it drops
  // when he goes down (lying face down, it would go through the roof).
  if (lod && !build && !helmets && !ninja && !xeno && !isHunter && !p.down) {
    const from = out.length;
    const fine = lod > 2;
    rigid(`cigar ${fine}`, s.pos[J.HEAD], s.rot[J.HEAD], (o, a, q) => cigar(o, a, q, fine));
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // The ninja's pads and collar; the marine's shoulder bells.
  if (plated) {
    const from = out.length;
    const n0 = gpu?.length ?? 0;
    pads(out, s, build, ninja ? PAD : (plate ?? [0.85, 0.86, 0.88]), !ninja, color, !lod, gpu);
    // And so are the bells and the pads.
    gpu?.forEach((d, i) => i >= n0 && (d.w = true));
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  if (ninja && !helmets && r.cut?.limb !== LIMB.HEAD) {
    const from = out.length;
    if (gpu) {
      // Hers is his, smaller.
      rigid(
        `mask ${color} ${!lod}`,
        s.pos[J.HEAD],
        s.rot[J.HEAD],
        (o, a, q) => mask(o, a, q, 0, color, !lod, PAD),
        build ? HEAD_SCALE : 1,
      );
    } else {
      mask(out, s.pos[J.HEAD], s.rot[J.HEAD], build, color, !lod, PAD);
    }
    if (k > 0) {
      dissolve(out, from, k);
    }
  }
  // The helmet is on the head: not on one a katana cut has taken off.
  if (helmets && r.cut?.limb !== LIMB.HEAD) {
    if (build) {
      // Hers is another helmet, with no hose: told from his at a glance.
      rigid(
        `helm ${color} ${lod}`,
        s.pos[J.HEAD],
        s.rot[J.HEAD],
        (o, a, q) => helm(o, a, q, color, lod),
        1,
        true,
      );
    } else {
      rigid(
        `helmet ${color} ${lod}`,
        s.pos[J.HEAD],
        s.rot[J.HEAD],
        (o, a, q) => helmet(o, a, q, color, lod),
        1,
        true,
      );
      hose(out, s.pos[J.HEAD], s.rot[J.HEAD], s.pos[J.CHEST], s.rot[J.CHEST], lod);
    }
  }
  // The life support pack on the back of a space suit.
  if (helmets) {
    rigid(
      `pack ${color} ${lod}`,
      s.pos[J.CHEST],
      s.rot[J.CHEST],
      (o, a, q) => pack(o, a, q, color, lod),
      1,
      true,
    );
  }
  if (armored) {
    rigid(
      `crotch ${plate} ${build}`,
      s.pos[J.PELVIS],
      s.rot[J.PELVIS],
      (o, a, q) => crotch(o, a, q, plate, build ? CUP_F : 1),
      1,
      true,
    );
  }
  if (blade) {
    if (!isHunter) {
      sword(out, s.pos[J.HAND_R], s.rot[J.HAND_R], Math.min(lod, 1), r.t, 1, 1, 0, gpu);
      const [base, tip] = swordEnds(s.pos[J.HAND_R], s.rot[J.HAND_R]);
      r.trail.mark(base, tip, cutting(r.prog) || (r.parry >= 0 && r.parry < 2 * PARRY_IN));
    }
  } else if (
    !p.fists &&
    (p.railed ? !stowed(p) : p.ammo >= 0 || p.rifled) &&
    !p.down &&
    !driving(r) &&
    r.pum === undefined
  ) {
    // A swap shows: the battery or the capsule out and in, the glow off until it is.
    const sp = swapOf(p);
    if (isHunter && p.rifled && p.clip) {
      // His disc is out: the hand is empty until it comes back (gun.ts DISK_LOST).
    } else if (isHunter && p.rifled) {
      // The disc held by its hub (the user, 2026-11-23): the palm on the hub, the disc beyond the
      // palm, its face along the back of the hand (axes()' right).
      const q = s.rot[J.HAND_R];
      const [ax, up, fwd] = axes(q);
      const at = grip(s.pos[J.HAND_R], q);
      const hold = [0, 1, 2].map(i => fwd[i] * DISC_HOLD[0] - ax[i] * DISC_HOLD[1]) as Vec3;
      drawDisc(out, add(at, hold), fwd, up, ax);
    } else if (isHunter && handOf(p) === 0 && !p.sided) {
      const q = s.rot[J.HAND_R];
      drawHarpoon(
        out,
        Math.min(lod, 1) as HunterLod,
        grip(s.pos[J.HAND_R], q),
        axes(q),
        0.82,
        1,
        !!p.mag || sp >= 0,
        harpoonFeed(sp),
        gpu,
      );
    } else {
      held(
        out,
        s.pos[J.HAND_R],
        s.rot[J.HAND_R],
        Math.min(lod, 1),
        1,
        undefined,
        0,
        kindOf(p),
        r.t,
        {
          swap: sp,
          light: sp < 0 ? 1 : 1 - ease(span(sp, 0.1, 0.2)),
          cells: cellsOf(p),
          heat: (p.heat ?? 0) / HEAT_MAX,
          hot: p.hot,
          id: p.id,
          floor: p.ground ? p.y : undefined,
          vel: [p.vx, p.vy, p.vz],
          carry,
          list: gpu,
          skin: isHunter && !!p.sided,
        },
      );
    }
    if (p.railed || p.rifled) {
      const q = s.rot[J.HAND_R];
      const m = tip(grip(s.pos[J.HAND_R], q, kindOf(p)), axes(q, kindOf(p)), kindOf(p));
      r.tip = [m[0] - p.x, m[1] - p.y, m[2] - p.z];
    }
  }
  if (r.dash > 0.15) {
    const [s, c] = [Math.sin(yaw), Math.cos(yaw)];
    const { x, y, z } = r.p;
    streaks(out, r, color, ([a, u, f]) => [x + a * c - f * s, y + u, z - a * s - f * c]);
  }
  for (let i = n0; k > 0 && gpu && i < gpu.length; i++) {
    gpu[i].z = k;
  }
  return s;
};
