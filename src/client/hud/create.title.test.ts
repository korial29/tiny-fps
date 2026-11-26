// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAPS } from '../../shared/maps';
import { HIGHLINE } from '../../shared/map';
import { BODY, HAIRS_N, TONES_N } from '../../shared/types';
import { ROLE } from '../../shared/kit';
import { TONES } from '../features';
import { RULES } from '../../shared/constants';
import { HUD_CSS } from './css';
import { CAST, CONTROLS, GOAL, HAIR_NAMES, HEAD_PX, MIXES, PAUSE, ROLES, SHOT, TABS } from './text';
import { createHud } from './create';
import { LEVELS } from '../audio';
import { CODES } from '../input';
import type { Hud } from './types';

describe('createHud', () => {
  let screen: HTMLElement;
  let hud: Hud;
  beforeEach(() => {
    screen = document.createElement('div');
    hud = createHud(screen);
  });
  const q = <T extends HTMLElement>(sel: string) => screen.querySelector<T>(sel)!;
  const menu = () => q('aside');

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

    it('has a menu of three entries, Game, Controls and Audio, and shows the Game panel first', () => {
      show();
      expect(tabs().map(t => t.textContent)).toEqual(['Game', 'Controls', 'Audio']);
      expect(TABS).toEqual(['Game', 'Controls', 'Audio']);
      expect(on(tabs(), 'aria-selected')).toEqual(['true', 'false', 'false']);
      expect(panels().map(p => p.hidden)).toEqual([false, true, true]);
    });

    it('shows the other panel and hides the first on a click of its entry, and back', () => {
      show();
      tabs()[1].click();
      expect(on(tabs(), 'aria-selected')).toEqual(['false', 'true', 'false']);
      expect(panels().map(p => p.hidden)).toEqual([true, false, true]);
      tabs()[0].click();
      expect(on(tabs(), 'aria-selected')).toEqual(['true', 'false', 'false']);
      expect(panels().map(p => p.hidden)).toEqual([false, true, true]);
    });

    it('goes from an entry to the other with the arrows, the chosen one alone in the Tab order', () => {
      show();
      screen.ownerDocument.body.append(screen);
      expect(tabs().map(t => t.tabIndex)).toEqual([0, -1, -1]);
      press(tabs()[0], 'ArrowDown');
      expect(panels().map(p => p.hidden)).toEqual([true, false, true]);
      expect(tabs().map(t => t.tabIndex)).toEqual([-1, 0, -1]);
      expect(document.activeElement).toBe(tabs()[1]);
      press(tabs()[1], 'ArrowUp');
      expect(panels().map(p => p.hidden)).toEqual([false, true, true]);
      // Any other key is the page's.
      press(tabs()[0], 'KeyW');
      expect(panels().map(p => p.hidden)).toEqual([false, true, true]);
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

    it('offers creatures no body, skin or haircut, and gives them back with another class', () => {
      show();
      hud.cast(vi.fn());
      hud.wear(BODY.FEMALE, { tone: 2, hair: 3, role: ROLE.MARINE });
      const box = (l: string) => screen.querySelector<HTMLElement>(`[aria-label="${l}"]`)!;
      const shown = () => ['Body', 'Skin', 'Hair'].map(l => !box(l).hidden);
      expect(shown()).toEqual([true, true, true]);
      group('Class')[ROLE.XENO].click();
      expect(shown()).toEqual([false, false, false]);
      // The labels over the skin and the haircut go with them.
      expect((box('Skin').previousElementSibling as HTMLElement).hidden).toBe(true);
      expect((box('Hair').previousElementSibling as HTMLElement).hidden).toBe(true);
      group('Class')[ROLE.MARINE].click();
      expect(shown()).toEqual([true, true, true]);
      group('Class')[ROLE.HUNTER].click();
      expect(shown()).toEqual([false, false, false]);
      group('Class')[ROLE.MARINE].click();
      expect(shown()).toEqual([true, true, true]);
      // Her choices kept.
      expect(lit('Body')).toEqual([false, true]);
      expect(lit('Skin')).toEqual([false, false, true, false, false, false]);
    });

    it('lights what the roster says without telling it back, and hides the classes the map does not offer', () => {
      show();
      const pick = vi.fn();
      hud.cast(pick);
      hud.wear(BODY.FEMALE, { tone: 2, hair: 3, role: ROLE.MARINE }, [ROLE.MARINE, ROLE.NINJA]);
      expect(lit('Body')).toEqual([false, true]);
      expect(lit('Skin')).toEqual([false, false, true, false, false, false]);
      expect(lit('Hair')).toEqual([false, false, false, true, false]);
      expect(group('Class').map(b => b.disabled)).toEqual([false, false, true, true, true]);
      expect(group('Class').map(b => b.hidden)).toEqual([false, false, true, true, true]);
      group('Class')[ROLE.ASTRONAUT].click();
      expect(pick).not.toHaveBeenCalled();
      // On the moon: the astronaut alone.
      hud.wear(BODY.MALE, { role: ROLE.ASTRONAUT }, [ROLE.ASTRONAUT]);
      expect(group('Class').map(b => b.disabled)).toEqual([true, true, false, true, true]);
      expect(group('Class').map(b => b.hidden)).toEqual([true, true, false, true, true]);
      expect(lit('Class')).toEqual([false, false, true, false, false]);
      expect(group('Hair').map(b => b.textContent)).toEqual(HAIR_NAMES[BODY.MALE]);
    });

    it('sets a bus live from its slider, shows its dB, keeps the mix, and Reset gives back the mix as made', () => {
      show();
      const sliders = [...screen.querySelectorAll<HTMLInputElement>('.mx input')];
      expect(sliders.map(el => el.parentElement!.firstChild!.textContent)).toEqual(
        MIXES.map(([n]) => n),
      );
      const made = [...LEVELS];
      sliders[0].value = '-12';
      sliders[0].dispatchEvent(new Event('input'));
      expect(LEVELS[MIXES[0][1]]).toBe(-12);
      expect(sliders[0].nextElementSibling!.textContent).toBe('-12.0 dB');
      expect(JSON.parse(localStorage.getItem('tiny-fps:mix')!)[MIXES[0][1]]).toBe(-12);
      q<HTMLButtonElement>('.mx button').click();
      expect(LEVELS).toEqual(made);
      expect(sliders[0].value).toBe(`${made[MIXES[0][1]]}`);
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
      expect(panels().map(p => p.hidden)).toEqual([true, false, true]);
      q('.bk').click();
      expect(v()).toBe('pause');
      items()[2].click();
      expect(v()).toBe('character');
      expect(panels().map(p => p.hidden)).toEqual([false, true, true]);
      q('.bk').click();
      items()[3].click();
      expect(v()).toBe('audio');
      expect(panels().map(p => p.hidden)).toEqual([true, true, false]);
      items()[0].click();
      expect(play).toHaveBeenCalledOnce();
      items()[4].click();
      expect(quit).toHaveBeenCalledOnce();
      // Escape again, after playing on: the pause menu, not the part last opened.
      hud.title('', HIGHLINE.name!);
      show();
      expect(v()).toBe('pause');
    });

    it("hands the pause menu's Character to the whole-page screen when the game has one", () => {
      const recast = vi.fn();
      screen = document.createElement('div');
      hud = createHud(screen, undefined, undefined, recast);
      hud.title('', HIGHLINE.name!);
      hud.paused(true);
      show();
      screen.querySelectorAll<HTMLElement>('.pm button')[2].click();
      expect(recast).toHaveBeenCalledOnce();
      // The panel's own part stays shut.
      expect(menu().dataset.v).toBe('pause');
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
      expect(lines[3]).toMatch(/heavier weapons along the routes/);
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
      expect(rows).toContain(
        'G or Right clickgun: burst of 3; rail gun: shock ring; rifle: grenade',
      );
      expect(rows).toContain('G or Right clickmissiles');
      expect(rows).toContain(
        'Q or W A S D twicedash, three in a row and further than a man: it pins whoever it reaches',
      );
      expect(rows).toContain('1 2 3 4 5fists, katana, gun, laser rifle, rail gun');
      expect(rows).toContain(
        'Numpad 1 Numpad 2 Numpad 3 Numpad 4 Numpad 5fists, katana, gun, laser rifle, rail gun',
      );
      expect(rows).toContain('G or Right clickenergy arc');
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
        if (el.matches('i.hv')) {
          expect(HUD_CSS).toContain('i.hv{pointer-events:none;');
          continue;
        }
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
});
