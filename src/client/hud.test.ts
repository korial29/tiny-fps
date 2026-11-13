// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE } from '../../test/teams';
import { MAPS } from '../shared/maps';
import { HIGHLINE } from '../shared/map';
import { BODY, FLAG, HAIRS_N, TONES_N } from '../shared/types';
import { ROLE } from '../shared/kit';
import { TONES } from './features';
import type { FlagState } from '../shared/types';
import { GUN_MAG, HP_MAX, RIFLE_CLIP, RULES, VEHICLE } from '../shared/constants';
import { ROVER } from '../shared/rover';
import { MODE, NOBODY } from '../shared/types';
import type { Rover } from '../shared/types';
import {
  BANNER_MS,
  CAST,
  CONTROLS,
  GOAL,
  HIT_MS,
  HAIR_NAMES,
  HEAD_PX,
  HUD_CSS,
  PAUSE,
  ROLES,
  SHOT,
  TABS,
  boarding,
  clock,
  createHud,
  kmh,
  rim,
} from './hud';
import { VISOR } from './helmet';
import { CODES } from './input';
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
    const show = (map = HIGHLINE) => hud.title('Click to play', map.name!, map.tag, map.lore);
    const tabs = () => [...screen.querySelectorAll<HTMLElement>('[role=tab]')];
    const panels = () => [...screen.querySelectorAll<HTMLElement>('aside article')];
    const on = (list: HTMLElement[], attr: string) => list.map(el => el.getAttribute(attr));
    const press = (el: HTMLElement, code: string) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));

    it('is hidden until given a status, then shows it on its button under the logo', () => {
      expect(menu().hidden).toBe(true);
      show();
      expect(menu().hidden).toBe(false);
      expect(q('aside h6').textContent).toBe('TINY FPS');
      expect(q('aside header strong').textContent).toBe('Click to play');
    });

    it('has a menu of two entries, Game then Controls, and shows the Game panel first', () => {
      show();
      expect(tabs().map(t => t.textContent)).toEqual(['Game', 'Controls']);
      expect(TABS).toEqual(['Game', 'Controls']);
      expect(on(tabs(), 'aria-selected')).toEqual(['true', 'false']);
      expect(panels().map(p => p.hidden)).toEqual([false, true]);
    });

    it('shows the other panel and hides the first on a click of its entry, and back', () => {
      show();
      tabs()[1].click();
      expect(on(tabs(), 'aria-selected')).toEqual(['false', 'true']);
      expect(panels().map(p => p.hidden)).toEqual([true, false]);
      tabs()[0].click();
      expect(on(tabs(), 'aria-selected')).toEqual(['true', 'false']);
      expect(panels().map(p => p.hidden)).toEqual([false, true]);
    });

    it('goes from an entry to the other with the arrows, the chosen one alone in the Tab order', () => {
      show();
      screen.ownerDocument.body.append(screen);
      expect(tabs().map(t => t.tabIndex)).toEqual([0, -1]);
      press(tabs()[0], 'ArrowDown');
      expect(panels().map(p => p.hidden)).toEqual([true, false]);
      expect(tabs().map(t => t.tabIndex)).toEqual([-1, 0]);
      expect(document.activeElement).toBe(tabs()[1]);
      press(tabs()[1], 'ArrowUp');
      expect(panels().map(p => p.hidden)).toEqual([false, true]);
      // Any other key is the page's.
      press(tabs()[0], 'KeyW');
      expect(panels().map(p => p.hidden)).toEqual([false, true]);
      screen.remove();
    });

    const group = (label: string) => [
      ...screen.querySelectorAll<HTMLButtonElement>(`[aria-label="${label}"] [role=radio]`),
    ];
    const lit = (label: string) => group(label).map(b => b.getAttribute('aria-checked') == 'true');

    it('has one live picture and the body, skin, hair and class pickers in the Game panel', () => {
      show();
      const pic = hud.cast(() => {});
      expect([pic.width, pic.height]).toEqual(SHOT);
      expect(panels()[0].contains(pic)).toBe(true);
      expect(group('Body').map(b => b.textContent)).toEqual(CAST);
      expect(group('Skin')).toHaveLength(TONES_N);
      expect(TONES).toHaveLength(TONES_N);
      expect(group('Hair').map(b => b.textContent)).toEqual(HAIR_NAMES[BODY.MALE]);
      expect(group('Class').map(b => b.querySelector('strong')!.textContent)).toEqual(
        ROLES.map(r => r[0]),
      );
      // Each class says what it is good at and what it pays for it.
      for (const [b, [, pros, cons]] of group('Class').map((b, i) => [b, ROLES[i]] as const)) {
        expect([pros, cons].every(t => t.length > 20)).toBe(true);
        expect(b.querySelector('.p')!.textContent).toBe(pros);
        expect(b.querySelector('.c')!.textContent).toBe(cons);
      }
      expect(HAIR_NAMES.map(h => h.length)).toEqual(HAIRS_N);
      // A picture of the own head with each haircut.
      expect(hud.heads()).toHaveLength(HAIR_NAMES[BODY.MALE].length);
      expect(hud.heads().map(c => [c.width, c.height])[0]).toEqual([HEAD_PX, HEAD_PX]);
      expect(lit('Body')).toEqual([true, false]);
    });

    it('tells the whole choice on each change, and gives the woman her own haircuts', () => {
      show();
      const pick = vi.fn();
      hud.cast(pick);
      group('Skin')[4].click();
      expect(pick).toHaveBeenLastCalledWith({ body: BODY.MALE, tone: 4 });
      group('Hair')[0].click();
      group('Class')[ROLE.NINJA].click();
      expect(pick).toHaveBeenLastCalledWith({ body: 0, tone: 4, hair: 0, role: ROLE.NINJA });
      // The chosen one again changes nothing.
      group('Class')[ROLE.NINJA].click();
      expect(pick).toHaveBeenCalledTimes(3);
      // Another body: her haircuts, none picked until she picks one.
      group('Body')[BODY.FEMALE].click();
      expect(pick).toHaveBeenLastCalledWith({ body: 1, tone: 4, role: ROLE.NINJA });
      expect(group('Hair').map(b => b.textContent)).toEqual(HAIR_NAMES[BODY.FEMALE]);
      expect(lit('Hair')).not.toContain(true);
      // The ninja's hood hides the hair: no haircut to pick.
      const hair = screen.querySelector<HTMLElement>('[aria-label="Hair"]')!;
      expect(hair.hidden).toBe(true);
      group('Class')[ROLE.MARINE].click();
      expect(hair.hidden).toBe(false);
      group('Hair')[2].click();
      expect(lit('Hair')).toEqual([false, false, true, false, false]);
    });

    it('lights what the roster says without telling it back, and greys out the classes the map does not offer', () => {
      show();
      const pick = vi.fn();
      hud.cast(pick);
      hud.wear(BODY.FEMALE, { tone: 2, hair: 3, role: ROLE.MARINE }, [ROLE.MARINE, ROLE.NINJA]);
      expect(lit('Body')).toEqual([false, true]);
      expect(lit('Skin')).toEqual([false, false, true, false, false, false]);
      expect(lit('Hair')).toEqual([false, false, false, true, false]);
      expect(group('Class').map(b => b.disabled)).toEqual([false, false, true]);
      group('Class')[ROLE.ASTRONAUT].click();
      expect(pick).not.toHaveBeenCalled();
      // On the moon: the astronaut alone.
      hud.wear(BODY.MALE, { role: ROLE.ASTRONAUT }, [ROLE.ASTRONAUT]);
      expect(group('Class').map(b => b.disabled)).toEqual([true, true, false]);
      expect(lit('Class')).toEqual([false, false, true]);
      expect(group('Hair').map(b => b.textContent)).toEqual(HAIR_NAMES[BODY.MALE]);
    });

    it('opens on a small pause menu once the player has been in the game', () => {
      const [play, quit] = [vi.fn(), vi.fn()];
      screen = document.createElement('div');
      hud = createHud(screen, play, quit);
      const v = () => menu().dataset.v ?? '';
      const items = () => [...screen.querySelectorAll<HTMLElement>('.pm button')];
      // The first time: the whole title screen.
      show();
      expect(v()).toBe('');
      hud.title('', HIGHLINE.name!);
      hud.paused(true);
      show();
      expect(v()).toBe('pause');
      expect(items().map(b => b.textContent)).toEqual(PAUSE);
      items()[1].click();
      expect(v()).toBe('controls');
      expect(panels().map(p => p.hidden)).toEqual([true, false]);
      q('.bk').click();
      expect(v()).toBe('pause');
      items()[2].click();
      expect(v()).toBe('character');
      expect(panels().map(p => p.hidden)).toEqual([false, true]);
      items()[0].click();
      expect(play).toHaveBeenCalledOnce();
      items()[3].click();
      expect(quit).toHaveBeenCalledOnce();
      // Escape again, after playing on: the pause menu, not the part last opened.
      hud.title('', HIGHLINE.name!);
      show();
      expect(v()).toBe('pause');
    });

    it('sums the mode up in a few lines: the goal, the flag at home, the score and the time of a match', () => {
      show();
      const mode = q('aside blockquote');
      expect(panels()[0].contains(mode)).toBe(true);
      expect(mode.textContent).toContain('Capture the flag');
      const lines = [...mode.querySelectorAll('span')].map(l => l.textContent!);
      expect(lines).toEqual(GOAL);
      expect(lines.length).toBeLessThanOrEqual(4);
      expect(lines[0]).toMatch(/enemy flag.*run it home/);
      expect(lines[1]).toMatch(/own flag is at home/);
      expect(lines[2]).toContain(`${RULES.scoreLimit} captures`);
      expect(lines[2]).toContain(`${RULES.timeLimit / 60} minutes`);
      expect(lines[3]).toMatch(/armoury past your flag/);
    });

    it.each(Object.entries(MAPS))('tells the title, the kind and the lore of %s', (_, map) => {
      expect(map.name && map.tag && map.lore).toBeTruthy();
      show(map);
      const box = q('aside address');
      expect(panels()[0].contains(box)).toBe(true);
      expect(q('aside h3').textContent).toBe(map.name);
      expect(q('aside address small').textContent).toBe(map.tag);
      expect(q('aside address>span').textContent).toBe(map.lore);
    });

    it('tells every key the game reads in the Controls panel, in groups', () => {
      show();
      const told = CONTROLS.flatMap(([, rows]) => rows.flatMap(r => r[2]?.split(' ') ?? []));
      expect([...CODES].filter(c => !told.includes(c))).toEqual([]);
      // No code twice, and none the game does not read.
      expect(told.filter(c => !CODES.includes(c))).toEqual([]);
      expect(new Set(told).size).toBe(told.length);
      const tables = [...panels()[1].querySelectorAll('table')];
      expect(tables.map(t => t.caption!.textContent)).toEqual(CONTROLS.map(g => g[0]));
      expect(tables.map(t => t.caption!.textContent)).toEqual(
        expect.arrayContaining(['Movement', 'Combat', 'Katana', 'Rover']),
      );
      tables.forEach((t, g) => {
        const rows = [...t.rows].map(r => [...r.cells].map(c => c.textContent));
        expect(rows).toEqual(
          CONTROLS[g][1].map(([keys, does]) => [keys.split('|').join(' '), does]),
        );
      });
      const caps = [...panels()[1].querySelectorAll('kbd')].map(k => k.textContent);
      for (const cap of ['W', 'A', 'S', 'D', 'Shift', 'Space', 'C', 'R', 'G', 'E', 'M', 'Esc']) {
        expect(caps).toContain(cap);
      }
      expect(caps).not.toContain('+');
    });

    it('tells the rover, its lasers and the grenade launcher', () => {
      show();
      const rows = [...panels()[1].querySelectorAll('tr')].map(r => r.textContent);
      expect(rows).toContain('Eget in, get out');
      expect(rows).toContain('Left clicklasers');
      expect(rows).toContain('Glaser rifle: a grenade from its launcher');
      expect(rows).toContain('1 2 3 4gun, katana, rail gun, laser rifle');
      expect(rows).toContain('Double clickspecial: lunge, energy arc, leap');
    });

    it('plays on a click of its button, from either panel, and on no other click of the panel', () => {
      const play = vi.fn();
      screen = document.createElement('div');
      hud = createHud(screen, play);
      show();
      const others = [
        ...tabs(),
        ...screen.querySelectorAll<HTMLElement>('[role=radio]'),
        q('aside h3'),
        q('aside main'),
      ];
      others.forEach(el => el.click());
      expect(play).not.toHaveBeenCalled();
      q('aside header>:last-child').click();
      expect(play).toHaveBeenCalledOnce();
      tabs()[1].click();
      q('aside header>:last-child').click();
      expect(play).toHaveBeenCalledTimes(2);
      // The panel takes its own clicks; the dimmed view round it lets them through to the canvas.
      expect(HUD_CSS).toMatch(/aside main\{pointer-events:auto/);
      expect(HUD_CSS.split('}')[0]).toMatch(/aside,[^{]*\{[^}]*pointer-events:none/);
    });

    it('hides when the status is empty, lets go of the focus, and is back for the next pause', () => {
      screen.ownerDocument.body.append(screen);
      show();
      tabs()[1].focus();
      expect(document.activeElement).toBe(tabs()[1]);
      hud.title('', 'Highline');
      expect(menu().hidden).toBe(true);
      // A tab that kept the focus would take the Space of a jump.
      expect(document.activeElement).not.toBe(tabs()[1]);
      show();
      expect(menu().hidden).toBe(false);
      screen.remove();
    });

    it('shows the other statuses in the same place', () => {
      for (const status of ['Connecting…', 'Joining…', 'Room is full', 'Connection closed']) {
        hud.title(status, 'Rooftops');
        expect(q('aside header strong').textContent).toBe(status);
        expect(menu().hidden).toBe(false);
      }
    });

    it('lets every click round the panel through to the canvas: all the HUD boxes are pointer-events none', () => {
      const [group, body] = HUD_CSS.split('{');
      expect(body).toContain('pointer-events:none');
      const tags = group.split(',');
      for (const el of screen.children) {
        expect(tags).toContain(el.tagName.toLowerCase());
      }
      // But the host's map buttons.
    });

    it('styles the title screen under its own tag, the key caps too: the weapon slots keep theirs', () => {
      expect(HUD_CSS).toContain('aside kbd{');
      expect(HUD_CSS).not.toMatch(/[}`]kbd\{/);
      expect(HUD_CSS).toContain('aside article[hidden]{display:none}');
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

  it('draws the outline of the helmet’s own visor round a clear view, the face in its notch', () => {
    const el = () => q('del');
    expect(el().hidden).toBe(true);
    hud.visor(true);
    expect(el().hidden).toBe(false);
    hud.visor(false);
    expect(el().hidden).toBe(true);
    // The corners' shade as it always was, and nothing else filled: a line, 2 px at any size.
    expect(HUD_CSS).toMatch(
      /del\{inset:0;background:radial-gradient\(ellipse 74% 80% at 50% 54%,#0000 60%,#000d 100%\)\}/,
    );
    const svg = decodeURIComponent(
      /del::before\{[^}]*url\("data:image\/svg\+xml,([^"]*)"\)/.exec(HUD_CSS)![1],
    );
    expect(svg).toContain('fill="none"');
    expect(svg).not.toMatch(/ fill="#/);
    // The rim's sheen, inside the outline only: a pale line, a glow behind it, shades under the brow and along the jaw.
    expect(svg).toContain('clip-path="url(#c)"');
    // No white border: one wide, faint glow only.
    expect(svg.match(/stroke="#fff"/g)).toHaveLength(1);
    expect(svg).toMatch(/stroke="#fff" stroke-opacity="0\.05" stroke-width="34"/);
    expect(svg.match(/stroke="#000"/g)).toHaveLength(3);
    expect(svg).toContain('vector-effect="non-scaling-stroke"');
    expect(svg).toContain('preserveAspectRatio="none"');
    expect(HUD_CSS).not.toMatch(/del::after/);
    // The visor's shape, as on the helmet (helmet.ts): in a box of 100 by 100, y down.
    const pts = rim();
    const top = pts.slice(0, pts.length / 2);
    const low = pts.slice(pts.length / 2).reverse();
    const at = (l: [number, number][], x: number) => l.find(p => p[0] === x)![1];
    // The upper edge comes down to the middle: a frown, its point rounded.
    expect(at(top, 50)).toBeGreaterThan(at(top, 35) + 1);
    expect(at(top, 65)).toBeCloseTo(at(top, 35), 9);
    expect(at(top, 50) - at(top, 49.5)).toBeLessThan((at(top, 40) - at(top, 39.5)) / 2);
    // The lower edge runs up toward its ends, by the helmet's own rise over the visor's height.
    expect(at(low, 15)).toBeLessThan(at(low, 34) - 12);
    expect(at(low, 20) - at(low, 15)).toBeCloseTo(at(low, 80) - at(low, 85), 9);
    expect(VISOR.rise / (2 * VISOR.r[1])).toBeCloseTo(0.5, 6);
    // Round ends: the two edges close on each other at the sides, with no corner on the way.
    expect(at(top, 4)).toBeCloseTo(at(low, 4), 9);
    expect(at(low, 5) - at(top, 5)).toBeLessThan(at(low, 10) - at(top, 10));
    const turns = pts.map((p, k) => {
      const [a, b] = [pts[(k + pts.length - 1) % pts.length], pts[(k + 1) % pts.length]];
      const [u, v] = [
        [p[0] - a[0], p[1] - a[1]],
        [b[0] - p[0], b[1] - p[1]],
      ];
      return Math.abs(Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]));
    });
    // No turn of more than half a right angle between two steps, the ends' tips aside.
    expect(turns.filter(a => a > Math.PI / 4).length).toBeLessThanOrEqual(4);
    // Low on the screen: 12 down at its top.
    expect(Math.min(...top.map(p => p[1]))).toBeGreaterThan(11.9);
    // The guard's notch in the middle, flat-topped: the face (72 px wide, its top 111 px up) and the
    // health sit in it on a screen of 800 by 600.
    expect(at(low, 50)).toBeCloseTo(at(low, 46), 1);
    // It stands 21 over where the V would meet in the middle, and over the edge at its foot.
    expect(at(low, 50)).toBeCloseTo(79, 1);
    expect(at(low, 50)).toBeLessThan(at(low, 28) - 2);
    // Softened: long shoulders, no step: it gains under 1.5 a unit of width anywhere.
    for (let x = 27; x < 50; x += 0.5) {
      expect(Math.abs(at(low, x + 0.5) - at(low, x)) / 0.5).toBeLessThan(1.5);
    }
    expect((100 - at(low, 50)) * 6).toBeGreaterThan(111 + 10);
    // The face's top corners, 36 px off the middle: the swell is still over them there.
    expect((100 - at(low, 54.5)) * 6).toBeGreaterThan(111);
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
      expect(rows).toContain('1 2 3 4gun, katana, rail gun, laser rifle');
      expect(rows).toContain('Wheelnext weapon');
      expect(rows).toContain('W + Left clickthrust');
      expect(rows).toContain('A or D + Left clickcut across');
      expect(rows).toContain('Left clickslash');
      expect(rows).toContain('Blades lockedclick fast; step aside to break');
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

    it('offers nothing at a wreck, and the seat again once it is parked afresh', () => {
      expect(boarding(foot(2), [car({ hp: 0, wreck: 200 })])).toBe('');
      expect(boarding(foot(2), [car({ hp: 0, wreck: 1 })])).toBe('');
      expect(boarding(foot(2), [car({ hp: 10, wreck: 0 })])).toBe('drive');
      // A whole one further off is offered past it.
      expect(boarding(foot(2), [car({ hp: 0, wreck: 200 }), car({ x: 4 })])).toBe('drive');
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

    it('shows the health of the vehicle he sits in as ten pips over the speed, and hides it on foot', () => {
      const [own, near] = [...screen.querySelectorAll<HTMLElement>('tt')];
      expect([own.hidden, near.hidden]).toEqual([true, true]);
      hud.hull(VEHICLE.HP);
      expect(own.hidden).toBe(false);
      expect(near.hidden).toBe(true);
      expect(own.style.getPropertyValue('--a')).toBe('100%');
      expect(own.style.getPropertyValue('--c')).toBe('#5fd28a');
      // Amber from 6 down, red from 3; the lit share is the health's.
      hud.hull(6);
      expect([own.style.getPropertyValue('--a'), own.style.getPropertyValue('--c')]).toEqual([
        '60%',
        '#f0b429',
      ]);
      hud.hull(3);
      expect([own.style.getPropertyValue('--a'), own.style.getPropertyValue('--c')]).toEqual([
        '30%',
        '#e5484d',
      ]);
      hud.hull(0);
      expect(own.hidden).toBe(false);
      expect(own.style.getPropertyValue('--a')).toBe('0%');
      hud.hull();
      expect(own.hidden).toBe(true);
    });

    it('puts a small bar over a vehicle near by, where it is on screen', () => {
      const [own, near] = [...screen.querySelectorAll<HTMLElement>('tt')];
      hud.hull(undefined, { hp: 4, at: [0.25, 0.4] });
      expect([own.hidden, near.hidden]).toEqual([true, false]);
      expect([near.style.left, near.style.top]).toEqual(['25%', '40%']);
      expect(near.style.getPropertyValue('--a')).toBe('40%');
      hud.hull(8, { hp: 10, at: [0.5, 0.5] });
      expect([own.hidden, near.hidden]).toEqual([false, false]);
      hud.hull(8);
      expect(near.hidden).toBe(true);
    });

    it('styles the health bar by its own tag: ten pips over the speed, the near one half the size', () => {
      expect(HUD_CSS.split('{')[0].split(',')).toContain('tt');
      // 10 pips of 13 px and 2 px between them: 148 px.
      expect(HUD_CSS).toMatch(/tt\{[^}]*right:12px[^}]*width:148px/);
      expect(HUD_CSS).toMatch(
        /tt\{[^}]*repeating-linear-gradient\(90deg,#000 0 13px,#0000 13px 15px\)/,
      );
      expect(HUD_CSS).toMatch(/tt\+tt\{[^}]*scale\(\.5\)/);
      // Over the speed read-out, which is at the bottom right.
      expect(HUD_CSS).toMatch(/cite\{right:12px;bottom:10px/);
    });

    it('tells the ship’s missiles and height in its panel, its health being the bar’s', () => {
      const panel = screen.querySelector<HTMLElement>('dfn')!;
      hud.ship({ nades: 3, alt: 41.6, up: 0, out: 0 });
      expect(panel.hidden).toBe(false);
      expect(panel.textContent).toMatch(/^MISSILES 3\/\d+ {2}· {2}ALT 42 m$/);
      expect(panel.textContent).not.toMatch(/ARMOUR/);
      hud.ship();
      expect(panel.hidden).toBe(true);
    });

    it('tells the key on the title screen', () => {
      hud.title('Click to play', 'Tranquility');
      const rows = [...screen.querySelectorAll('tr')].map(r => r.textContent);
      expect(rows).toContain('Eget in, get out');
      expect(rows).toContain('W Sdrive toward the look');
      expect(rows).toContain('Spacehandbrake');
    });
  });
});
