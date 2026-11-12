// Sound synthesis, jsfxr style: each sound is a handful of numbers rendered once into samples.
// No DOM, no Web Audio: audio.ts turns the samples into buffers. Music is rendered the same way.

/**
 * One oscillator: wave (0 square, 1 saw, 2 sine, 3 noise held for one period), hz, slide in octaves
 * per second, attack, sustain and decay in seconds, vibrato depth, low-pass (0..1, 1 is off),
 * arpeggio time and frequency multiplier, volume; optionally the seconds it starts late.
 */
export type Voice = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number?,
];

/** Sample rate of everything rendered here; audio.ts resamples through AudioBuffer if needed. */
export const RATE = 44100;

const synth = (
  [wave, hz, slide, a, s, d, vib, lp, jt, jm, vol]: Voice,
  seed: number,
  rate = RATE,
) => {
  const out = new Float32Array(Math.ceil((a + s + d) * rate));
  let phase = 0;
  let low = 0;
  let noise = 0;
  // mulberry32
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let z = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    z = (z + Math.imul(z ^ (z >>> 7), 61 | z)) ^ z;
    return ((z ^ (z >>> 14)) >>> 0) / 2 ** 31 - 1;
  };
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    phase += (hz * 2 ** (slide * t) * (t > jt ? jm : 1) * (1 + vib * Math.sin(t * 44))) / rate;
    if (phase >= 1) {
      phase %= 1;
      noise = rand();
    }
    const x =
      wave == 3
        ? noise
        : wave == 2
          ? Math.sin(phase * 2 * Math.PI)
          : wave
            ? 1 - 2 * phase
            : phase < 0.5
              ? 1
              : -1;
    low += (x - low) * lp;
    // The decay is quadratic and ends at 0, the attack starts at 0: neither end clicks.
    const env = t < a ? t / a : t < a + s ? 1 : ((a + s + d - t) / d) ** 2;
    out[i] = low * env * vol;
  }
  return out;
};

/** The ids of the sounds: an index into LAYERS. LOOPED lists the loops. */
export const SOUND = {
  STEP: 0,
  /** The lighter tap of a step on a wall. */
  WALLSTEP: 1,
  JUMP: 2,
  DOUBLE: 3,
  DASH: 4,
  LAND: 5,
  GRAB: 6,
  SCUFF: 7,
  WIND: 8,
  SCRAPE: 9,
  /** Capture the flag: a flag taken, dropped, returned home, and a capture. */
  TAKE: 10,
  DROP: 11,
  RETURN: 12,
  CAPTURE: 13,
  /** A tackle: the impact, and the grunt of the one tackled. */
  TACKLE: 14,
  GRUNT: 15,
  /** The gun: a shot, the shooter's hit sound, hurt, going down, taking the gun or a refill, a health pack, an empty click. */
  LASER: 16,
  HIT: 17,
  HURT: 18,
  DOWN: 19,
  GUN: 20,
  PACK: 21,
  DRY: 22,
  /** The katana: the shing of drawing or sheathing it, the swish of a cut (played faster for a thrust, slower for a slash), the electric zap of a hit. */
  SHING: 23,
  SWISH: 24,
  ZAP: 25,
  /** A plasma ball bursting on a wall or a body. */
  SPLASH: 26,
  /** A charged shot, under the plain one: a long deep blast. */
  BLAST: 27,
  /** A crackle of the rail gun's bolt, played again and again while it is held. */
  RAIL: 28,
  /** The rail gun in hand: a soft electric hum, looped, louder while its bolt goes out. */
  HUM: 29,
  /** The rail gun's bolt as its holder hears it: an electric buzz, looped, its pitch swung up and down by the player. */
  BUZZ: 30,
  /**
   * The swaps (gun.ts CUES): the gun's battery let go and sliding out, the new one clicked home;
   * the rail gun's capsule jumping off, a turn of the screw on the new one; and a gun powering up.
   */
  EJECT: 31,
  CLICK: 32,
  POP: 33,
  SCREW: 34,
  BOOT: 35,
  /** The laser rifle's shot: a punch in the bass and the middle, short enough for 20 a second. */
  LASE: 36,
  /** The rail gun overheating: a burst of steam hissing out and a whistle falling under it. */
  HISS: 37,
  /** The katana coming on: its button clicked, then its edge's current crackling and buzzing. */
  IGNITE: 38,
  /** The plasma gun charging, held: a whine played higher as the charge grows (combat.ts), looped. */
  CHARGE: 39,
  /** The rover's electric turbine, looped: played higher as it goes faster. */
  ENGINE: 40,
  /** The rover's suspension taking a landing. */
  THUD: 41,
  /** The rover's tyres sliding sideways over the dust, looped: louder as it drifts wider. */
  SKID: 42,
  /** Breathing in a space helmet (the user, 2026-11-10), in then out: air drawn through the regulator, and let out with its valve's hiss. */
  INHALE: 43,
  EXHALE: 44,
  /** An automatic door (doors.ts) sliding open: its seals let go with a hiss and its servo whirs up. */
  DOOR: 45,
  /** And sliding shut: the servo whirs down and the panels meet with a thump. */
  SHUT: 46,
  /** A vehicle's damage (wreck.ts): a shot on its hull, a crackle of its arcs, its explosion, its wreck falling apart. */
  HULL: 47,
  ARC: 48,
  WRECK: 49,
  CRUMBLE: 50,
  /** A vehicle's laser bolt (the user, 2026-11-12: a blaster of the films): a bright zing diving fast, metallic. */
  BLASTER: 51,
  /** The combat ship's engines, looped: a turbine's whine over a jet's roar, played higher and louder with the thrust. */
  JET: 52,
  /** The ship crashing into a wall, the ground or another vehicle: a crunch of metal over a deep thump. */
  CRASH: 53,
} as const;

/**
 * The sounds of the game: one entry per sound, its voices layered, in SOUND order. A low-passed
 * noise is quiet (lp 0.06 keeps about a tenth of the swing): the loops have a high volume.
 */
export const LAYERS: Voice[][] = [
  [
    [2, 130, -3, 0.001, 0.005, 0.06, 0, 1, 0, 1, 0.7],
    [3, 8000, -1, 0.001, 0, 0.035, 0, 0.4, 0, 1, 0.45],
  ],
  [
    [3, 12000, 0, 0.001, 0, 0.03, 0, 0.5, 0, 1, 0.4],
    [2, 190, -3, 0.001, 0, 0.04, 0, 1, 0, 1, 0.3],
  ],
  [
    [3, 14000, 0, 0.015, 0.02, 0.09, 0.3, 0.18, 0, 1, 0.5],
    [2, 70, -2, 0.003, 0, 0.07, 0, 1, 0, 1, 0.3],
  ],
  [
    [3, 4000, 3.5, 0.03, 0.03, 0.2, 0, 0.25, 0, 1, 0.5],
    [2, 350, 1.2, 0.03, 0.02, 0.18, 0.02, 1, 0, 1, 0.12],
  ],
  [
    [3, 14000, -2.5, 0.008, 0.07, 0.2, 0.25, 0.3, 0, 1, 0.8],
    [3, 3500, 0.5, 0.01, 0.06, 0.2, 0, 0.12, 0, 1, 0.5],
  ],
  [
    [2, 70, -2.5, 0.001, 0.01, 0.2, 0, 1, 0, 1, 0.9],
    [3, 7000, -1, 0.001, 0, 0.09, 0, 0.25, 0, 1, 0.5],
  ],
  [
    [3, 6000, -1, 0.001, 0, 0.05, 0, 0.5, 0, 1, 0.7],
    [2, 160, -4, 0.001, 0, 0.07, 0, 1, 0, 1, 0.5],
  ],
  [
    [3, 5000, 0, 0.01, 0.04, 0.14, 0.5, 0.3, 0, 1, 0.5],
    [3, 2500, 0, 0.03, 0, 0.1, 0.4, 0.2, 0, 1, 0.3, 0.08],
  ],
  [
    [3, 20000, 0, 0.001, 2.1, 0.001, 0.25, 0.06, 0, 1, 1.2],
    [3, 20000, 0, 0.001, 2.1, 0.001, 0.35, 0.3, 0, 1, 0.3],
  ],
  [
    [3, 9000, 0, 0.001, 2.1, 0.001, 0.5, 0.4, 0, 1, 0.5],
    [3, 3000, 0, 0.001, 2.1, 0.001, 0.4, 0.2, 0, 1, 0.5],
  ],
  // TAKE: a square note that jumps a fifth, over a sine an octave up that comes in late.
  [
    [0, 392, 0, 0.003, 0.05, 0.08, 0, 0.35, 0.07, 1.5, 0.5],
    [2, 784, 0, 0.003, 0.03, 0.1, 0.01, 1, 0, 1, 0.3, 0.05],
  ],
  // DROP: a saw sliding down, and a rattle.
  [
    [1, 330, -2.2, 0.003, 0.04, 0.22, 0.04, 0.25, 0, 1, 0.45],
    [3, 2500, -1, 0.001, 0, 0.12, 0, 0.3, 0, 1, 0.4],
  ],
  // RETURN: a chime, a sine that jumps a fifth and a bell over it.
  [
    [2, 659, 0, 0.003, 0.06, 0.25, 0.015, 1, 0.09, 1.5, 0.5],
    [2, 1318, 0, 0.003, 0.03, 0.2, 0, 1, 0, 1, 0.2, 0.09],
  ],
  // CAPTURE: C, E, G in squares and a long C an octave up over a sine.
  [
    [0, 523, 0, 0.004, 0.07, 0.1, 0, 0.3, 0, 1, 0.4],
    [0, 659, 0, 0.004, 0.07, 0.1, 0, 0.3, 0, 1, 0.4, 0.11],
    [0, 784, 0, 0.004, 0.07, 0.1, 0, 0.3, 0, 1, 0.4, 0.22],
    [0, 1047, 0, 0.004, 0.2, 0.35, 0.008, 0.3, 0, 1, 0.5, 0.33],
    [2, 262, 0, 0.004, 0.25, 0.3, 0, 1, 0, 1, 0.35, 0.33],
  ],
  // TACKLE: a body hit, a sine thump falling fast under a crack of noise and a rustle of cloth.
  [
    [2, 120, -3, 0.001, 0.01, 0.24, 0, 1, 0, 1, 1],
    [3, 5000, -1.5, 0.001, 0, 0.09, 0, 0.35, 0, 1, 0.7],
    [3, 2200, 0, 0.01, 0.03, 0.16, 0.3, 0.15, 0, 1, 0.4, 0.03],
  ],
  // GRUNT: breath pushed out, a low saw dropping with a wobble, with a hiss of air.
  [
    [1, 170, -0.9, 0.012, 0.05, 0.17, 0.06, 0.2, 0, 1, 0.5],
    [3, 3000, 0, 0.01, 0.04, 0.14, 0.4, 0.12, 0, 1, 0.5],
  ],
  // LASER, a plasma shot that falls from the treble to the bass: a square and a saw a few hertz
  // apart diving from 2.4 kHz to under 200 Hz, their beating a flanger's sweep, over a short sine thump.
  [
    [0, 2400, -36, 0.001, 0.012, 0.09, 0.02, 0.35, 0, 1, 0.32],
    [1, 2470, -36, 0.001, 0.012, 0.09, 0.02, 0.3, 0, 1, 0.26],
    [2, 190, -6, 0.001, 0.01, 0.06, 0, 1, 0, 1, 0.45],
  ],
  // HIT, as in Quake 3: a short metallic ping, a sine at 1.7 kHz with an inharmonic overtone, decaying fast.
  [
    [2, 1700, 0, 0.001, 0, 0.13, 0, 1, 0, 1, 0.6],
    [2, 4700, 0, 0.001, 0, 0.05, 0, 1, 0, 1, 0.3],
    [2, 1790, 0, 0.001, 0, 0.09, 0, 1, 0, 1, 0.3],
  ],
  // HURT: a low thud and a breath.
  [
    [2, 110, -2.5, 0.002, 0.01, 0.2, 0, 1, 0, 1, 0.9],
    [3, 2500, 0, 0.02, 0.03, 0.17, 0.3, 0.12, 0, 1, 0.5, 0.04],
  ],
  // DOWN: a heavy thump, a saw falling with a wobble and a rustle of the fall.
  [
    [2, 90, -1.2, 0.002, 0.04, 0.45, 0, 1, 0, 1, 0.9],
    [1, 180, -1.5, 0.01, 0.06, 0.4, 0.05, 0.2, 0, 1, 0.45],
    [3, 3000, 0, 0.02, 0, 0.35, 0.3, 0.1, 0, 1, 0.4, 0.12],
  ],
  // GUN: a click, a square rising and a shimmer over it.
  [
    [3, 5000, 0, 0.001, 0, 0.02, 0, 0.5, 0, 1, 0.5],
    [0, 260, 1.5, 0.005, 0.06, 0.12, 0, 0.25, 0, 1, 0.4, 0.02],
    [2, 1040, 0.5, 0.003, 0.03, 0.18, 0.01, 1, 0, 1, 0.25, 0.1],
  ],
  // PACK: three sines up an arpeggio.
  [
    [2, 523, 0, 0.003, 0.03, 0.1, 0, 1, 0, 1, 0.4],
    [2, 659, 0, 0.003, 0.03, 0.1, 0, 1, 0, 1, 0.4, 0.07],
    [2, 880, 0, 0.003, 0.05, 0.2, 0.01, 1, 0, 1, 0.45, 0.14],
  ],
  // DRY: the hammer on nothing.
  [
    [0, 190, -3, 0.001, 0, 0.04, 0, 0.6, 0, 1, 0.6],
    [3, 6000, 0, 0.001, 0, 0.02, 0, 0.5, 0, 1, 0.5],
  ],
  // SHING: a steel scrape rising, and the ring of the blade over it, three inharmonic partials.
  [
    [3, 6000, 1.5, 0.002, 0.04, 0.07, 0.2, 0.6, 0, 1, 0.5],
    [2, 3300, 0.05, 0.004, 0.02, 0.32, 0.012, 1, 0, 1, 0.3, 0.04],
    [2, 5250, 0, 0.003, 0, 0.22, 0, 1, 0, 1, 0.18, 0.04],
    [2, 7900, 0, 0.003, 0, 0.12, 0, 1, 0, 1, 0.1, 0.04],
  ],
  // SWISH: a noise sweep that rises, and a falling tail of it.
  [
    [3, 1800, 7, 0.07, 0, 0.09, 0, 0.5, 0, 1, 0.6],
    [3, 5000, -6, 0.01, 0, 0.12, 0.2, 0.3, 0, 1, 0.4, 0.08],
  ],
  // ZAP: a crackle of held noise that tears upward, a warbling buzz under it, a short ping and a sizzle.
  [
    [3, 900, 1.5, 0.001, 0.05, 0.14, 0.9, 1, 0, 1, 0.55],
    [1, 95, 0.6, 0.001, 0.07, 0.12, 0.6, 0.5, 0.05, 2, 0.35],
    [2, 2600, -4, 0.001, 0, 0.1, 0.3, 1, 0, 1, 0.25],
    [3, 7000, 0, 0.001, 0, 0.04, 0, 0.6, 0, 1, 0.3, 0.1],
  ],
  // SPLASH: a hiss of held noise falling fast, a bubble that chirps up twice, and a crackle.
  [
    [3, 8000, -3, 0.001, 0.02, 0.15, 0, 0.5, 0, 1, 0.6],
    [2, 500, 8, 0.002, 0.01, 0.05, 0, 1, 0.03, 1.5, 0.45, 0.01],
    [3, 1500, -1, 0.001, 0.03, 0.1, 0.9, 1, 0, 1, 0.3, 0.01],
  ],
  // BLAST: a square and a saw a few hertz apart diving from 900 Hz to under 50 Hz over half a
  // second, a rumble of noise falling with them, and a sub thump under it all.
  [
    [0, 900, -7, 0.002, 0.05, 0.5, 0.04, 0.3, 0, 1, 0.32],
    [1, 930, -7, 0.002, 0.05, 0.5, 0.04, 0.25, 0, 1, 0.26],
    [3, 600, -3, 0.002, 0.08, 0.45, 0, 0.15, 0, 1, 0.4],
    [2, 120, -2.5, 0.001, 0.05, 0.4, 0, 1, 0, 1, 0.5],
  ],
  // RAIL: a crackle of held noise that wavers, a 110 Hz mains buzz under it, a sharp snap on top.
  [
    [3, 1400, 1, 0.001, 0.04, 0.07, 0.9, 1, 0, 1, 0.5],
    [1, 110, 0, 0.001, 0.09, 0.03, 0.3, 0.6, 0, 1, 0.35],
    [3, 9000, -3, 0.001, 0, 0.03, 0, 0.8, 0, 1, 0.35],
  ],
  // HUM: a 60 Hz mains buzz, a sine an octave up, a faint fizz of held noise; held, to loop.
  [
    [1, 60, 0, 0.001, 2.1, 0.001, 0, 0.15, 0, 1, 0.3],
    [2, 120, 0, 0.001, 2.1, 0.001, 0, 1, 0, 1, 0.25],
    [3, 3000, 0, 0.001, 2.1, 0.001, 0.4, 0.2, 0, 1, 0.15],
  ],
  // BUZZ: a saw and a square at 110 and 113 Hz, beating, and a fizz of held noise; held, to loop.
  [
    [1, 110, 0, 0.001, 2.1, 0.001, 0, 0.5, 0, 1, 0.35],
    [0, 113, 0, 0.001, 2.1, 0.001, 0, 0.3, 0, 1, 0.22],
    [3, 4000, 0, 0.001, 2.1, 0.001, 0.6, 0.25, 0, 1, 0.18],
  ],
  // EJECT: the latch, a falling square chip; the cell's hiss sliding out; its light dying, a sine falling.
  [
    [0, 320, -4, 0.001, 0, 0.035, 0, 0.6, 0, 1, 0.5],
    [3, 3000, -2, 0.005, 0.03, 0.1, 0, 0.5, 0, 1, 0.35, 0.02],
    [2, 900, -4, 0.003, 0.02, 0.2, 0, 1, 0, 1, 0.3, 0.01],
  ],
  // CLICK: the new cell slapped home (the user, 2026-11-09: a click): the palm's dull slap, a hard
  // sharp tick with a bright metal chip, a knock, then the latch's smaller tick.
  [
    [3, 900, -1, 0.001, 0.005, 0.05, 0, 0.3, 0, 1, 0.5],
    [3, 9000, 0, 0.001, 0, 0.012, 0, 0.8, 0, 1, 0.8],
    [0, 2400, -2, 0.001, 0, 0.012, 0, 0.6, 0, 1, 0.4],
    [0, 520, -3, 0.001, 0, 0.03, 0, 0.6, 0, 1, 0.5],
    [3, 7000, 0, 0.001, 0, 0.02, 0, 0.6, 0, 1, 0.55, 0.04],
  ],
  // POP: a thump that kicks up, the hiss of the seal let go, the ring of the spring, a fizz.
  [
    [2, 110, 3, 0.002, 0.02, 0.08, 0, 1, 0, 1, 0.6],
    [3, 2000, 4, 0.002, 0.05, 0.15, 0, 0.6, 0, 1, 0.45],
    [2, 1800, 0, 0.002, 0, 0.25, 0.02, 1, 0, 1, 0.25, 0.03],
    [3, 8000, -2, 0.001, 0.02, 0.1, 0.8, 0.8, 0, 1, 0.2, 0.05],
  ],
  // SCREW: a turn of the wrist, three ratchet ticks over the rub of the thread.
  [
    [3, 9000, 0, 0.001, 0, 0.012, 0, 0.8, 0, 1, 0.6],
    [3, 9000, 0, 0.001, 0, 0.012, 0, 0.8, 0, 1, 0.55, 0.05],
    [3, 9000, 0, 0.001, 0, 0.012, 0, 0.8, 0, 1, 0.5, 0.1],
    [3, 2500, 0, 0.02, 0.08, 0.05, 0, 0.3, 0, 1, 0.25],
  ],
  // BOOT: the click of the gun's button (combat.ts plays it at the press, PRESS, the first time),
  // then a whine that rises two octaves, a sine over it, and a soft beep once it is up.
  [
    [3, 5000, 0, 0.001, 0.004, 0.025, 0, 0.6, 0, 1, 0.4],
    [1, 180, 2.2, 0.05, 0.25, 0.2, 0.02, 0.25, 0, 1, 0.3],
    [2, 360, 2.2, 0.05, 0.25, 0.2, 0, 1, 0, 1, 0.22],
    [2, 1760, 0, 0.003, 0.04, 0.05, 0, 1, 0, 1, 0.35, 0.45],
  ],
  // LASE: deep in the bass (the user, 2026-11-08): a sub sine thump falling from 75 Hz, a muffled
  // square punch from 160 Hz, a saw an octave under it, and a dull thud of low-passed noise; 75 ms,
  // for 20 a second.
  [
    [2, 75, -3, 0.001, 0.015, 0.06, 0, 1, 0, 1, 0.8],
    [0, 160, -5, 0.001, 0.008, 0.05, 0, 0.2, 0, 1, 0.5],
    [1, 80, -3, 0.001, 0.01, 0.05, 0, 0.2, 0, 1, 0.4],
    [3, 500, -2, 0.001, 0, 0.025, 0, 0.15, 0, 1, 0.3],
  ],
  // HISS (the user, 2026-11-08): a pop of the valve, steam hissing out and dying within the second, a
  // kettle's whistle sliding down under it, wavering.
  [
    [3, 1500, -2, 0.001, 0, 0.05, 0, 0.7, 0, 1, 0.45],
    [3, 7000, -0.5, 0.02, 0.35, 0.55, 0, 0.7, 0, 1, 0.5],
    [2, 2900, -0.6, 0.05, 0.4, 0.4, 0.05, 1, 0, 1, 0.22, 0.03],
  ],
  // IGNITE (the user, 2026-11-09: the katana lights up, it is no light saber): the click of the
  // button on the hilt, then the edge's current: three crackles of bright noise and an electric
  // buzz rising a little, dying in half a second.
  [
    [3, 5000, 0, 0.001, 0.004, 0.025, 0, 0.6, 0, 1, 0.4],
    [3, 7000, -1, 0.001, 0.01, 0.04, 0, 0.6, 0, 1, 0.4, 0.01],
    [3, 6000, -1, 0.001, 0.01, 0.04, 0, 0.6, 0, 1, 0.35, 0.07],
    [3, 8000, -1, 0.001, 0.01, 0.05, 0, 0.6, 0, 1, 0.3, 0.15],
    [0, 110, 0.6, 0.01, 0.15, 0.3, 0.3, 0.3, 0, 1, 0.3, 0.01],
  ],
  // CHARGE (the user, 2026-11-09): a sine at 330 Hz with a quick vibrato, a soft saw an octave under
  // it, a fizz of held noise; held, to loop, its pitch raised with the charge.
  [
    [2, 330, 0, 0.001, 2.1, 0.001, 0.25, 1, 0, 1, 0.3],
    [1, 165, 0, 0.001, 2.1, 0.001, 0.1, 0.3, 0, 1, 0.2],
    [3, 5000, 0, 0.001, 2.1, 0.001, 0.5, 0.2, 0, 1, 0.1],
  ],
  // ENGINE: a muffled saw at 49 Hz, the motor; its whine two octaves up and a turbine's whistle a
  // twelfth over that, both wavering; a breath of held noise; held, to loop. Each tone is a quarter
  // turn late where seam() joins the end to the start, so the loop keeps its level through the join.
  [
    [1, 49.08, 0, 0.001, 2.1, 0.001, 0, 0.12, 0, 1, 0.36],
    [2, 195.93, 0, 0.001, 2.1, 0.001, 0.004, 1, 0, 1, 0.2],
    [2, 588.04, 0, 0.001, 2.1, 0.001, 0.003, 1, 0, 1, 0.07],
    [3, 6000, 0, 0.001, 2.1, 0.001, 0.3, 0.15, 0, 1, 0.25],
  ],
  // THUD: the body coming down on its springs, a deep sine thump; the dampers bottoming, a muffled
  // square knock; the dust thrown up; and the springs' creak as they push back, late.
  [
    [2, 85, -2.2, 0.001, 0.02, 0.3, 0, 1, 0, 1, 1],
    [0, 130, -3, 0.001, 0.01, 0.11, 0, 0.2, 0, 1, 0.6],
    [3, 3500, -1.5, 0.001, 0.01, 0.18, 0, 0.3, 0, 1, 0.45],
    [2, 300, -0.9, 0.01, 0.03, 0.2, 0.08, 1, 0, 1, 0.12, 0.07],
  ],
  // SKID: grit under the tyres, two bands of held noise that waver, the lower one the louder; held, to loop.
  [
    [3, 2600, 0, 0.001, 2.1, 0.001, 0.6, 0.35, 0, 1, 0.4],
    [3, 700, 0, 0.001, 2.1, 0.001, 0.45, 0.25, 0, 1, 0.5],
  ],
  // INHALE: air drawn in through a mask, a soft band of noise swelling and rising a little, the
  // regulator's thin hiss over it; under a second.
  [
    [3, 1600, 0.5, 0.32, 0.12, 0.38, 0.2, 0.16, 0, 1, 0.6],
    [3, 6500, 0.3, 0.3, 0.1, 0.4, 0.3, 0.45, 0, 1, 0.16],
  ],
  // EXHALE: the breath let out, lower and quicker to start, falling; the valve's hiss, and a faint
  // rasp of the throat under it.
  [
    [3, 1100, -0.5, 0.07, 0.18, 0.55, 0.25, 0.14, 0, 1, 0.65],
    [3, 4500, -0.4, 0.07, 0.14, 0.55, 0.3, 0.4, 0, 1, 0.2],
    [0, 95, -0.3, 0.05, 0.12, 0.4, 0.1, 0.06, 0, 1, 0.1],
  ],
  // DOOR: the seals' hiss, a bright noise falling, and the servo, a muffled saw rising over 0.3 s.
  [
    [3, 6500, -1.2, 0.01, 0.1, 0.28, 0, 0.5, 0, 1, 0.5],
    [1, 140, 1.6, 0.02, 0.22, 0.1, 0.05, 0.15, 0, 1, 0.3],
  ],
  // SHUT: the servo falling, a softer hiss, and the panels' thump at the end, a low sine.
  [
    [1, 300, -1.8, 0.02, 0.32, 0.1, 0.05, 0.15, 0, 1, 0.3],
    [3, 5000, -0.8, 0.02, 0.2, 0.25, 0, 0.35, 0, 1, 0.3],
    [2, 90, -2, 0.001, 0.02, 0.16, 0, 1, 0, 1, 0.8, 0.42],
  ],
  // HULL: a shot on plate: a crack of bright noise, the plate's ring (two squares a fifth apart,
  // falling a little) and a dull knock under it.
  [
    [3, 6000, -2, 0.001, 0.005, 0.04, 0, 0.7, 0, 1, 0.45],
    [0, 520, -0.4, 0.001, 0.02, 0.16, 0, 0.25, 0, 1, 0.3],
    [0, 780, -0.4, 0.001, 0.01, 0.12, 0, 0.2, 0, 1, 0.2],
    [2, 140, -2.5, 0.001, 0.01, 0.09, 0, 1, 0, 1, 0.6],
  ],
  // ARC: a spit of current: three snaps of bright held noise that waver, over a short mains buzz.
  [
    [3, 7000, -1, 0.001, 0.008, 0.02, 0.9, 0.8, 0, 1, 0.4],
    [3, 9000, -2, 0.001, 0.006, 0.02, 0.9, 0.8, 0, 1, 0.35, 0.04],
    [3, 5000, 1, 0.001, 0.01, 0.03, 0.9, 0.7, 0, 1, 0.35, 0.085],
    [1, 100, 0, 0.001, 0.1, 0.03, 0.4, 0.5, 0, 1, 0.22],
  ],
  // WRECK: the vehicle blowing up: a crack, a long rumble of low noise falling, a sub thump that
  // dives, and torn metal, a saw falling through two octaves.
  [
    [3, 9000, -4, 0.001, 0.01, 0.07, 0, 0.9, 0, 1, 0.6],
    [3, 500, -2, 0.003, 0.2, 0.7, 0, 0.12, 0, 1, 0.9],
    [2, 95, -1.6, 0.001, 0.1, 0.75, 0, 1, 0, 1, 0.9],
    [1, 420, -2.4, 0.004, 0.1, 0.5, 0.06, 0.2, 0, 1, 0.3, 0.03],
  ],
  // CRUMBLE: the wreck falling apart: a fizz of bright noise swelling then dying, grit under it,
  // and a thin tone sliding down as it goes.
  [
    [3, 8000, -0.6, 0.15, 0.3, 0.5, 0.5, 0.5, 0, 1, 0.4],
    [3, 1800, -1, 0.05, 0.3, 0.55, 0.7, 0.3, 0, 1, 0.4],
    [2, 1400, -2, 0.1, 0.2, 0.6, 0.05, 1, 0, 1, 0.1],
  ],
  // BLASTER: the sound of a struck guy wire, a chirp that falls fast: a square and a saw a few
  // tens of hertz apart diving three octaves from 1.9 kHz with a little vibrato, their beating
  // its shimmer; a thin sine zing diving from 5 kHz over the start; a click of noise as it leaves.
  [
    [0, 1900, -9, 0.001, 0.02, 0.2, 0.05, 0.25, 0, 1, 0.34],
    [1, 1960, -9.5, 0.001, 0.02, 0.18, 0.04, 0.2, 0, 1, 0.3],
    [2, 5200, -16, 0.001, 0.005, 0.08, 0, 1, 0, 1, 0.3],
    [3, 9000, -3, 0.001, 0.004, 0.025, 0, 0.6, 0, 1, 0.25],
  ],
  // JET: a jet's roar, two bands of held noise, the lower the louder; a turbine's whine and its
  // shaft's hum, tones a quarter turn late where seam() joins the end to the start (as the
  // engine's), so the loop keeps its level; held, to loop.
  [
    [3, 420, 0, 0.001, 2.1, 0.001, 0.4, 0.12, 0, 1, 0.6],
    [3, 3200, 0, 0.001, 2.1, 0.001, 0.5, 0.3, 0, 1, 0.22],
    [2, 879.74, 0, 0.001, 2.1, 0.001, 0, 1, 0, 1, 0.1],
    [1, 55.07, 0, 0.001, 2.1, 0.001, 0, 0.1, 0, 1, 0.3],
  ],
  // CRASH: a deep thump that dives, a crunch of noise falling, torn plate (two squares a tritone
  // apart, falling) and a rattle of debris, late.
  [
    [2, 75, -2, 0.001, 0.04, 0.4, 0, 1, 0, 1, 1],
    [3, 1500, -2, 0.002, 0.08, 0.35, 0.3, 0.3, 0, 1, 0.7],
    [0, 340, -1.5, 0.002, 0.05, 0.3, 0.08, 0.2, 0, 1, 0.3],
    [0, 480, -1.5, 0.002, 0.04, 0.25, 0.08, 0.2, 0, 1, 0.22],
    [3, 5000, -1, 0.01, 0.1, 0.3, 0.8, 0.5, 0, 1, 0.3, 0.12],
  ],
];

/** The sounds played in a loop: their buffers go through seam. */
export const LOOPED: number[] = [
  SOUND.WIND,
  SOUND.SCRAPE,
  SOUND.HUM,
  SOUND.BUZZ,
  SOUND.CHARGE,
  SOUND.ENGINE,
  SOUND.SKID,
  SOUND.JET,
];

/**
 * Renders the sound `id` of `layers` as mono samples in [-1, 1] at RATE, deterministic (seeded
 * noise), silent at both ends (no click).
 */
export const render = (id: number, layers: Voice[][] = LAYERS): Float32Array => {
  const voices = layers[id].map(
    (v, i) => [synth(v, id * 9 + i), Math.round((v[11] ?? 0) * RATE)] as const,
  );
  // tanh keeps the sum of the voices within [-1, 1].
  return Float32Array.from({ length: Math.max(...voices.map(([v, d]) => d + v.length)) }, (_, i) =>
    Math.tanh(voices.reduce((sum, [v, d]) => sum + (v[i - d] ?? 0), 0)),
  );
};

/**
 * A sound made loopable: the last `x` samples are cross-faded into the first, the length drops by
 * `x`, and the end joins the start. For a stationary sound (a loop's voice is held at full
 * volume, nothing but noise), whose own ends are no longer heard.
 */
export const seam = (s: Float32Array, x = RATE / 10): Float32Array => {
  const n = s.length - x;
  // Equal power: the two parts are not correlated.
  return Float32Array.from({ length: n }, (_, i) =>
    i < x ? s[i] * Math.sqrt(i / x) + s[n + i] * Math.sqrt(1 - i / x) : s[i],
  );
};

/** The music's sample rate: half, as nothing in it but the hats goes past 4 kHz. */
export const MUSIC_RATE = RATE / 2;
const BPM = 84;
const BEAT = (MUSIC_RATE * 60) / BPM;
const BARS = 16;
/** Two bars each, in semitones above A2: Dmaj9, Bm7, Gmaj7, Asus2. */
const CHORDS = [
  [5, 12, 16, 19],
  [2, 9, 12, 17],
  [-2, 5, 9, 14],
  [0, 7, 14, 16],
];
/**
 * The bells over a chord, one character an eighth: a digit is a note of the chord an octave up, two
 * octaves from 4. One line for each half of the loop.
 */
const ARP = ['0...2..3..1.2...', '4..6.5..7..6.5..'];
const HAT: Voice = [3, 30000, 0, 0.001, 0, 0.04, 0, 0.7, 0, 1, 0.3];
const PULSE: Voice = [2, 85, -2, 0.008, 0, 0.2, 0, 1, 0, 1, 0.22];

/**
 * Adds `src` to `to` from sample `at`, read `r` times as fast (a pitch) for `len` samples, wrapping
 * round `to`, with a rise of `a` samples and a fall of `d`, both squared. `src` loops: its last
 * sample repeats its first.
 */
const add = (
  to: Float32Array,
  src: Float32Array,
  at: number,
  r = 1,
  gain = 1,
  len = (src.length - 1) / r,
  a = 1,
  d = 1,
) => {
  // Integer indices, no modulo and no division in the loop: it runs millions of times.
  const end = src.length - 1;
  const [ia, id] = [1 / a, 1 / d];
  for (let j = 0, p = 0, o = (at % to.length) | 0; j < len; j++) {
    const k = p | 0;
    to[o] +=
      gain * (src[k] + (src[k + 1] - src[k]) * (p - k)) * Math.min(1, j * ia, (len - j) * id) ** 2;
    if (++o == to.length) {
      o = 0;
    }
    if ((p += r) >= end) {
      p -= end;
    }
  }
};

/**
 * Adds `pads` to both halves of `mix` and brings its peak to 0.35. Hot loops sit in small functions:
 * V8 compiles a big one on its first hot loop, which costs more than the loop.
 */
const mixdown = (mix: Float32Array, pads: Float32Array) => {
  let peak = 0;
  for (let i = 0; i < pads.length; i++) {
    mix[i] += pads[i];
    mix[i + pads.length] += pads[i];
    peak = Math.max(peak, Math.abs(mix[i]), Math.abs(mix[i + pads.length]));
  }
  for (let i = 0; i < mix.length; i++) {
    mix[i] *= 0.35 / peak;
  }
  return mix;
};

/**
 * The music: sixteen bars in D major at 84 bpm (whole beats, whole samples), slow pads, sparse
 * bells with an echo, soft hats and a muted pulse; mono samples in [-1, 1] at MUSIC_RATE,
 * deterministic, whose end joins its start (every tail wraps onto the start). Quiet enough to sit
 * under the sounds.
 */
export const music = (): Float32Array => {
  const n = BEAT * 4 * BARS;
  // One period of A2: two sines 8 cents apart that beat at half a hertz, a soft octave and twelfth.
  const table = new Float32Array(2 * MUSIC_RATE + 1);
  for (let i = 0; i <= 2 * MUSIC_RATE; i++) {
    const w = (Math.PI * i) / MUSIC_RATE;
    table[i] =
      Math.sin(220 * w) + Math.sin(221 * w) + 0.4 * Math.sin(441 * w) + 0.15 * Math.sin(659 * w);
  }
  // The pads repeat every eight bars: rendered once over half the loop.
  const pads = new Float32Array(n / 2);
  CHORDS.forEach((c, i) =>
    c.forEach(s =>
      add(pads, table, i * 8 * BEAT, 2 ** (s / 12), 0.06, 9.5 * BEAT, 2 * BEAT, 1.5 * BEAT),
    ),
  );
  const mix = new Float32Array(n);
  // A sine bell at A3 with a short inharmonic partial: a higher note is shorter, as a real one.
  const bell = synth([2, 220, 0, 0.004, 0, 1, 0.002, 1, 0, 1, 0.36], 1, MUSIC_RATE);
  synth([2, 607, 0, 0.002, 0, 0.25, 0, 1, 0, 1, 0.1], 1, MUSIC_RATE).forEach(
    (x, i) => (bell[i] += x),
  );
  const hat = synth(HAT, 1, MUSIC_RATE);
  const pulse = synth(PULSE, 1, MUSIC_RATE);
  for (let e = 0; e < BARS * 8; e++) {
    const at = (e * BEAT) / 2;
    const d = +ARP[e >> 6][e & 15];
    // A note and its echoes, a dotted eighth apart.
    for (let k = 0; d >= 0 && k < 3; k++) {
      add(
        mix,
        bell,
        at + k * 0.75 * BEAT,
        2 ** ((CHORDS[(e >> 4) & 3][d & 3] + 12 * (d >> 2)) / 12),
        0.35 ** k,
      );
    }
    if (e & 1) {
      add(mix, hat, at);
    }
    // On the one, and on the three in the second half.
    if (!(e & 7) || ((e & 7) == 4 && e >= BARS * 4)) {
      add(mix, pulse, at);
    }
  }
  return mixdown(mix, pads);
};
