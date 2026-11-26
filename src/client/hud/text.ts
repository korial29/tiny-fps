import { PARRY, PARRY_WIDE, RULES, XENO_HP } from '../../shared/constants';

/** The menu of a game paused by Escape (the user, 2026-11-12): play on, then the two parts of the title screen it opens, then leave. */
export const PAUSE = ['Resume', 'Controls', 'Character', 'Audio', 'Quit'];

/** The tabs of the title screen's menu, the first one shown first. */
export const TABS = ['Game', 'Controls', 'Audio'];
/** The Audio panel's sliders (the user, 2026-11-20): a name, and its bus in LEVELS (audio.ts). */
export const MIXES: [name: string, bus: number][] = [
  ['Music', 6],
  ['Voices', 0],
  ['Movement', 1],
  ['Weapons', 2],
  ['Vehicles', 3],
  ['Breathing', 4],
  ['Game events', 5],
];

/** The characters' first names (the user, 2026-11-11: names, not "man" and "woman"), in BODY's order, and the size of the character's picture in pixels. */
export const CAST = ['Kai', 'Nova'];
export const SHOT = [480, 640];
/** The size of a haircut's picture, pixels. */
export const HEAD_PX = 112;

/** The haircuts of each body, in HAIRS_N's order: the man's by length (LENGTHS, soldier.ts), the woman's STYLE (hair.ts). */
export const HAIR_NAMES = [
  ['Shaved', 'Buzz', 'Short', 'Full'],
  ['Ponytail', 'Bob', 'Bun', 'Braid', 'Undercut'],
];

/** The classes, in ROLE's order (kit.ts): the name, what it is good at, what it pays for it, and where it plays. */
export const ROLES: [name: string, pros: string, cons: string, where: string][] = [
  [
    'Marine',
    'Full ammo, magazines, rate of fire and damage with every gun.',
    'The standard moves: one dash, normal speed and jumps.',
    'City maps',
  ],
  [
    'Ninja',
    `20 % faster, higher jumps, 2× wall-run time, 3 dashes. Starts with a katana. Katana and fists attack twice as fast. Between swings the katana parries ${Math.round(PARRY * 100)} % of frontal shots even on the run, deflecting ${Math.round(PARRY_WIDE * 100)} % of parries sideways and the rest toward the aim.`,
    'Half ammo, magazine size, fire rate and damage. Guns slow movement.',
    'City maps',
  ],
  [
    'Astronaut',
    'The marine’s full firepower, in a suit made for the moon’s low gravity.',
    'The standard moves; plays nowhere but the moon.',
    'Moon only',
  ],
  [
    'Xenomorph',
    `${XENO_HP} health, slightly faster, double jump height, runs up walls. Chains 3 longer dashes that pin foes. A head bite heals it. Claws, a chargeable tail, acid blood and vision through walls.`,
    'Melee only. No armour or vehicles.',
    'Every map',
  ],
  [
    'Hunter',
    "Slot 1 has twin wrist blades, which slash and never thrust. Slot 2 is his pistol, as the marine's gun. Slot 3 unfolds the harpoon rifle: hold right click or G to zoom through its scope, left click fires. Each bolt deals 4 HP and reloads in 1.3 seconds. Slot 4 unfolds the shoulder cannon: each click fires a beam for 3 HP; keep a foe in its sight for 3 seconds to lock on and its shots home in. Slot 5 is his disc: left click throws it (3 HP) and it comes back like a boomerang. He spawns with the blades alone and finds the rest on the racks. No fists.",
    'Press V to cycle thermal vision and alien detection.',
    'Every map',
  ],
];

/** A skin tone (TONES, linear) as a CSS colour. */
export const swatch = (t: number[]) =>
  `rgb(${t.map(v => Math.round(255 * Math.min(1, v) ** (1 / 2.2))).join()})`;

/** Capture the flag in a few lines, with the room's default rules. */
export const GOAL = [
  'Two teams, two flags. Take the enemy flag from its base and run it home.',
  'A capture counts only while your own flag is at home.',
  `First team to ${RULES.scoreLimit} captures wins, or the one ahead after ${RULES.timeLimit / 60} minutes.`,
  'Find basic weapons near your spawn and heavier weapons along the routes.',
];

/**
 * The controls of the title screen, a group each: the caps of a row split by `|` (a `+`, `/`, `or`
 * or `twice` between them stays text), what they do, and the KeyboardEvent.codes the row tells,
 * which together must be all of input.ts's CODES.
 */
export const CONTROLS: [group: string, rows: [keys: string, does: string, codes?: string][]][] = [
  [
    'Movement',
    [
      ['Mouse', 'look'],
      [
        'W|A|S|D|or|Arrows',
        'move (ZQSD on AZERTY)',
        'KeyW KeyA KeyS KeyD ArrowUp ArrowDown ArrowLeft ArrowRight',
      ],
      ['Shift', 'sprint', 'ShiftLeft ShiftRight'],
      ['Space', 'jump, again in the air', 'Space'],
      ['Q', 'dash toward the keys held (A on AZERTY)', 'KeyQ'],
      ['Move key|twice', 'dash that way'],
      ['C', 'crouch, slide when fast', 'KeyC'],
    ],
  ],
  [
    'Combat',
    [
      ['Left click', 'fire, hold to charge; bare hands: punch'],
      ['Click|again', 'bare hands, as a punch lands: cross, then hook'],
      ['Shift|+|Left click', 'bare hands, at a sprint: lunge'],
      ['R', 'swap the battery', 'KeyR'],
      [
        '1|2|3|4|5',
        'fists, katana, gun, laser rifle, rail gun',
        'Digit1 Digit2 Digit3 Digit4 Digit5',
      ],
      [
        'Numpad 1|Numpad 2|Numpad 3|Numpad 4|Numpad 5',
        'fists, katana, gun, laser rifle, rail gun',
        'Numpad1 Numpad2 Numpad3 Numpad4 Numpad5',
      ],
      ['Wheel', 'next weapon'],
      ['G|or|Right click', 'gun: burst of 3; rail gun: shock ring; rifle: grenade', 'KeyG'],
    ],
  ],
  [
    'Hunter',
    [
      ['1', 'wrist blades, no thrust'],
      ['2', 'harpoon; hold G or right click to zoom through its scope, left click fires'],
      ['3', 'shoulder cannon: click fires (3 HP); 3 seconds on a target locks its aim'],
      ['4', 'disc: click throws it (3 HP), it comes back like a boomerang'],
      ['V', 'cycle normal, thermal and alien scan', 'KeyV'],
    ],
  ],
  [
    'Xenomorph',
    [
      ['Shift|+|W', 'facing a wall: cling to it, then W goes where you look on it, A and D across'],
      ['Space', 'on a wall: leap off along the look'],
      ['C', 'on a wall: let go'],
      [
        'Q|or|W A S D twice',
        'dash, three in a row and further than a man: it pins whoever it reaches',
      ],
      ['Left click', 'claws, left then right'],
      ['Right click|or|G', 'tail: slow; W stab, A or D sweep, else lash'],
      ['Hold right click|or|G', 'hold to charge range, arc and damage. Release to strike.'],
      ['Right click|or|G|twice', 'release to spin or leap and strike'],
    ],
  ],
  [
    'Katana',
    [
      ['Left click', 'slash'],
      ['W|+|Left click', 'thrust'],
      ['A|or|D|+|Left click', 'cut across'],
      ['G|or|Right click', 'energy arc'],
      ['Double click', 'special: lunge, energy arc, leap'],
      ['Blades locked', 'click fast; step aside to break'],
    ],
  ],
  [
    'Rover',
    [
      ['E', 'get in, get out', 'KeyE'],
      ['W|S', 'drive toward the look'],
      ['Shift', 'boost'],
      ['Space', 'handbrake'],
      ['Left click', 'lasers'],
    ],
  ],
  [
    'Ship',
    [
      ['E', 'board, get out'],
      ['Mouse', 'aim the nose'],
      ['W|S', 'thrust, brake'],
      ['A|D', 'slide'],
      ['Space|C', 'climb, sink'],
      ['Shift', 'boost'],
      ['Left click', 'lasers'],
      ['G|or|Right click', 'missiles'],
    ],
  ],
  [
    'Game',
    [
      ['M', 'mute', 'KeyM'],
      ['B', 'see through a bot’s eyes: its way, its goal; again for the next'],
      ['Esc', 'this screen'],
    ],
  ],
];

/** Seconds the way out is shown after sitting down. */
export const OUT_HINT = 4;
/** The prompt of a glory kill on offer, drawn pulsing. */
export const GLORY_ACT = 'glory kill';
