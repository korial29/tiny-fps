// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE } from '../../test/teams';
import { FLAG } from '../shared/types';
import type { FlagState } from '../shared/types';
import { GUN_MAG, HP_MAX, RIFLE_CLIP } from '../shared/constants';
import { ROVER } from '../shared/rover';
import { MODE, NOBODY } from '../shared/types';
import type { Rover } from '../shared/types';
import { BANNER_MS, HIT_MS, HUD_CSS, boarding, clock, createHud, kmh } from './hud';
import type { Hud, Summary } from './hud';
import type { Mark } from './marks';

describe('createHud', () => {
  let screen: HTMLElement;
  let hud: Hud;
  beforeEach(() => {
    screen = document.createElement('div');
    hud = createHud(screen);
  });
  const q = <T extends HTMLElement>(sel: string) => screen.querySelector<T>(sel)!;
  const [muted, menu] = ['h5', 'aside'].map(t => () => q(t));

  describe('title screen', () => {
    it('is hidden until given a status, then shows it with the name and the controls', () => {
      expect(menu().hidden).toBe(true);
      hud.title('Click to play', 'Rooftops');
      expect(menu().hidden).toBe(false);
      const text = menu().textContent!;
      expect(text).toContain('TINY FPS');
      expect(text).toContain('Rooftops');
      expect(text).toContain('Click to play');
      for (const control of [
        'Mouse',
        'WASD / ZQSD',
        'Shift',
        'Space',
        'Move key twice',
        'C',
        'M',
      ]) {
        expect(text).toContain(control);
      }
      expect(q('aside h6').textContent).toBe('TINY FPS');
    });

    it('says what each move key does: sprint, jump again for the double jump, dash, slide', () => {
      hud.title('Click to play', 'Rooftops');
      const rows = [...screen.querySelectorAll('tr')].map(r => r.textContent);
      expect(rows).toContain('Shiftsprint');
      expect(rows).toContain('Spacejump, again in the air');
      expect(rows).toContain('Move key twicedash that way');
      expect(rows).toContain('Ccrouch, slide when fast');
    });

    it('says the goal: the flag of the other team to your own base', () => {
      hud.title('Click to play', 'Rooftops');
      expect(menu().textContent).toMatch(/enemy flag.*your own base/);
    });

    it('says the left button fires the gun, taken on the armoury', () => {
      hud.title('Click to play', 'Rooftops');
      const rows = [...screen.querySelectorAll('tr')].map(r => r.textContent);
      expect(rows).toContain('Left clickfire, hold to charge');
      expect(menu().textContent).toMatch(/armoury past your flag for the gun/);
    });

    it('hides when the status is empty, and is back for the next pause', () => {
      hud.title('Click to play', 'Rooftops');
      hud.title('', 'Rooftops');
      expect(menu().hidden).toBe(true);
      hud.title('Click to play', 'Rooftops');
      expect(menu().hidden).toBe(false);
    });

    it('shows the other statuses in the same place', () => {
      for (const status of ['Connecting…', 'Joining…', 'Room is full', 'Connection closed']) {
        hud.title(status, 'Rooftops');
        expect(q('aside strong').textContent).toBe(status);
        expect(menu().hidden).toBe(false);
      }
    });

    it('lets every click through to the canvas: all the HUD boxes are pointer-events none', () => {
      const [group, body] = HUD_CSS.split('{');
      expect(body).toContain('pointer-events:none');
      const tags = group.split(',');
      for (const el of screen.children) {
        expect(tags).toContain(el.tagName.toLowerCase());
      }
      // But the host's map buttons.
      expect(HUD_CSS).toMatch(/menu button\{[^}]*pointer-events:auto/);
    });
  });

  it('shows the red vignette of a tackle by its level, and nothing under a hundredth', () => {
    const v = () => q('u').style.opacity;
    expect(v()).toBe('');
    hud.hurt(1);
    expect(v()).toBe('1');
    hud.hurt(0.4);
    expect(v()).toBe('0.4');
    hud.hurt(3);
    expect(v()).toBe('1');
    hud.hurt(0.005);
    expect(v()).toBe('');
  });

  it('keeps the helmet’s view as it was, with a faint V outline under the face and the counts', () => {
    const rim = () => q('del');
    expect(rim().hidden).toBe(true);
    hud.visor(true);
    expect(rim().hidden).toBe(false);
    hud.visor(false);
    expect(rim().hidden).toBe(true);
    // The view is the one it was: the corners' shade.
    expect(HUD_CSS).toMatch(/del\{inset:0;background:radial-gradient/);
    // Over it only a hint of the visor: a thin pale outline in a slight V, never a filled shell.
    const [, line] = /del::before\{[^}]*clip-path:polygon\(evenodd,([^)]*)\)/.exec(HUD_CSS)!;
    const pts = line.split(',').map(p => p.split(' ').map(parseFloat));
    const [tl, brow, tr, r, chin, l] = pts;
    expect([brow[0], chin[0]]).toEqual([50, 50]);
    expect(brow[1] - tl[1]).toBeGreaterThan(1);
    expect(brow[1] - tl[1]).toBeLessThan(5);
    expect(chin[1] - l[1]).toBeGreaterThan(1);
    expect(chin[1] - l[1]).toBeLessThan(8);
    expect(tr[1]).toBe(tl[1]);
    expect(100 - r[0]).toBe(l[0]);
    // Thin: its inner outline is under half a percent inside the outer one.
    expect(pts[7][0] - tl[0]).toBeLessThan(0.5);
    expect(HUD_CSS).toMatch(/del::before\{[^}]*background:#fff[1-3]\b/);
    // The shell is drawn before the face, the health and the gun's count, so they lie over it.
    const order = [...screen.children].map(e => e.tagName);
    for (const tag of ['UL', 'FIGURE', 'DL']) {
      expect(order.indexOf('DEL')).toBeLessThan(order.indexOf(tag));
    }
  });

  it('shows the muted mark while muted', () => {
    expect(muted().hidden).toBe(true);
    hud.mute(true);
    expect(muted().hidden).toBe(false);
    hud.mute(false);
    expect(muted().hidden).toBe(true);
  });

  describe('the match', () => {
    const flag = (over: Partial<FlagState> = {}): FlagState => ({ ...IDLE.flags[0], ...over });
    const who = (id: number) => `P${id}`;
    const [nav, time] = [() => q('nav'), () => q('nav time')];
    const [redFlag, blueFlag] = [
      () => q('nav small:first-of-type'),
      () => q('nav small:last-of-type'),
    ];

    it('is hidden until the first snapshot, then shows the score of each team and the clock', () => {
      expect(nav().hidden).toBe(true);
      hud.match({ ...IDLE, score: [2, 1], clock: 462 }, who);
      expect(nav().hidden).toBe(false);
      const [red, , blue] = [...nav().querySelectorAll('span, time')];
      expect(red.textContent).toBe('RED 2');
      expect(blue.textContent).toBe('1 BLUE');
      expect(time().textContent).toBe('7:42');
    });

    it('writes the clock as m:ss, the seconds padded, and END when the match is over', () => {
      for (const [s, text] of [
        [480, '8:00'],
        [65, '1:05'],
        [9, '0:09'],
        [0, '0:00'],
      ] as const) {
        hud.match({ ...IDLE, clock: s }, who);
        expect(time().textContent).toBe(text);
      }
      hud.match({ ...IDLE, clock: 8, over: true }, who);
      expect(time().textContent).toBe('END');
      expect(clock(3599)).toBe('59:59');
    });

    it('colours the score and each flag line in its team colour', () => {
      hud.match(IDLE, who);
      const colour = (el: HTMLElement) => el.style.color;
      const [red, , blue] = [...nav().querySelectorAll<HTMLElement>('span, time')];
      expect(colour(red)).not.toBe(colour(blue));
      expect(colour(redFlag())).toBe(colour(red));
      expect(colour(blueFlag())).toBe(colour(blue));
    });

    it('says whether each flag is home, taken by a player (by name) or dropped, with its seconds', () => {
      hud.match(IDLE, who);
      expect([redFlag().textContent, blueFlag().textContent]).toEqual([
        'Red flag: home',
        'Blue flag: home',
      ]);
      hud.match(
        {
          ...IDLE,
          flags: [flag({ state: FLAG.CARRIED, by: 4 }), flag({ state: FLAG.DROPPED, left: 7 })],
        },
        who,
      );
      expect([redFlag().textContent, blueFlag().textContent]).toEqual([
        'Red flag: taken by P4',
        'Blue flag: dropped 7s',
      ]);
      hud.match(IDLE, who);
      expect(redFlag().textContent).toBe('Red flag: home');
    });
  });

  describe('markers', () => {
    const mark = (over: Partial<Mark> = {}): Mark => ({
      team: 1,
      kind: 'flag',
      x: 0.25,
      y: 0.5,
      text: '42 m',
      ...over,
    });
    const pins = () => [...screen.querySelectorAll<HTMLElement>('em')];

    it('puts a mark over its target with its distance, pointing down at it', () => {
      hud.marks([mark()]);
      const [m] = pins();
      expect(m.style.left).toBe('25%');
      expect(m.style.top).toBe('50%');
      expect(m.textContent).toBe('▼42 m');
      expect(m.style.color).not.toBe('');
    });

    it('turns an arrow toward the edge it points at, and labels a base', () => {
      hud.marks([mark({ arrow: 1.5, kind: 'base', x: 0.95, y: 0.5 })]);
      const [m] = pins();
      expect(m.textContent).toBe('▲Base 42 m');
      expect(m.querySelector('span')!.style.transform).toBe('rotate(1.5rad)');
    });

    it('colours each mark by its team, and keeps as many elements as marks', () => {
      hud.marks([mark({ team: 0 }), mark({ team: 1 })]);
      expect(pins()).toHaveLength(2);
      expect(pins()[0].style.color).not.toBe(pins()[1].style.color);
      hud.marks([mark()]);
      expect(pins()).toHaveLength(1);
      hud.marks([]);
      expect(pins()).toHaveLength(0);
    });

    it('moves the same element from frame to frame, without rebuilding', () => {
      hud.marks([mark()]);
      const [m] = pins();
      hud.marks([mark({ x: 0.6 })]);
      expect(pins()[0]).toBe(m);
      expect(m.style.left).toBe('60%');
    });
  });

  describe('the banner', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    const banner = () => q('output');

    it('shows a line in the colour of its team for a few seconds, then goes', () => {
      expect(banner().hidden).toBe(true);
      hud.banner('Blue took your flag', 1);
      expect(banner().hidden).toBe(false);
      expect(banner().textContent).toBe('Blue took your flag');
      const blue = banner().style.color;
      vi.advanceTimersByTime(BANNER_MS - 1);
      expect(banner().hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(banner().hidden).toBe(true);
      hud.banner('Red scored', 0);
      expect(banner().style.color).not.toBe(blue);
    });

    it('is replaced by a newer line, which gets its own full time', () => {
      hud.banner('Blue took your flag', 1);
      vi.advanceTimersByTime(BANNER_MS - 500);
      hud.banner('Flag returned');
      expect(banner().textContent).toBe('Flag returned');
      vi.advanceTimersByTime(BANNER_MS - 1);
      expect(banner().hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(banner().hidden).toBe(true);
    });
  });

  describe('the end screen', () => {
    const section = () => q('section');
    const rows = () => [...section().querySelectorAll('tr')].slice(1).map(r => r.textContent);
    const sum = (over: Partial<Summary> = {}): Summary => ({
      score: [3, 1],
      players: [
        { id: 1, name: 'Bob', team: 1, caps: 1, returns: 4 },
        { id: 0, name: 'Ann', team: 0, caps: 2, returns: 0 },
        { id: 2, name: 'Cy', team: 0, caps: 1, returns: 6 },
      ],
      ...over,
    });

    it('is hidden until given a result, and hides again when it is taken away', () => {
      expect(section().hidden).toBe(true);
      hud.end(sum(), 10);
      expect(section().hidden).toBe(false);
      hud.end(undefined, 0);
      expect(section().hidden).toBe(true);
    });

    it('names the winner, shows the score, and counts down to the next match', () => {
      hud.end(sum(), 7);
      expect(q('section h6').textContent).toBe('RED WINS');
      expect(q('section strong').textContent).toBe('3 – 1');
      expect(section().textContent).toContain('Next match in 7');
      hud.end(sum(), 6);
      expect(section().textContent).toContain('Next match in 6');
      hud.end(sum({ score: [0, 2] }), 6);
      expect(q('section h6').textContent).toBe('BLUE WINS');
    });

    it('says a draw when the score is level', () => {
      hud.end(sum({ score: [2, 2] }), 10);
      expect(q('section h6').textContent).toBe('DRAW');
    });

    it('lists each player with his captures and returns, the most captures first', () => {
      hud.end(sum(), 10);
      expect(rows()).toEqual(['Ann20', 'Cy16', 'Bob14']);
      expect(section().textContent).toContain('Captures');
      expect(section().textContent).toContain('Returns');
    });

    it("colours a row by its player's team", () => {
      hud.end(sum(), 10);
      const trs = [...section().querySelectorAll<HTMLElement>('tr')].slice(1);
      expect(trs[0].style.color).toBe(trs[1].style.color);
      expect(trs[0].style.color).not.toBe(trs[2].style.color);
    });

    it('builds the table once per result, not every frame', () => {
      const s = sum();
      hud.end(s, 10);
      const tr = section().querySelector('tr + tr');
      hud.end(s, 9);
      expect(section().querySelector('tr + tr')).toBe(tr);
      hud.end(sum({ players: [] }), 9);
      expect(rows()).toEqual([]);
    });
  });
});

describe('the gun on the HUD', () => {
  let screen: HTMLElement;
  let hud: Hud;
  beforeEach(() => {
    vi.useFakeTimers();
    screen = document.createElement('div');
    hud = createHud(screen);
  });
  afterEach(() => vi.useRealTimers());
  const pips = () => [...screen.querySelectorAll('li')].map(li => !li.classList.contains('e'));
  const ammo = () => screen.querySelector<HTMLElement>('dl')!;
  const count = () => screen.querySelector<HTMLElement>('data')!;

  it('shows the health as HP_MAX pips, the empty ones outlined', () => {
    expect(pips()).toHaveLength(HP_MAX);
    hud.vitals(5, -1);
    expect(pips()).toEqual([true, true, true, true, true]);
    hud.vitals(3, -1);
    expect(pips()).toEqual([true, true, true, false, false]);
    hud.vitals(0, -1);
    expect(pips()).toEqual([false, false, false, false, false]);
  });

  it('turns the pips red on the last one', () => {
    const ul = screen.querySelector('ul')!;
    hud.vitals(2, -1);
    expect(ul.classList.contains('low')).toBe(false);
    hud.vitals(1, -1);
    expect(ul.classList.contains('low')).toBe(true);
    hud.vitals(4, -1);
    expect(ul.classList.contains('low')).toBe(false);
  });

  it('shows the ammo counter, with the gun glyph, only while holding the gun', () => {
    expect(ammo().hidden).toBe(true);
    hud.vitals(5, 60);
    expect(ammo().hidden).toBe(false);
    expect(count().textContent).toBe('60');
    expect(ammo().querySelector('svg')).not.toBeNull();
    hud.vitals(5, 41);
    expect(count().textContent).toBe('41');
    hud.vitals(5, -1);
    expect(ammo().hidden).toBe(true);
  });

  it('draws the rest as magazines, an open one for a part, over its count', () => {
    const rest = () => screen.querySelector('dl span')!.textContent;
    hud.vitals(5, 12 + 2 * GUN_MAG + 3, false, false, -1, false, 12);
    expect([count().textContent, rest()]).toEqual(['12', '▮▮▯\n33']);
    hud.vitals(5, 12 + GUN_MAG, false, false, -1, false, 12);
    expect(rest()).toBe(`▮\n${GUN_MAG}`);
    hud.vitals(5, 12, false, false, -1, false, 12);
    expect(rest()).toBe('\n0');
    // The laser rifle counts in its own power cells.
    hud.vitals(5, -1, false, false, -1, false, 50, false, 50 + RIFLE_CLIP + 30, true);
    expect(rest()).toBe(`▮▯\n${RIFLE_CLIP + 30}  ○○○`);
    // With the grenades left in its launcher as dots, hollow once spent.
    hud.vitals(5, -1, false, false, -1, false, 50, false, 50 + RIFLE_CLIP + 30, true, 2);
    expect(rest()).toBe(`▮▯\n${RIFLE_CLIP + 30}  ●●○`);
    // Not the crosshair's dot, nor anything else, over the big count.
    expect(screen.querySelector('dl i')).toBeNull();
  });

  it('marks an empty gun, and reads 0', () => {
    hud.vitals(5, 0);
    expect(ammo().hidden).toBe(false);
    expect(count().textContent).toBe('0');
    expect(ammo().classList.contains('e')).toBe(true);
    hud.vitals(5, 3);
    expect(ammo().classList.contains('e')).toBe(false);
  });

  describe('the weapon in hand', () => {
    const glyphs = () => [...ammo().querySelectorAll('svg')];
    const slots = () => screen.querySelector<HTMLElement>('dl small')!;
    const shown = () =>
      [...slots().querySelectorAll<HTMLElement>('kbd')]
        .filter(k => !k.hidden)
        .map(k => k.textContent);
    const lit = () =>
      [...slots().children].filter(k => k.classList.contains('a')).map(k => k.textContent);

    it('has a gun glyph and a katana glyph, in the same place', () => {
      expect(glyphs()).toHaveLength(2);
      expect(ammo().querySelector('data')).not.toBeNull();
    });

    it('shows the katana in hand with no counter, and the gun with it', () => {
      hud.vitals(5, 30, true, true);
      expect(ammo().hidden).toBe(false);
      expect(ammo().classList.contains('k')).toBe(true);
      hud.vitals(5, 30, true, false);
      expect(ammo().classList.contains('k')).toBe(false);
      expect(count().textContent).toBe('30');
    });

    it('shows the katana alone whatever `wield` says: it is all there is', () => {
      hud.vitals(5, -1, true, false);
      expect(ammo().hidden).toBe(false);
      expect(ammo().classList.contains('k')).toBe(true);
      hud.vitals(5, -1, true, true);
      expect(ammo().classList.contains('k')).toBe(true);
    });

    it('hides the whole block with neither, and for the gun alone as before', () => {
      hud.vitals(5, -1, false, false);
      expect(ammo().hidden).toBe(true);
      hud.vitals(5, 12, false, false);
      expect(ammo().hidden).toBe(false);
      expect(ammo().classList.contains('k')).toBe(false);
    });

    it('does not mark the katana in hand as an empty gun', () => {
      hud.vitals(5, 0, true, true);
      expect(ammo().classList.contains('e')).toBe(false);
      hud.vitals(5, 0, true, false);
      expect(ammo().classList.contains('e')).toBe(true);
    });

    it('tells the slots, 1 gun and 2 katana, only while both are carried, the one in hand lit', () => {
      hud.vitals(5, 30, false, false);
      expect(slots().hidden).toBe(true);
      hud.vitals(5, -1, true, true);
      expect(slots().hidden).toBe(true);
      hud.vitals(5, 30, true, false);
      expect(slots().hidden).toBe(false);
      expect(shown()).toEqual(['1 gun', '2 katana']);
      expect(lit()).toEqual(['1 gun']);
      hud.vitals(5, 30, true, true);
      expect(lit()).toEqual(['2 katana']);
    });

    it('shows the rail gun’s lightning left in violet with the gun glyph, and its slot 3 when it is carried', () => {
      hud.vitals(5, -1, false, false, 7, true);
      expect([
        ammo().hidden,
        ammo().classList.contains('r'),
        ammo().classList.contains('k'),
      ]).toEqual([false, true, false]);
      expect(count().textContent).toBe('7');
      expect(slots().hidden).toBe(true);
      hud.vitals(5, 30, true, false, 0, true);
      expect(shown()).toEqual(['1 gun', '2 katana', '3 rail']);
      expect(lit()).toEqual(['3 rail']);
      expect(ammo().classList.contains('e')).toBe(true);
      expect(HUD_CSS).toMatch(/dl\.r svg\{fill:#c9f\}/);
    });

    it('keeps the slots out of the counter, above it and not below, where the Leave button is', () => {
      expect(HUD_CSS).toMatch(/dl small\{position:absolute;bottom:100%/);
      expect(HUD_CSS).not.toMatch(/dl small\{[^}]*top:100%/);
    });

    it('says on the title screen how to pick and how to cut', () => {
      hud.title('Click to play', 'Rooftops');
      const rows = [...screen.querySelectorAll('tr')].map(r => r.textContent);
      expect(rows).toContain('1, 2, 3, 4, wheelgun, katana, rail gun, laser rifle');
      expect(rows).toContain('Katana + Wthrust');
      expect(rows).toContain('Katana + A or Dcut across');
      expect(rows).toContain('Katana aloneslash');
      expect(rows).toContain('Double clickkatana special: lunge, energy arc, leap');
      expect(rows).toContain('Glaser rifle: a grenade from its launcher');
      expect(screen.querySelector('aside')!.textContent).toMatch(/armoury past your flag/);
    });
  });

  it('flashes a hit marker on the crosshair for a moment, and again on the next hit', () => {
    const marker = screen.querySelector<HTMLElement>('s')!;
    expect(marker.hidden).toBe(true);
    hud.hit();
    expect(marker.hidden).toBe(false);
    vi.advanceTimersByTime(HIT_MS - 10);
    expect(marker.hidden).toBe(false);
    // A second hit restarts it.
    hud.hit();
    vi.advanceTimersByTime(HIT_MS - 10);
    expect(marker.hidden).toBe(false);
    vi.advanceTimersByTime(20);
    expect(marker.hidden).toBe(true);
  });

  it('greys the screen and says DOWN with the time left while down, and is gone when up', () => {
    const veil = screen.querySelector<HTMLElement>('mark')!;
    expect(veil.hidden).toBe(true);
    hud.down(0.5, 1.46);
    expect(veil.hidden).toBe(false);
    expect(veil.style.opacity).toBe('0.5');
    expect(veil.textContent).toBe('DOWN\nBack in 1.5');
    hud.down(1, 0.04);
    expect(veil.textContent).toBe('DOWN\nBack in 0.0');
    hud.down(0, 0);
    expect(veil.hidden).toBe(true);
    expect(veil.textContent).toBe('');
  });

  it('is styled: the pips, the counter, the marker and the veil all have rules', () => {
    for (const sel of ['ul{', 'li{', 'dl{', 's{', 'mark{']) {
      expect(HUD_CSS).toContain(sel);
    }
  });
});

describe('the saber lock gauge', () => {
  it('shows the tug of war while locked, the knot at the own lead, and hides after', () => {
    const screen = document.createElement('div');
    const hud = createHud(screen);
    const rope = screen.querySelector('ins')!;
    const knot = screen.querySelector<HTMLElement>('ins i')!;
    expect(rope.hidden).toBe(true);
    hud.duel(0);
    expect([rope.hidden, knot.style.left]).toEqual([false, '50%']);
    hud.duel(0.5);
    expect(knot.style.left).toBe('75%');
    hud.duel(-3);
    expect(knot.style.left).toBe('0%');
    hud.duel(undefined);
    expect(rope.hidden).toBe(true);
    expect(HUD_CSS).not.toMatch(/CLICK/);
    // Not a b: the name tags are, and they would be drawn as gauges.
    expect(HUD_CSS).not.toMatch(/(^|[},])b[{ ]/);
  });
});

describe('the rover on the HUD', () => {
  const car = (over: Partial<Rover> = {}): Rover => ({
    x: 0,
    y: 1.1,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    wy: 0,
    wp: 0,
    wr: 0,
    steer: 0,
    driver: NOBODY,
    rider: NOBODY,
    ...over,
  });
  const foot = (x = 2, over = {}) => ({ x, y: 0, z: 0, mode: MODE.GROUND, down: 0, ...over });

  describe('boarding', () => {
    it('offers the wheel of a free rover within reach, and nothing out of reach', () => {
      expect(boarding(foot(2), [car()])).toBe('drive');
      expect(boarding(foot(ROVER.ENTER_R - 0.01), [car()])).toBe('drive');
      expect(boarding(foot(ROVER.ENTER_R + 0.01), [car()])).toBe('');
      expect(boarding(foot(2, { y: 6 }), [car()])).toBe('');
      expect(boarding(foot(2), [])).toBe('');
      expect(boarding(undefined, [car()])).toBe('');
    });

    it('offers the seat beside a driver, and nothing when both are taken', () => {
      expect(boarding(foot(), [car({ driver: 3 })])).toBe('ride');
      expect(boarding(foot(), [car({ driver: 3, rider: 4 })])).toBe('');
      // The wheel is free even with a rider aboard.
      expect(boarding(foot(), [car({ rider: 4 })])).toBe('drive');
    });

    it('offers a flag carrier the seat beside only', () => {
      expect(boarding(foot(), [car()], true)).toBe('ride');
      expect(boarding(foot(), [car({ rider: 4 })], true)).toBe('');
    });

    it('offers nothing to a player seated or down', () => {
      expect(boarding(foot(0, { mode: MODE.RIDE }), [car({ driver: 1 })])).toBe('');
      expect(boarding(foot(2, { down: 30 }), [car()])).toBe('');
    });

    it('goes by the nearest rover with a seat for him', () => {
      const full = car({ x: 1, driver: 3, rider: 4 });
      const ride = car({ x: 3, driver: 5 });
      const free = car({ x: 4.5 });
      expect(boarding(foot(2), [full, free, ride])).toBe('ride');
      expect(boarding(foot(4), [full, ride, free])).toBe('drive');
    });
  });

  it('reads the speed over the ground in whole km/h', () => {
    expect(kmh(car())).toBe(0);
    expect(kmh(car({ vx: 6, vz: -8 }))).toBe(36);
    expect(kmh(car({ vz: ROVER.VMAX }))).toBe(84);
  });

  describe('createHud().rover', () => {
    let screen: HTMLElement;
    let hud: Hud;
    beforeEach(() => {
      screen = document.createElement('div');
      screen.innerHTML = '<canvas></canvas><i></i>';
      hud = createHud(screen);
    });
    const [prompt, meter] = ['samp', 'cite'].map(t => () => screen.querySelector<HTMLElement>(t)!);

    it('shows nothing until told', () => {
      expect(prompt().hidden).toBe(true);
      expect(meter().hidden).toBe(true);
      expect(screen.classList.contains('v')).toBe(false);
    });

    it.each(['drive', 'ride', 'get out'])('prompts "E %s", and hides it again', act => {
      hud.rover(act);
      expect(prompt().hidden).toBe(false);
      expect(prompt().textContent).toBe(`E${act}`);
      expect(prompt().querySelector('var')!.textContent).toBe('E');
      expect(meter().hidden).toBe(true);
      hud.rover('');
      expect(prompt().hidden).toBe(true);
    });

    it('puts the reticle where the lasers cross on screen, and hides it off the wheel', () => {
      const q = () => screen.querySelector<HTMLElement>('q')!;
      expect(q().hidden).toBe(true);
      hud.aim([0.25, 0.4]);
      expect(q().hidden).toBe(false);
      expect([q().style.left, q().style.top]).toEqual(['25%', '40%']);
      hud.aim();
      expect(q().hidden).toBe(true);
      expect(HUD_CSS).toMatch(/q\{[^}]*border-radius:50%/);
      expect(HUD_CSS).toContain('q::before,q::after{content:none}');
    });

    it('shows the speed at the wheel, with or without the prompt, and marks the screen so the gun and the crosshair hide', () => {
      hud.rover('get out', 0);
      expect(prompt().hidden).toBe(false);
      expect(meter().hidden).toBe(false);
      expect(meter().textContent).toBe('0km/h');
      hud.rover('', 54);
      expect(prompt().hidden).toBe(true);
      expect(meter().textContent).toBe('54km/h');
      expect(screen.classList.contains('v')).toBe(true);
      // Out of the rover, or beside the driver: the gun is back.
      hud.rover('');
      expect(meter().hidden).toBe(true);
      expect(screen.classList.contains('v')).toBe(false);
    });

    it('is styled by tag: the prompt, the speed, and the gun and crosshair hidden at the wheel', () => {
      expect(HUD_CSS).toMatch(/samp\{[^}]*bottom/);
      expect(HUD_CSS).toMatch(/cite\{[^}]*right/);
      expect(HUD_CSS).toContain('div.v>i,.v dl,.v del{display:none}');
      expect(HUD_CSS.split('{')[0].split(',')).toEqual(expect.arrayContaining(['samp', 'cite']));
    });

    it('tells the key on the title screen', () => {
      hud.title('Click to play', 'Tranquility');
      const rows = [...screen.querySelectorAll('tr')].map(r => r.textContent);
      expect(rows.some(r => /^Erover: get in, get out/.test(r!))).toBe(true);
    });
  });
});
