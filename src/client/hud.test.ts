// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE } from '../../test/teams';
import { FLAG } from '../shared/types';
import type { FlagState } from '../shared/types';
import { BANNER_MS, HUD_CSS, clock, createHud } from './hud';
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

    it('lists no way to fire', () => {
      expect(menu().textContent).not.toMatch(/fire|click to shoot/i);
      hud.title('Click to play', 'Rooftops');
      expect(menu().textContent).not.toMatch(/fire/i);
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
