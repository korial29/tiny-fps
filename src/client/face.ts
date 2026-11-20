// The face in the HUD (the user, 2026-11-09: an expressive pixel face as in DOOM, with as many
// sprites and the same behaviour, its own look): a shaved runner with an earpiece, 24 by 29 pixels,
// drawn in code. 42 frames: 5 levels of wounds by 8 expressions (looking ahead, left and right,
// turned left and right toward a hit, an ouch, a grin, a rage), a glow for the flag carrier and the
// dead face; then 15 more, the 5 levels by the three expressions the runners' faces have and DOOM's
// had not (expression.ts): effort, focus, a shout. mood() picks the frame from what happens to the
// player.

/** The sprite's size, pixels. */
export const [FW, FH] = [24, 29];
/** The expressions of a wound level, in frame order. */
export const EXPR = {
  AHEAD: 0,
  LEFT: 1,
  RIGHT: 2,
  TURN_L: 3,
  TURN_R: 4,
  OUCH: 5,
  GRIN: 6,
  RAGE: 7,
  EFFORT: 8,
  FOCUS: 9,
  SHOUT: 10,
};
/** The frames past the 40 of the wound levels: the flag carrier's glow, and dead; then the 15 of effort, focus and the shout. */
export const [GLOW, DEAD, MORE, FRAMES] = [40, 41, 42, 57];
/** The frame of expression `e` at wound level `level`. */
export const frame = (level: number, e: number) =>
  e < 8 ? level * 8 + e : MORE + level * 3 + e - 8;

/** The colours of the palette, RGBA as one number each (little-endian ABGR for ImageData). */
export const PALETTE = [
  0, 0xff0a0f1a, 0xff628bc9, 0xff4363a0, 0xff7da7e0, 0xff364a6b, 0xffdce8ee, 0xff0f1420, 0xff14144a,
  0xffe0eff2, 0xff1a12b0, 0xff5a3f7d, 0xff362f2a, 0xffffd93f, 0xff4ad3ff, 0xff86908a, 0xff18243a,
  // The woman's: her hair, its light, her lips.
  0xff1c2f5e, 0xff2f4c8a, 0xff4a45cc,
  // The xenomorph's: its chitin, the chitin's sheen, its eyes' glow, its acid.
  0xff1c1412, 0xff604e46, 0xff3246ff, 0xff28e696,
  // The Hunter's dark mask, bronze plates and targeting optics.
  0xff171a20, 0xffb56b35, 0xffffb94d,
];
const [
  ,
  LINE,
  SKIN,
  SHADE,
  LIGHT,
  SCALP,
  WHITE,
  PUPIL,
  MOUTH,
  TEETH,
  BLOOD,
  BRUISE,
  SET,
  LED,
  GOLD,
  GREY,
  BROW,
  HAIR,
  SHEEN,
  LIP,
  CHIT,
  CHIT_HI,
  EYE,
  ACID,
  HUNT_DARK,
  HUNT_BRASS,
  HUNT_GLOW,
] = PALETTE.map((_, i) => i);

const sprites: Uint8Array[] = [];

/** The faces of sprite(): the man's, the woman's, the xenomorph's and the Hunter's. */
export const LOOK = { MAN: 0, WOMAN: 1, XENO: 2, HUNTER: 3 } as const;

/**
 * Frame `n`'s pixels, FW by FH palette indices, row by row; built once. `fem` (LOOK.WOMAN) is the
 * woman's face: the same frames, a bob over the scalp and down the cheeks, a narrower jaw, lashes,
 * lips; LOOK.XENO the xenomorph's head (beast()).
 */
export const sprite = (n: number, fem = 0): Uint8Array => {
  const key = n + FRAMES * fem;
  if (sprites[key]) {
    return sprites[key];
  }
  if (fem == LOOK.XENO) {
    return (sprites[key] = beast(n));
  }
  if (fem == LOOK.HUNTER) {
    return (sprites[key] = hunter(n));
  }
  const p = new Uint8Array(FW * FH);
  const dead = n == DEAD;
  const more = n >= MORE;
  const level = dead ? 4 : n == GLOW ? 0 : more ? Math.floor((n - MORE) / 3) : Math.floor(n / 8);
  const e = more ? 8 + ((n - MORE) % 3) : n >= 40 ? -1 : n % 8;
  const hard = e == EXPR.EFFORT || e == EXPR.SHOUT;
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && x < FW && y >= 0 && y < FH) {
      p[y * FW + x] = c;
    }
  };
  const box = (x: number, y: number, w: number, h: number, c: number) => {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        put(x + i, y + j, c);
      }
    }
  };
  // Turned toward a hit, the features move 2 pixels that way and the far cheek darkens.
  const t = e == EXPR.TURN_L ? -2 : e == EXPR.TURN_R ? 2 : 0;
  const skin = dead ? GREY : SKIN;
  // The head: an egg, the scalp shaved dark on top, an outline round it, the ears.
  for (let y = 1; y < FH; y++) {
    for (let x = 0; x < FW; x++) {
      // Her jaw narrows to the chin.
      const [u, v] = [
        ((x - 11.5) / 9.6) * (1 + 0.05 * fem * Math.max(y - 16, 0)),
        (y - 15) / (y < 15 ? 13 : 12.6),
      ];
      const r = u * u + v * v;
      if (r < 1) {
        const top = fem ? y < 9 - Math.abs(u) * 1.5 - (x > 12 ? 1 : 0) : y < 8 - Math.abs(u) * 2;
        const hair = fem ? (y == 3 && x > 6 && x < 13 ? SHEEN : HAIR) : SCALP;
        put(x, y, r > 0.84 ? LINE : top ? (dead && !fem ? GREY : hair) : skin);
      }
    }
  }
  for (const s of [-1, 1]) {
    const x = s < 0 ? 1 : 21;
    if (fem) {
      // Her bob: from the top of the head down each cheek to the jaw, over the ears and the
      // head's own outline, a dark edge outside and under it.
      for (let y = 3; y < 21; y++) {
        const edge = Array.from({ length: 12 }, (_, k) => (s < 0 ? k : FW - 1 - k)).find(
          k => p[y * FW + k],
        )!;
        const out = Math.min(Math.max(edge - s * (y < 8 ? 1 : 2), 0), FW - 1);
        for (let k = out; k != edge + s * (y < 19 ? 2 : 1); k += s) {
          put(k, y, y == 20 || k == out ? LINE : HAIR);
        }
      }
      continue;
    }
    box(x, 13, 2, 5, skin);
    box(s < 0 ? 0 : 23, 14, 1, 3, LINE);
  }
  if (!dead) {
    box(t > 0 ? 3 : 17, 16, 3, 7, SHADE);
    box(4, 9, 3, 1, LIGHT);
  }
  // The earpiece on the right ear, a light on it, and its boom toward the mouth.
  box(20, 13, 3, 5, SET);
  put(21, 14, n == GLOW ? GOLD : dead ? SET : LED);
  for (let i = 0; i < 4; i++) {
    put(19 - i, 18 + (i >> 1), SET);
  }
  const [lx, rx] = [6 + t, 14 + t];
  const look =
    e == EXPR.LEFT || e == EXPR.TURN_L ? -1 : e == EXPR.RIGHT || e == EXPR.TURN_R ? 1 : 0;
  // The eyes: open, wide, narrowed, crossed out dead or glowing; the left one swells at level 3.
  for (const [i, x] of [lx, rx].entries()) {
    const wide = e == EXPR.OUCH;
    const narrow = e == EXPR.GRIN || e == EXPR.RAGE || e >= EXPR.EFFORT || (i == 0 && level >= 3);
    if (dead) {
      put(x, 12, PUPIL);
      put(x + 3, 12, PUPIL);
      box(x + 1, 13, 2, 1, PUPIL);
      put(x, 14, PUPIL);
      put(x + 3, 14, PUPIL);
      continue;
    }
    // Her eyes are larger (the user, 2026-11-12): a row taller, open.
    const [top, h] = wide ? [12, 3] : narrow ? [14, 1] : fem ? [12, 3] : [13, 2];
    const tall = fem && !wide && !narrow;
    box(x, top, 4, h, n == GLOW ? GOLD : WHITE);
    box(x, top - 1, 4, 1, LINE);
    // Her lashes: the lid's line goes on past the outer corner, up.
    if (fem) {
      put(i ? x + 4 : x - 1, top - 1, LINE);
      put(i ? x + 5 : x - 2, top - 2, LINE);
      put(i ? x + 5 : x - 2, top - 3, LINE);
      put(i ? x + 4 : x - 1, top + h - 1, LINE);
    }
    if (n != GLOW) {
      box(x + 1 + look, wide ? 13 : top + +tall, wide ? 1 : 2, wide ? 1 : h - +tall, PUPIL);
    }
    // The brows: flat, raised, or down in a V.
    const lift = wide ? -2 : tall ? -1 : 0;
    for (let k = 0; k < 4; k++) {
      const v =
        e == EXPR.RAGE || e == EXPR.TURN_L || e == EXPR.TURN_R || hard
          ? (i ? 3 - k : k) >> 1
          : e == EXPR.GRIN
            ? (i ? k : 3 - k) >> 2
            : 0;
      put(x + k, 10 + lift + v + (narrow && e != EXPR.RAGE && !hard ? 1 : 0), BROW);
    }
  }
  // The nose.
  box(11 + t, 15, 2, 3, SHADE);
  put(13 + t, 18, SHADE);
  // The mouth.
  const m = 9 + t;
  if (dead || e == EXPR.OUCH) {
    box(m + 1, 20, 4, 4, LINE);
    box(m + 2, 21, 2, dead ? 3 : 2, MOUTH);
  } else if (e == EXPR.GRIN || n == GLOW) {
    box(m - 1, 21, 8, 1, TEETH);
    box(m - 1, 22, 8, 1, LINE);
    put(m - 2, 20, LINE);
    put(m + 7, 20, LINE);
  } else if (e == EXPR.RAGE) {
    box(m - 1, 20, 8, 3, LINE);
    box(m, 21, 6, 1, TEETH);
    put(m + 2, 21, LINE);
    put(m + 4, 21, LINE);
  } else if (e == EXPR.SHOUT) {
    // Wide open, the upper teeth showing.
    box(m, 19, 6, 5, LINE);
    box(m + 1, 20, 4, 3, MOUTH);
    box(m + 1, 20, 4, 1, TEETH);
  } else if (e == EXPR.EFFORT) {
    // Out of breath: the mouth open a little, a drop of sweat on the temple.
    box(m + 1, 20, 4, 3, LINE);
    box(m + 2, 21, 2, 1, MOUTH);
    put(4, 11, LIGHT);
    put(4, 12, WHITE);
  } else if (e == EXPR.FOCUS) {
    // Set: a short, tight line.
    box(m + 1, 21, 4, 1, LINE);
    box(m + 1, 22, 4, fem, LIP);
  } else if (e == EXPR.TURN_L || e == EXPR.TURN_R) {
    // A grimace, lower on the side of the hit.
    for (let k = 0; k < 6; k++) {
      put(m + k, 21 + (t > 0 ? k >> 2 : (5 - k) >> 2), LINE);
    }
  } else {
    box(m, 21, 6, 1, LINE);
    // Her lips: the upper one's bow over the line, the fuller lower one under it.
    box(m + 1, 20, 4, fem, LIP);
    box(m + 1, 22, 4, fem, LIP);
  }
  // The wounds, worse with each level: a bruise, a cut on the brow, a bleeding nose and a swollen
  // eye, blood down the forehead and from the mouth.
  if (level >= 1) {
    box(lx, 16, 2, 1, BRUISE);
  }
  if (level >= 2) {
    put(rx + 3, 9, BLOOD);
    put(rx + 3, 10, BLOOD);
    put(rx + 4, 11, BLOOD);
  }
  if (level >= 3) {
    put(12 + t, 19, BLOOD);
    put(12 + t, 20, BLOOD);
    box(lx, 17, 3, 1, BRUISE);
  }
  if (level >= 4) {
    box(6, 4, 1, 6, BLOOD);
    put(7, 7, BLOOD);
    put(m + 6, 23, BLOOD);
    put(m + 6, 24, BLOOD);
  }
  return (sprites[key] = p);
};

/** The Hunter's original pixel portrait: a plated mask, luminous targeting optics and cheek blades. */
const hunter = (n: number): Uint8Array => {
  const p = new Uint8Array(FW * FH);
  const dead = n == DEAD;
  const more = n >= MORE;
  const level = dead ? 4 : n == GLOW ? 0 : more ? Math.floor((n - MORE) / 3) : Math.floor(n / 8);
  const e = more ? 8 + ((n - MORE) % 3) : n >= 40 ? -1 : n % 8;
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && x < FW && y >= 0 && y < FH) {
      p[y * FW + x] = c;
    }
  };
  const box = (x: number, y: number, w: number, h: number, c: number) => {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        put(x + i, y + j, c);
      }
    }
  };
  const shift = e == EXPR.TURN_L ? -1 : e == EXPR.TURN_R ? 1 : 0;
  // Broad crown and tapered mask.
  for (let y = 2; y < 27; y++) {
    const half = y < 13 ? 8 + Math.floor((y - 2) / 5) : Math.max(4, 11 - Math.floor((y - 13) / 2));
    for (let x = 0; x < FW; x++) {
      const d = Math.abs(x - 11.5);
      if (d <= half) {
        put(x, y, d == half || y == 26 ? LINE : y < 8 ? HUNT_BRASS : HUNT_DARK);
      }
    }
  }
  // Segmented forehead plates.
  box(5, 4, 5, 2, dead ? GREY : HUNT_BRASS);
  box(14, 4, 5, 2, dead ? GREY : HUNT_BRASS);
  box(10, 3, 4, 7, dead ? GREY : HUNT_BRASS);
  box(11, 5, 2, 6, dead ? GREY : GOLD);
  // Optics track the same eight expressions as the other faces.
  const look =
    e == EXPR.LEFT || e == EXPR.TURN_L ? -1 : e == EXPR.RIGHT || e == EXPR.TURN_R ? 1 : 0;
  const eye = dead ? GREY : e == EXPR.RAGE || e == EXPR.SHOUT ? HUNT_GLOW : LED;
  for (const side of [-1, 1]) {
    const x = Math.round(11.5 + side * 4 + shift + look);
    for (let k = 0; k < 3; k++) {
      put(x + side * k, 13 - k, eye);
    }
    // Mandibles and the lower respirator grille.
    put(Math.round(11.5 + side * 5), 18, dead ? GREY : HUNT_BRASS);
    for (let y = 20; y < 25; y++) {
      put(Math.round(11.5 + side * (5 - Math.floor((y - 20) / 2))), y, dead ? GREY : HUNT_BRASS);
    }
  }
  box(9, 18, 6, 1, LINE);
  box(9, 20, 6, 1, dead ? GREY : HUNT_BRASS);
  for (let i = 0; i < Math.min(level, 4); i++) {
    put(7 + i * 2, 10 + (i % 2) * 3, dead ? GREY : BLOOD);
  }
  if (e == EXPR.SHOUT || e == EXPR.OUCH) {
    box(10, 22, 4, 2, LINE);
  }
  return (sprites[n + FRAMES * LOOK.HUNTER] = p);
};

/**
 * The xenomorph's head in the frame `n`, the frames as the runner's: its long skull seen from the
 * front, a dome of black chitin with a sheen down its crest, narrowing to the jaw; two glowing
 * slits for eyes, which look, narrow and open as the runner's do; its jaws, closed on their fangs,
 * open in a hiss (an ouch, the shout), bared (a grin), wide (a rage). Its wounds are acid: a
 * splash, a crack in the dome, acid from the mouth, more cracks. Dead, grey and dark-eyed, the jaw
 * slack. Turned toward a hit, the features move 2 pixels that way.
 */
const beast = (n: number): Uint8Array => {
  const p = new Uint8Array(FW * FH);
  const dead = n == DEAD;
  const more = n >= MORE;
  const level = dead ? 4 : n == GLOW ? 0 : more ? Math.floor((n - MORE) / 3) : Math.floor(n / 8);
  const e = more ? 8 + ((n - MORE) % 3) : n >= 40 ? -1 : n % 8;
  const put = (x: number, y: number, c: number) => {
    if (x >= 0 && x < FW && y >= 0 && y < FH) {
      p[y * FW + x] = c;
    }
  };
  const box = (x: number, y: number, w: number, h: number, c: number) => {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        put(x + i, y + j, c);
      }
    }
  };
  const t = e == EXPR.TURN_L ? -2 : e == EXPR.TURN_R ? 2 : 0;
  const [body, hi] = dead ? [GREY, GREY] : [CHIT, CHIT_HI];
  // The half width of the head at row y: a dome down to row 12, then the jaw narrowing to a snout.
  const half = (y: number) =>
    y <= 12
      ? 8.6 * Math.sqrt(Math.max(0, 1 - ((y - 11.5) / 10.5) ** 2))
      : 8.6 - (5.4 * (y - 12)) / 15;
  for (let y = 1; y < FH - 1; y++) {
    const w = half(y);
    for (let x = 0; x < FW; x++) {
      const d = Math.abs(x - 11.5);
      if (d < w) {
        put(x, y, d > w - 1 || y == FH - 2 ? LINE : body);
      }
    }
  }
  // The crest's sheen, and a rim of light down its left side.
  box(11, 2, 2, 8, hi);
  box(10, 4, 1, 4, hi);
  for (let y = 6; y < 16; y++) {
    put(Math.ceil(11.5 - half(y)) + 1, y, hi);
  }
  // Its far cheek in shadow, turned.
  if (t && !dead) {
    for (let y = 12; y < 24; y++) {
      put(t > 0 ? 4 : 19, y, LINE);
    }
  }
  const look =
    e == EXPR.LEFT || e == EXPR.TURN_L ? -1 : e == EXPR.RIGHT || e == EXPR.TURN_R ? 1 : 0;
  const wide = e == EXPR.OUCH || e == EXPR.SHOUT;
  const narrow = e == EXPR.GRIN || e == EXPR.RAGE || e == EXPR.EFFORT || e == EXPR.FOCUS;
  // The slits: slanting up to the temples, bright where they look.
  for (const s of [-1, 1]) {
    const x0 = 11.5 + s * 2 + t;
    for (let k = 0; k < 5; k++) {
      const x = Math.round(x0 + s * k);
      const y = 14 - (k >> 1);
      const lit = dead ? PUPIL : n == GLOW ? GOLD : EYE;
      put(x, y, lit);
      if (wide && k < 4) {
        put(x, y - 1, lit);
      }
      if (!dead && n != GLOW && k == 2 + look * s) {
        put(x, y, WHITE);
      }
    }
    if (narrow && !dead) {
      put(Math.round(x0 + s * 4), 12, LINE);
    }
  }
  // The jaws: shut on their fangs, or open.
  const m = 8 + t;
  const open = dead || wide || e == EXPR.RAGE;
  if (open) {
    const h = e == EXPR.SHOUT || e == EXPR.RAGE ? 5 : 4;
    box(m, 20, 8, h, LINE);
    box(m + 1, 21, 6, h - 2, MOUTH);
    for (let k = 0; k < 6; k += 2) {
      put(m + 1 + k, 21, TEETH);
      put(m + 2 + k, 19 + h - 1, TEETH);
    }
  } else if (e == EXPR.GRIN || n == GLOW) {
    box(m, 21, 8, 2, TEETH);
    box(m, 23, 8, 1, LINE);
    for (let k = 1; k < 8; k += 2) {
      put(m + k, 22, LINE);
    }
  } else {
    box(m + 1, 22, 6, 1, LINE);
    for (let k = 1; k < 7; k += 2) {
      put(m + k, 21, TEETH);
    }
    if (e == EXPR.EFFORT) {
      // A string of acid from the jaw.
      put(m + 6, 23, ACID);
      put(m + 6, 24, ACID);
    }
  }
  // The wounds, in acid.
  if (level >= 1) {
    box(5 + t, 17, 2, 1, ACID);
  }
  if (level >= 2) {
    put(15, 4, LINE);
    put(16, 5, LINE);
    put(16, 6, LINE);
    put(17, 7, ACID);
  }
  if (level >= 3) {
    put(m + 2, 24 + +open, ACID);
    put(m + 2, 25 + +open, ACID);
  }
  if (level >= 4) {
    put(7, 3, LINE);
    put(8, 4, LINE);
    put(7, 5, LINE);
    box(6, 6, 1, 3, ACID);
  }
  return p;
};

/** What the face reacts to, each frame. */
export interface Feel {
  hp: number;
  max: number;
  down: boolean;
  /** Carrying the enemy flag. */
  flag: boolean;
  /** Health lost since the last frame, and where the hit came from: radians to the right of the view (undefined unknown). */
  lost: number;
  from?: number;
  /** A weapon taken that was not carried. */
  got: boolean;
  /** Seconds the trigger has been held, firing. */
  firing: number;
  /** What the runners' faces answer to as well (Mood in expression.ts): a sprint or a climb, aiming, a cut or a dash, a capture or a foe put down. */
  effort?: boolean;
  focus?: boolean;
  shout?: boolean;
  grin?: boolean;
}

/**
 * The face's mind (after DOOM's, not its code): the frame for this moment. A hit turns the face
 * toward its side, or grimaces straight on when it comes from ahead or from nowhere; a heavy hit (2
 * health or more) is an ouch; a new weapon a grin; the trigger held for 2 s a rage; and otherwise it
 * glances left and right every half second or so. Each reaction holds a second. As the runners'
 * faces do, it shouts in a cut or a dash, grins at a capture or a foe put down, is set while aiming
 * and strains in a sprint or a climb.
 */
export const mood = (rand = Math.random) => {
  let [hold, held, glance, eyes] = [0, EXPR.AHEAD, 0, EXPR.AHEAD];
  return (dt: number, f: Feel): number => {
    if (f.down) {
      hold = 0;
      return DEAD;
    }
    const level = Math.min(4, Math.max(0, Math.ceil(((f.max - f.hp) * 5) / f.max)));
    hold -= dt;
    if (f.lost > 0) {
      const side = f.from ?? 0;
      held =
        f.lost >= 2
          ? EXPR.OUCH
          : f.from === undefined || Math.abs(side) < 0.5
            ? EXPR.RAGE
            : side < 0
              ? EXPR.TURN_L
              : EXPR.TURN_R;
      hold = 1;
    } else if (f.got || f.grin) {
      [held, hold] = [EXPR.GRIN, 1.5];
    }
    if (hold > 0) {
      return level * 8 + held;
    }
    if (f.shout) {
      return frame(level, EXPR.SHOUT);
    }
    if (f.firing > 2) {
      return level * 8 + EXPR.RAGE;
    }
    if (f.focus) {
      return frame(level, EXPR.FOCUS);
    }
    if (f.flag) {
      return GLOW;
    }
    if (f.effort) {
      return frame(level, EXPR.EFFORT);
    }
    if ((glance -= dt) <= 0) {
      glance = 0.5 + rand() * 0.6;
      eyes = [EXPR.AHEAD, EXPR.LEFT, EXPR.RIGHT][Math.floor(rand() * 3)];
    }
    return level * 8 + eyes;
  };
};
