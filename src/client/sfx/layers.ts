import type { Voice } from './synth';

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
  // DOWN: the body falling, knees then trunk: two thumps, the second deeper, and a rustle of
  // the gear. No tone: the death cry is the voice over it.
  [
    [2, 90, -1.2, 0.002, 0.03, 0.3, 0, 1, 0, 1, 0.8],
    [2, 65, -1.5, 0.002, 0.04, 0.35, 0, 1, 0, 1, 0.9, 0.16],
    [3, 3000, 0, 0.01, 0, 0.3, 0.3, 0.1, 0, 1, 0.4, 0.12],
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
  // PAIN: an "ugh" pushed out, 210 Hz falling, the 3rd and 5th harmonics making an "uh", a puff of breath.
  [
    [1, 210, -1.4, 0.006, 0.05, 0.2, 0.025, 0.22, 0, 1, 0.42],
    [2, 630, -1.4, 0.006, 0.05, 0.2, 0.025, 1, 0, 1, 0.3],
    [2, 1050, -1.4, 0.006, 0.04, 0.16, 0.025, 1, 0, 1, 0.14],
    [3, 2500, 0, 0.004, 0.02, 0.12, 0.4, 0.15, 0, 1, 0.4],
  ],
  // DEATH: a voice of its own, scream(); render() never reads this.
  [],
  // AMMO: two clacks of metal, and a square blip that steps up a fifth.
  [
    [3, 7000, 0, 0.001, 0, 0.025, 0, 0.6, 0, 1, 0.55],
    [3, 4500, 0, 0.001, 0, 0.03, 0, 0.5, 0, 1, 0.5, 0.07],
    [0, 392, 0, 0.003, 0.05, 0.07, 0, 0.3, 0.06, 1.5, 0.35, 0.03],
  ],
  // ARMOR: a low saw rising through a filter, a fifth ringing over it, a high shimmer.
  [
    [1, 110, 2, 0.01, 0.15, 0.25, 0, 0.25, 0, 1, 0.45],
    [2, 660, 0, 0.02, 0.12, 0.35, 0.02, 1, 0.12, 1.5, 0.3, 0.05],
    [2, 1320, 0.3, 0.02, 0.1, 0.4, 0.015, 1, 0, 1, 0.18, 0.1],
  ],
  // ALARM: a klaxon, two tones down a fourth, twice.
  [
    [0, 880, 0, 0.01, 0.16, 0.04, 0, 0.35, 0.2, 0.75, 0.45],
    [0, 880, 0, 0.01, 0.16, 0.04, 0, 0.35, 0.2, 0.75, 0.45, 0.42],
  ],
  // STRIKE: saws diving out of the sky, a roar of noise and a deep boom under them.
  [
    [1, 2400, -2.5, 0.01, 0.3, 0.5, 0.04, 0.5, 0, 1, 0.3],
    [1, 1800, -2, 0.02, 0.25, 0.55, 0.05, 0.4, 0, 1, 0.25, 0.08],
    [3, 3000, -1.5, 0.01, 0.3, 0.5, 0, 0.3, 0, 1, 0.45, 0.1],
    [2, 70, -1, 0.005, 0.15, 0.6, 0, 1, 0, 1, 0.7, 0.15],
  ],
  // XENO_HISS: breath forced through teeth, bright then dull, over a wobbling growl in the chest.
  [
    [3, 9000, 0, 0.08, 0.35, 0.35, 0, 0.5, 0, 1, 0.45],
    [3, 3000, 0, 0.1, 0.3, 0.35, 0.3, 0.15, 0, 1, 0.3],
    [1, 85, 0, 0.1, 0.3, 0.3, 0.12, 0.08, 0, 1, 0.35],
  ],
  // SHRIEK: a scream rising then torn off, a saw and a square a fifth up shaking over a rasp.
  [
    [1, 900, 0.7, 0.01, 0.14, 0.3, 0.06, 0.35, 0, 1, 0.35],
    [0, 1350, 0.7, 0.01, 0.12, 0.28, 0.07, 0.2, 0, 1, 0.14],
    [3, 6000, 0.3, 0.005, 0.12, 0.25, 0.4, 0.4, 0, 1, 0.35],
    [2, 1800, 0.7, 0.01, 0.1, 0.25, 0.08, 1, 0, 1, 0.12],
  ],
  // CLAW: a swipe that cuts the air high and fast, then the claws' tips clicking together.
  [
    [3, 16000, -2, 0.004, 0.02, 0.1, 0, 0.6, 0, 1, 0.45],
    [3, 9000, 0, 0.001, 0, 0.02, 0, 0.9, 0, 1, 0.35, 0.05],
    [3, 7000, 0, 0.001, 0, 0.02, 0, 0.9, 0, 1, 0.25, 0.08],
  ],
  // STING: the tail whipping through the air and cracking at the end, a dull thump in it.
  [
    [3, 14000, -3, 0.002, 0.01, 0.12, 0, 0.7, 0, 1, 0.55],
    [2, 500, -4, 0.002, 0, 0.1, 0, 1, 0, 1, 0.3],
    [3, 4000, 0, 0.001, 0, 0.05, 0, 0.8, 0, 1, 0.45, 0.1],
  ],
  // XENO_PAIN: a short screech dropping away, a saw and a square shaking over a hiss.
  [
    [1, 700, -1, 0.005, 0.05, 0.18, 0.1, 0.3, 0, 1, 0.35],
    [0, 1050, -1, 0.005, 0.04, 0.16, 0.1, 0.2, 0, 1, 0.12],
    [3, 5000, 0, 0.005, 0.05, 0.15, 0.4, 0.3, 0, 1, 0.35],
  ],
  // XENO_DEATH (the user, 2026-11-16: a big roar): a deep growl swelling over a sub's rumble, a
  // rasp of breath all through it, and a screech torn out of it and falling away.
  [
    [1, 90, 0.5, 0.06, 0.42, 0.45, 0.15, 0.12, 0, 1, 0.4],
    [1, 270, 0.5, 0.06, 0.42, 0.45, 0.15, 0.2, 0, 1, 0.2],
    [2, 50, 0.3, 0.03, 0.4, 0.5, 0, 1, 0, 1, 0.35],
    [3, 2200, 0, 0.08, 0.42, 0.42, 0.5, 0.25, 0, 1, 0.35],
    [1, 640, -0.9, 0.05, 0.22, 0.35, 0.1, 0.3, 0, 1, 0.25, 0.28],
  ],
  // CHITIN (the user, 2026-11-16: dry chitin clicks, wet organic friction, heavy impacts on stone):
  // the claws' tips clicking down one after another, a dull thump of the weight into the stone with
  // its grit, then the wet pad sliding and sucking off the floor.
  [
    [0, 3800, 0, 0.001, 0, 0.006, 0, 0.5, 0, 1, 0.22],
    [0, 3100, 0, 0.001, 0, 0.005, 0, 0.5, 0, 1, 0.16, 0.017],
    [3, 9000, 0, 0.001, 0, 0.004, 0, 0.9, 0, 1, 0.18, 0.031],
    [2, 85, -3, 0.002, 0.01, 0.12, 0, 1, 0, 1, 0.6, 0.004],
    [3, 5000, -1, 0.001, 0, 0.04, 0, 0.35, 0, 1, 0.28, 0.004],
    [3, 2200, 1.5, 0.015, 0.02, 0.08, 0.6, 0.25, 0, 1, 0.3, 0.02],
    [2, 380, 3, 0.002, 0, 0.03, 0, 1, 0, 1, 0.1, 0.06],
  ],
  // ACID: a fizz crackling bright and wavering, over a dull sizzle that dies away.
  [
    [3, 18000, 0, 0.01, 0.3, 0.5, 0.6, 0.7, 0, 1, 0.3],
    [3, 3000, 0, 0.02, 0.2, 0.4, 0.3, 0.12, 0, 1, 0.3],
  ],
  // ROAR: a growl swelling up from the chest into a screech, a rasp of breath all through it.
  [
    [1, 110, 0.9, 0.08, 0.32, 0.42, 0.15, 0.12, 0, 1, 0.45],
    [1, 330, 0.9, 0.08, 0.32, 0.42, 0.15, 0.2, 0, 1, 0.2],
    [3, 2500, 0, 0.1, 0.3, 0.42, 0.5, 0.2, 0, 1, 0.4],
    [1, 700, 0.5, 0.05, 0.18, 0.35, 0.08, 0.3, 0, 1, 0.25, 0.2],
  ],
  // XENO_LAND: the whole weight hitting the stone, deeper and longer than a step, its plates
  // clattering against each other, and a wet slap of the pads spreading out.
  [
    [2, 60, -2.5, 0.002, 0.02, 0.22, 0, 1, 0, 1, 0.9],
    [3, 4500, -1, 0.001, 0, 0.08, 0, 0.3, 0, 1, 0.45],
    [0, 3600, 0, 0.001, 0, 0.006, 0, 0.5, 0, 1, 0.2, 0.012],
    [0, 2900, 0, 0.001, 0, 0.006, 0, 0.5, 0, 1, 0.18, 0.026],
    [0, 4200, 0, 0.001, 0, 0.005, 0, 0.5, 0, 1, 0.14, 0.041],
    [3, 1800, 1, 0.01, 0.04, 0.12, 0.6, 0.2, 0, 1, 0.35, 0.015],
  ],
  // SMASH: the fist's weight, a sine thump diving, a sharp crack and the skull giving in three
  // clicks of bright noise, then a wet splatter of wavering noise and a low squelch under it.
  [
    [2, 95, -3, 0.001, 0.01, 0.22, 0, 1, 0, 1, 1],
    [3, 7000, -2, 0.001, 0, 0.05, 0, 0.6, 0, 1, 0.7],
    [3, 9000, 0, 0.001, 0, 0.012, 0, 0.8, 0, 1, 0.4, 0.018],
    [3, 7500, 0, 0.001, 0, 0.012, 0, 0.8, 0, 1, 0.32, 0.041],
    [3, 8500, 0, 0.001, 0, 0.01, 0, 0.8, 0, 1, 0.25, 0.066],
    [3, 1400, 1, 0.01, 0.06, 0.28, 0.7, 0.2, 0, 1, 0.6, 0.03],
    [1, 230, -2, 0.005, 0.03, 0.14, 0.3, 0.25, 0, 1, 0.3, 0.025],
  ],
  // HER_DEATH, GROAN, HER_GROAN: voices of their own, scream(); render() never reads these.
  [],
  [],
  [],
  // HARPOON (the user, 2026-11-24: darker, more menacing): a dull pneumatic snap, a heavy thud
  // of the launcher kicking, the cable's growl as two low saws a few hertz apart beat against
  // each other while falling, and a dark rush of air after the bolt.
  [
    [3, 1800, -2, 0.001, 0, 0.05, 0, 0.3, 0, 1, 0.4],
    [2, 72, -2, 0.001, 0.02, 0.2, 0, 1, 0, 1, 0.8],
    [1, 145, -0.7, 0.002, 0.03, 0.3, 0.08, 0.14, 0, 1, 0.32, 0.01],
    [1, 149, -0.7, 0.002, 0.03, 0.3, 0.08, 0.14, 0, 1, 0.28, 0.01],
    [3, 900, -1.2, 0.01, 0.03, 0.24, 0, 0.12, 0, 1, 0.38, 0.02],
  ],
  // HUNTER_PAIN: an original guttural chirr, metallic clicks over a low rasp.
  [
    [3, 2600, -1.5, 0.001, 0.02, 0.16, 0.25, 0.18, 0, 1, 0.42],
    [1, 150, 1.1, 0.012, 0.05, 0.2, 0.15, 0.12, 0, 1, 0.4],
    [0, 1700, 0, 0.001, 0, 0.018, 0, 0.45, 0, 1, 0.24, 0.065],
  ],
  // HUNTER_DEATH: an unvoiced shriek climbing into a descending, broken growl.
  [
    [3, 4200, 0.9, 0.015, 0.13, 0.32, 0.35, 0.12, 0, 1, 0.45],
    [1, 95, 1.7, 0.04, 0.18, 0.38, 0.18, 0.11, 0, 1, 0.5],
    [2, 520, -1.5, 0.03, 0.08, 0.28, 0.22, 0.18, 0, 1, 0.3, 0.12],
  ],
  // HUNTER_TAUNT: three dry clicks, a bent metallic call, and a low answering pulse.
  [
    [0, 2200, 0, 0.001, 0, 0.014, 0, 0.4, 0, 1, 0.28],
    [0, 3100, 0, 0.001, 0, 0.013, 0, 0.4, 0, 1, 0.24, 0.075],
    [0, 1900, 0, 0.001, 0, 0.015, 0, 0.4, 0, 1, 0.28, 0.15],
    [1, 190, 1.4, 0.025, 0.1, 0.25, 0.12, 0.16, 0, 1, 0.35, 0.17],
    [2, 720, -0.8, 0.015, 0.05, 0.2, 0.2, 0.2, 0, 1, 0.3, 0.2],
  ],
  // HUNTER_BLADE_DRAW, timed on the blades sliding out (BLADE_EXTEND, 0.3 s; the user,
  // 2026-11-24: a sound as they unfold, the first was too faint to be one): two ratchet teeth, a
  // loud rising scrape of steel on steel all the way out with a whine under it, then each blade's
  // hard locking click as it reaches its stop, the bracer's thunk, and a ring of two partials.
  [
    [0, 1750, -1.8, 0.001, 0, 0.018, 0, 0.35, 0, 1, 0.34],
    [0, 2100, 0, 0.001, 0, 0.012, 0, 0.35, 0, 1, 0.26, 0.03],
    [3, 6000, 1.4, 0.02, 0.19, 0.05, 0, 0.3, 0, 1, 0.42, 0.04],
    [1, 620, 2.4, 0.02, 0.18, 0.05, 0.1, 0.22, 0, 1, 0.26, 0.05],
    [0, 2600, 0, 0.001, 0, 0.018, 0, 0.35, 0, 1, 0.42, 0.29],
    [0, 2250, 0, 0.001, 0, 0.018, 0, 0.35, 0, 1, 0.36, 0.315],
    [2, 130, -1.6, 0.001, 0.01, 0.1, 0, 0.4, 0, 1, 0.5, 0.29],
    [2, 3400, -0.2, 0.001, 0, 0.36, 0.02, 1, 0, 1, 0.16, 0.3],
    [2, 5080, -0.2, 0.001, 0, 0.26, 0.02, 1, 0, 1, 0.09, 0.3],
  ],
  // HUNTER_BLADE_SHEATHE: a clipped latch, a short descending slide and a dull bracer thunk.
  [
    [0, 2300, 0, 0.001, 0, 0.018, 0, 0.3, 0, 1, 0.28],
    [1, 1450, -2.1, 0.003, 0.01, 0.08, 0.1, 0.22, 0, 1, 0.3, 0.015],
    [2, 125, -1.5, 0.002, 0.015, 0.09, 0, 0.3, 0, 1, 0.48, 0.065],
  ],
  // HUNTER_BLADE_SWISH: a filtered metallic rasp with a bent, airy whistle above it.
  [
    [3, 7600, -2.2, 0.002, 0, 0.12, 0, 0.17, 0, 1, 0.42],
    [1, 2100, -2.8, 0.004, 0.012, 0.13, 0.2, 0.24, 0, 1, 0.24],
    [2, 980, 2.8, 0.006, 0.008, 0.095, 0.1, 0.2, 0, 1, 0.2, 0.018],
  ],
  // HUNTER_BLADE_HIT: a low, compact strike under two bright, uneven metal ticks.
  [
    [2, 105, -2.3, 0.001, 0.012, 0.16, 0, 0.5, 0, 1, 0.75],
    [3, 6400, -1, 0.001, 0, 0.055, 0, 0.22, 0, 1, 0.52],
    [1, 1350, -1.9, 0.001, 0.008, 0.12, 0.1, 0.3, 0, 1, 0.32, 0.016],
    [0, 2900, 0, 0.001, 0, 0.013, 0, 0.35, 0, 1, 0.25, 0.038],
  ],
  // HUNTER_DISC_THROW: a blade cutting the air (the user, 2026-11-24: sharper): a bright hiss of
  // air torn open, falling fast, a thinner body under it and a high steel whistle bending down.
  [
    [3, 9500, -2.6, 0.002, 0.012, 0.15, 0, 0.55, 0, 1, 0.48],
    [3, 4200, -1.6, 0.008, 0.02, 0.16, 0, 0.3, 0, 1, 0.28, 0.008],
    [2, 3400, -1.9, 0.002, 0.012, 0.17, 0.06, 1, 0, 1, 0.16],
  ],
  // HUNTER_DISC_RETURN: an inward-bending whistle with two short locator clicks.
  [
    [1, 690, 2.5, 0.005, 0.025, 0.2, 0.25, 0.18, 0, 1, 0.26],
    [2, 1040, 2.1, 0.006, 0.02, 0.18, 0.16, 0.16, 0, 1, 0.23, 0.018],
    [0, 2250, 0, 0.001, 0, 0.014, 0, 0.35, 0, 1, 0.2, 0.045],
    [0, 2850, 0, 0.001, 0, 0.014, 0, 0.35, 0, 1, 0.18, 0.11],
  ],
  // HUNTER_DISC_CATCH: the disc slapped into the palm (the user, 2026-11-24: a dull, light knock):
  // a clap in the low mids (2026-11-24: neither boomy nor sharp): two bursts of dull noise 8 ms
  // apart, as palms meet, over a short body at 210 Hz; then the metal of the disc in the
  // gauntlet (the user, 2026-11-24): two inharmonic partials ringing briefly.
  [
    [3, 1100, -1, 0.001, 0, 0.045, 0, 0.2, 0, 1, 0.55],
    [3, 950, -1, 0.001, 0, 0.06, 0, 0.18, 0, 1, 0.45, 0.008],
    [2, 210, -1.5, 0.001, 0.004, 0.06, 0, 0.5, 0, 1, 0.45],
    [2, 2380, -0.1, 0.001, 0.004, 0.22, 0.02, 1, 0, 1, 0.16, 0.004],
    [2, 3710, -0.1, 0.001, 0.002, 0.14, 0.02, 1, 0, 1, 0.1, 0.004],
  ],
  // HUNTER_LOCK: three rising finder pulses resolve into a steady confirmation tone.
  [
    [0, 720, 0.5, 0.001, 0, 0.035, 0, 0.3, 0, 1, 0.24],
    [0, 980, 0.5, 0.001, 0, 0.035, 0, 0.3, 0, 1, 0.25, 0.095],
    [0, 1320, 0.5, 0.001, 0, 0.04, 0, 0.3, 0, 1, 0.34, 0.19],
    [2, 1760, 0, 0.006, 0.035, 0.15, 0.08, 0.2, 0, 1, 0.2, 0.255],
  ],
  // HUNTER_LASER (the user, 2026-11-24: darker, more menacing): a muffled crack, a sub boom
  // diving from 55 Hz, a low growl of two detuned saws beating as they fall, a square's grunt in
  // the low mids, and a dark rumble of noise rolling away after it.
  [
    [3, 2400, -1.5, 0.001, 0, 0.06, 0, 0.1, 0, 1, 0.35],
    [2, 55, -1.5, 0.002, 0.06, 0.5, 0, 1, 0, 1, 0.95, 0.015],
    [1, 110, -0.8, 0.004, 0.05, 0.42, 0.05, 0.12, 0, 1, 0.42, 0.01],
    [1, 113, -0.8, 0.004, 0.05, 0.42, 0.05, 0.12, 0, 1, 0.36, 0.01],
    [0, 220, -2, 0.001, 0.01, 0.18, 0.12, 0.15, 0, 1, 0.22, 0.01],
    [3, 400, -1, 0.01, 0.1, 0.5, 0, 0.06, 0, 1, 0.45, 0.03],
  ],
  // HARPOON_RELOAD: the next bolt sliding home (the user, 2026-11-25: a very short slide and a
  // brief click): a quick hiss of steel on steel for 0.2 s, rising a little, one thin partial in
  // it; as it seats (0.23 s in: harpoonFeed() takes 0.2 of the 1.3 s reload) one dry click.
  [
    [3, 6000, 0.8, 0.02, 0.13, 0.05, 0, 0.3, 0, 1, 0.3],
    [2, 3100, 0.5, 0.02, 0.12, 0.05, 0.05, 1, 0, 1, 0.04],
    [0, 2600, -2, 0.001, 0, 0.012, 0, 0.6, 0, 1, 0.45, 0.23],
    [3, 9000, 0, 0.001, 0, 0.018, 0, 0.7, 0, 1, 0.3, 0.23],
    [2, 320, -2, 0.001, 0, 0.04, 0, 1, 0, 1, 0.22, 0.23],
  ],
  // HUNTER_FLASH: a flash unit's whine charging up in 80 ms, then its pop: a burst of bright noise,
  // a low thump under it and an electric zap falling away.
  [
    [1, 900, 6, 0.01, 0.06, 0.015, 0, 0.3, 0, 1, 0.2],
    [2, 2400, 4, 0.01, 0.05, 0.02, 0, 1, 0, 1, 0.12],
    [3, 9000, -2, 0.001, 0.01, 0.2, 0, 0.5, 0, 1, 0.6, 0.08],
    [2, 170, -3, 0.001, 0.01, 0.14, 0, 1, 0, 1, 0.55, 0.08],
    [0, 3200, -2.5, 0.001, 0, 0.14, 0.1, 0.3, 0, 1, 0.22, 0.085],
  ],
  // HEARTBEAT: one beat of a slow heart (65 a minute), its lub then its dub 0.27 s later, each a
  // deep falling thump with a duller knock over it; a silent voice holds the loop to 0.92 s.
  [
    [2, 58, -1.2, 0.006, 0.03, 0.15, 0, 1, 0, 1, 0.95],
    [2, 120, -2, 0.003, 0.01, 0.08, 0, 1, 0, 1, 0.45],
    [3, 260, 0, 0.004, 0.015, 0.07, 0, 0.12, 0, 1, 0.5],
    [2, 66, -1.4, 0.005, 0.02, 0.13, 0, 1, 0, 1, 0.75, 0.27],
    [2, 135, -2, 0.003, 0.01, 0.06, 0, 1, 0, 1, 0.35, 0.27],
    [2, 1, 0, 0.01, 0.9, 0.01, 0, 1, 0, 1, 0],
  ],
  // STATIC: a voice of its own, radio(); render() never reads this.
  [],
  // HUNTER_TRACK: each click a 700 Hz square burst of 27 ms, low-passed, over a tick of noise;
  // the breath of noise 0.28 s in.
  [
    ...[0, 0.075, 0.15].flatMap((late): Voice[] => [
      [0, 700, 0, 0.001, 0.012, 0.014, 0, 0.35, 0, 1, 0.45, late],
      [3, 7000, 0, 0.001, 0, 0.012, 0, 0.5, 0, 1, 0.22, late],
    ]),
    [3, 5000, 0, 0.05, 0.06, 0.08, 0, 0.25, 0, 1, 0.2, 0.28],
  ],
  // HUNTER_SEEK: 2 s, looped (seam()) like the others. Each tone flanked by two 65 Hz off, the hum's buzz (their
  // beat); the 1500 Hz one beats with 1507 Hz at 7 Hz, the hum's slow sway.
  [
    [2, 1507, 0, 0.001, 2.1, 0.001, 0, 1, 0, 1, 0.3],
    [2, 1442, 0, 0.001, 2.1, 0.001, 0, 1, 0, 1, 0.13],
    [2, 1572, 0, 0.001, 2.1, 0.001, 0, 1, 0, 1, 0.13],
    [2, 1500, 0, 0.001, 2.1, 0.001, 0, 1, 0, 1, 0.08],
    [2, 1217, 0, 0.001, 2.1, 0.001, 0, 1, 0, 1, 0.15],
    [2, 1152, 0, 0.001, 2.1, 0.001, 0, 1, 0, 1, 0.07],
    [2, 1282, 0, 0.001, 2.1, 0.001, 0, 1, 0, 1, 0.07],
  ],
  // HARPOON_HIT: a hard crack, a deep thump under it, a dull burst of debris and the bolt's steel
  // ringing briefly.
  [
    [3, 9000, -2, 0.001, 0, 0.04, 0, 0.6, 0, 1, 0.55],
    [2, 95, -2.5, 0.001, 0.015, 0.16, 0, 1, 0, 1, 0.8],
    [3, 1200, -1, 0.001, 0.01, 0.12, 0, 0.2, 0, 1, 0.45],
    [2, 2650, -0.2, 0.001, 0.005, 0.2, 0.03, 1, 0, 1, 0.14, 0.004],
    [2, 4100, -0.2, 0.001, 0.003, 0.12, 0.03, 1, 0, 1, 0.08, 0.004],
  ],
  // HARPOON_OPEN, timed on the unfolding (HARPOON_DRAW, 1.1 s, eased: slow, fast, slow): a catch
  // let go, then the slide and the stock grinding out over 0.85 s, the grit and a low motor-like saw
  // rising as they gather speed, six ratchet teeth along the way, and at 0.98 s the lock: a hard
  // double clack, a deep thud of the parts meeting their stops and a short ring of the tube.
  [
    [0, 2200, -1.5, 0.001, 0, 0.02, 0, 0.35, 0, 1, 0.3],
    [3, 4800, 0.6, 0.12, 0.6, 0.18, 0, 0.18, 0, 1, 0.3, 0.06],
    [1, 160, 1.1, 0.12, 0.6, 0.16, 0.08, 0.15, 0, 1, 0.26, 0.06],
    ...[0.22, 0.36, 0.48, 0.6, 0.71, 0.81].map((late): Voice => [
      0,
      1900,
      0,
      0.001,
      0,
      0.012,
      0,
      0.3,
      0,
      1,
      0.18,
      late,
    ]),
    [0, 2500, -2, 0.001, 0, 0.018, 0, 0.55, 0, 1, 0.42, 0.98],
    [0, 1700, -2, 0.001, 0, 0.02, 0, 0.5, 0, 1, 0.34, 1.02],
    [2, 110, -2.5, 0.001, 0.015, 0.14, 0, 1, 0, 1, 0.7, 0.98],
    [2, 2100, -0.2, 0.001, 0.02, 0.3, 0.03, 1, 0, 1, 0.12, 0.99],
    [2, 3350, -0.2, 0.001, 0.01, 0.2, 0.03, 1, 0, 1, 0.06, 0.99],
  ], // HUNTER_CLICKS: fourteen throat clicks speeding up then slowing, each a dry square tick with a
  // grain of noise, alternately higher and lower, over a gurgling 85 Hz saw that rises and falls.
  [
    ...[
      0, 0.07, 0.13, 0.18, 0.225, 0.265, 0.3, 0.335, 0.37, 0.41, 0.455, 0.505, 0.565, 0.635,
    ].flatMap((late, i): Voice[] => [
      [0, i % 2 ? 1250 : 1650, -1, 0.001, 0.004, 0.016, 0, 0.3, 0, 1, 0.34, late],
      [3, 6000, 0, 0.001, 0, 0.01, 0, 0.45, 0, 1, 0.18, late],
    ]),
    [1, 85, 0.4, 0.04, 0.45, 0.2, 0.3, 0.12, 0, 1, 0.3, 0.02],
    [3, 420, 0, 0.05, 0.4, 0.2, 0, 0.08, 0, 1, 0.2, 0.02],
  ],
  // HUNTER_GROWL: a deep roar rolling under a rasp: two saws an octave and a fifth apart sliding
  // down with a wide vibrato, a breath of low noise, and a guttural tail.
  [
    [1, 72, -0.35, 0.08, 0.45, 0.35, 0.5, 0.14, 0, 1, 0.5],
    [1, 108, -0.4, 0.08, 0.4, 0.35, 0.6, 0.12, 0, 1, 0.3],
    [1, 144, -0.3, 0.06, 0.35, 0.3, 0.4, 0.1, 0, 1, 0.22],
    [3, 900, -0.6, 0.06, 0.4, 0.4, 0, 0.1, 0, 1, 0.32],
    [1, 58, -0.8, 0.02, 0.06, 0.26, 0.7, 0.12, 0, 1, 0.35, 0.6],
  ],
  // WADE: the splash, its spray and a bubble sliding up.
  [
    [3, 6000, -1.5, 0.003, 0.01, 0.2, 0, 0.3, 0, 1, 0.8],
    [3, 9000, 0, 0.002, 0, 0.1, 0.3, 0.6, 0, 1, 0.4, 0.01],
    [2, 380, 1.8, 0.002, 0, 0.08, 0, 1, 0, 1, 0.25, 0.03],
  ],
  // SWIM: a wash of water and a rustle over it, both swelling and ebbing.
  [
    [3, 5000, 0, 0.001, 2.1, 0.001, 0.7, 0.16, 0, 1, 0.6],
    [3, 2200, 0, 0.001, 2.1, 0.001, 0.4, 0.08, 0, 1, 0.7],
  ],
  // SLICE: the blade's bite, a sharp hiss falling fast, a meaty thump under it and the blade's
  // electric crackle, a buzzing square trilled by the arpeggio.
  [
    [3, 7000, -5, 0.001, 0.015, 0.11, 0, 0.55, 0, 1, 0.75],
    [3, 2600, -3, 0.002, 0.03, 0.14, 0, 0.3, 0, 1, 0.55, 0.01],
    [2, 120, -3, 0.001, 0.02, 0.12, 0, 1, 0, 1, 0.7],
    [0, 180, 0, 0.001, 0.06, 0.14, 0.3, 0.35, 0.012, 1.6, 0.22, 0.01],
  ],
  // REND: the claws through flesh, three tears in a row, each lower, and a dull thump.
  [
    [3, 5200, -6, 0.001, 0.01, 0.07, 0, 0.5, 0, 1, 0.6],
    [3, 4400, -6, 0.001, 0.01, 0.07, 0, 0.45, 0, 1, 0.55, 0.035],
    [3, 3600, -6, 0.001, 0.01, 0.08, 0, 0.4, 0, 1, 0.5, 0.07],
    [2, 105, -2.5, 0.001, 0.02, 0.1, 0, 1, 0, 1, 0.6],
  ],
  // KILL: the blow that drops him, a deep boom sliding down, a low noise swell and a metallic ring.
  [
    [2, 70, -1.2, 0.001, 0.05, 0.5, 0, 1, 0, 1, 0.85],
    [3, 900, -1, 0.002, 0.05, 0.35, 0, 0.15, 0, 1, 0.5],
    [2, 1250, 0, 0.002, 0, 0.6, 0.05, 1, 0, 1, 0.14, 0.02],
    [2, 1930, 0, 0.002, 0, 0.45, 0.05, 1, 0, 1, 0.1, 0.02],
  ],
  // SEVER: a wet crunch, a crackle of noise falling, a hard low knock and a squelch after it.
  [
    [3, 1800, -4, 0.001, 0.02, 0.16, 0.6, 0.35, 0, 1, 0.7],
    [2, 150, -4, 0.001, 0.01, 0.09, 0, 1, 0, 1, 0.65],
    [3, 700, 2, 0.004, 0.03, 0.12, 0.4, 0.2, 0, 1, 0.45, 0.06],
  ],
];
