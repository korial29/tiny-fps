// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE } from '../../../test/teams';
import { FLAG } from '../../shared/types';
import type { FlagState } from '../../shared/types';
import { HP_MAX } from '../../shared/constants';
import { BANNER_MS, COMM, COMM_TAIL, FEED_MAX, FEED_MS, FRAG_MS, clock } from './format';
import { createHud } from './create';
import type { Hud, Summary } from './types';
import type { Mark } from '../marks';

describe('createHud', () => {
  let screen: HTMLElement;
  let hud: Hud;
  beforeEach(() => {
    screen = document.createElement('div');
    hud = createHud(screen);
  });
  const q = <T extends HTMLElement>(sel: string) => screen.querySelector<T>(sel)!;

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

  describe('frags', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('counts the own frags top left once told', () => {
      expect(q('h1').hidden).toBe(true);
      hud.frags(3);
      expect(q('h1').hidden).toBe(false);
      expect(q('h1').textContent).toBe('FRAGS3');
    });

    it("shows the own frag's victim and the award under the banner, then they go", () => {
      const notice = q('h2');
      expect(notice.hidden).toBe(true);
      hud.fragged('Bob killed!', 'Double kill!');
      expect([...notice.children].map(e => e.textContent)).toEqual(['Bob killed!', 'Double kill!']);
      vi.advanceTimersByTime(FRAG_MS - 500);
      // An award alone replaces both, with its own full time.
      hud.fragged('', 'Impressive!');
      expect(notice.textContent).toBe('Impressive!');
      vi.advanceTimersByTime(FRAG_MS - 1);
      expect(notice.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(notice.hidden).toBe(true);
    });

    it('opens the radio screen for an ally while he speaks, in his team\u2019s colour, a newer line taking its place', () => {
      const box = q('label');
      expect(box.hidden).toBe(true);
      hud.comm('Ann', 1, 1.2);
      expect(box.hidden).toBe(false);
      expect(box.textContent).toBe('Ann');
      const blue = box.style.color;
      expect(blue).not.toBe('');
      const c = q<HTMLCanvasElement>('label canvas');
      expect([c.width, c.height]).toEqual([COMM, COMM]);
      vi.advanceTimersByTime(1000);
      hud.comm('Bob', 0, 1);
      expect(box.textContent).toBe('Bob');
      expect(box.style.color).not.toBe(blue);
      vi.advanceTimersByTime((1 + COMM_TAIL) * 1000 - 1);
      expect(box.hidden).toBe(false);
      vi.advanceTimersByTime(1);
      expect(box.hidden).toBe(true);
    });

    it('lists the frags top right, names in their teams colours, the oldest going first', () => {
      const lines = () => [...screen.querySelectorAll('ol li')].map(e => e.textContent);
      hud.feed(['Ann', 0], ['Bob', 1]);
      expect(lines()).toEqual(['AnnkilledBob']);
      const [by, , who] = [...q('ol li').children] as HTMLElement[];
      expect(by.style.color).not.toBe(who.style.color);
      for (let k = 0; k < FEED_MAX; k++) {
        hud.feed([`P${k}`, 0], ['Bob', 1]);
      }
      expect(lines()).toHaveLength(FEED_MAX);
      expect(lines()[0]).toBe('P0killedBob');
      vi.advanceTimersByTime(FEED_MS);
      expect(lines()).toEqual([]);
      // The health bar's pips are the list's own.
      hud.feed(['Ann', 0], ['Bob', 1]);
      hud.vitals(1, -1);
      expect(screen.querySelectorAll('ul li.e:not(.a)')).toHaveLength(HP_MAX - 1);
      expect(screen.querySelector('ol li.e')).toBeNull();
    });
  });

  describe('the end screen', () => {
    const section = () => q('section');
    const rows = () => [...section().querySelectorAll('tr')].slice(1).map(r => r.textContent);
    const sum = (over: Partial<Summary> = {}): Summary => ({
      score: [3, 1],
      players: [
        { id: 1, name: 'Bob', team: 1, caps: 1, returns: 4, frags: 5 },
        { id: 0, name: 'Ann', team: 0, caps: 2, returns: 0, frags: 2 },
        { id: 2, name: 'Cy', team: 0, caps: 1, returns: 6, frags: 7 },
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

    it('lists each player with his captures, frags and returns: the most captures first, then frags', () => {
      hud.end(sum(), 10);
      expect(rows()).toEqual(['Ann220', 'Cy176', 'Bob154']);
      expect(section().textContent).toContain('Captures');
      expect(section().textContent).toContain('Frags');
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
