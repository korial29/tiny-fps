// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { HEALTH } from '../shared/constants';
import { ITEM } from '../shared/types';
import { HUD_CSS, SAY, createHud } from './hud';
import type { Hud } from './hud';

describe('createHud', () => {
  let screen: HTMLElement;
  let hud: Hud;
  beforeEach(() => {
    screen = document.createElement('div');
    hud = createHud(screen);
  });
  const q = <T extends HTMLElement>(sel: string) => screen.querySelector<T>(sel)!;
  const marks = () => [...screen.querySelectorAll<HTMLElement>('ol li')];
  const [title, note, respawn, muted, menu] = ['h1', 'h2', 'h4', 'h5', 'aside'].map(
    t => () => q(t),
  );
  const [fill, num, bar] = [() => q('ul li'), () => q('ul li+li'), () => q('ul')];
  /** A custom property of the health bar. */
  const prop = (k: string) => Number(bar().style.getPropertyValue(k));
  /** Red and green channels of the bar's colour, whatever form the DOM keeps it in. */
  const [r, g] = [0, 1].map(
    i => () => Number(fill().style.background.match(/\d+/g)!.map(Number)[i]),
  );

  describe('health bar', () => {
    it('is as wide as the health is full, with the number in it', () => {
      hud.hp(HEALTH);
      expect([fill().style.width, num().textContent]).toEqual(['100%', String(HEALTH)]);
      hud.hp(3);
      expect([fill().style.width, num().textContent]).toEqual(['33.33333333333333%', '3']);
      hud.hp(0);
      expect([fill().style.width, num().textContent]).toEqual(['0%', '0']);
    });

    it('goes from green at full health to pure red at 1', () => {
      hud.hp(HEALTH);
      const full = [r(), g()];
      hud.hp(1);
      expect(full[1]).toBeGreaterThan(full[0]);
      expect(r()).toBeGreaterThan(g() * 4);
      hud.hp(0);
      expect(r()).toBeGreaterThan(g() * 4);
      hud.hp(5);
      // Between the two: still green-ish, with some red in it.
      expect(r()).toBeGreaterThan(full[0]);
      expect(r()).toBeLessThan(255);
    });

    it('flashes white when the health goes up, for a moment', () => {
      hud.hp(4);
      expect(prop('--f')).toBe(0);
      hud.hp(7);
      expect(prop('--f')).toBe(0);
      hud.update(0.01);
      expect(prop('--f')).toBeGreaterThan(0.9);
      expect(prop('--d')).toBe(0);
      hud.update(0.1);
      expect(prop('--f')).toBeGreaterThan(0);
      expect(prop('--f')).toBeLessThan(0.9);
      hud.update(1);
      expect(prop('--f')).toBe(0);
    });

    it('shakes in red when the health goes down, then settles', () => {
      hud.hp(7);
      hud.hp(6);
      hud.update(0.01);
      expect(prop('--d')).toBeGreaterThan(0.9);
      expect(prop('--f')).toBe(0);
      const sway = [0.02, 0.03, 0.03].map(dt => (hud.update(dt), prop('--s')));
      expect(new Set(sway).size).toBeGreaterThan(1);
      expect(sway.some(s => Math.abs(s) > 1)).toBe(true);
      hud.update(1);
      expect([prop('--d'), prop('--s')]).toEqual([0, 0]);
    });

    it('stays still at the same health, on the first reading and on a respawn', () => {
      hud.hp(HEALTH);
      hud.hp(HEALTH);
      hud.update(0.01);
      expect([prop('--f'), prop('--d')]).toEqual([0, 0]);
      hud.hp(0);
      hud.update(1);
      hud.hp(HEALTH);
      hud.update(0.01);
      expect([prop('--f'), prop('--d')]).toEqual([0, 0]);
    });

    it('shakes when the last health goes', () => {
      hud.hp(1);
      hud.hp(0);
      hud.update(0.01);
      expect(prop('--d')).toBeGreaterThan(0.9);
    });
  });

  it('shows a mark in the colour of each key held, and none for the rest', () => {
    expect(marks().every(m => m.hidden)).toBe(true);
    hud.keys((1 << ITEM.KEY_RED) | (1 << ITEM.KEY_YELLOW));
    expect(marks().map(m => m.hidden)).toEqual([false, true, false]);
    expect(marks().map(m => m.style.background)).toEqual([
      'rgb(242, 38, 26)',
      'rgb(51, 102, 255)',
      'rgb(255, 217, 38)',
    ]);
    hud.keys(0);
    expect(marks().every(m => m.hidden)).toBe(true);
  });

  describe('fades', () => {
    const [vignette, glint] = [0, 1].map(i => () => screen.querySelectorAll('s')[i] as HTMLElement);
    const opacity = (el: HTMLElement) => Number(el.style.opacity);

    it('draws the vignette with a radial gradient, clear in the middle, red at the edges', () => {
      expect(HUD_CSS).toMatch(/s:first-of-type\{background:radial-gradient\(#d000 \d+%,#d00 /);
    });

    it('lights the vignette on a hit and lets it out', () => {
      hud.fade(0, 0, 0, [1, 1, 1]);
      expect(opacity(vignette())).toBe(0);
      hud.fade(1, 0, 0, [1, 1, 1]);
      expect(opacity(vignette())).toBeGreaterThan(0.8);
      hud.fade(0.5, 0, 0, [1, 1, 1]);
      expect(opacity(vignette())).toBeCloseTo(0.45);
      hud.fade(0, 0, 0, [1, 1, 1]);
      expect(opacity(vignette())).toBe(0);
    });

    it('pulses the same vignette with the low-health beat, never fully clear while low', () => {
      hud.fade(0, 1, 0, [1, 1, 1]);
      const top = opacity(vignette());
      hud.fade(0, 0.01, 0, [1, 1, 1]);
      const low = opacity(vignette());
      expect(top).toBeGreaterThan(low);
      expect(low).toBeGreaterThan(0.1);
      hud.fade(0, 0, 0, [1, 1, 1]);
      expect(opacity(vignette())).toBe(0);
      // A hit over a beat shows the stronger of the two.
      hud.fade(1, 0.5, 0, [1, 1, 1]);
      expect(opacity(vignette())).toBeGreaterThan(top);
    });

    it('fades a picked-up item over the screen in its colour, not as a vignette', () => {
      hud.fade(0, 0, 1, [1, 0, 0]);
      expect(glint().style.background).toBe('rgb(255, 0, 0)');
      expect(opacity(glint())).toBeGreaterThan(0.2);
      expect(opacity(vignette())).toBe(0);
      hud.fade(0, 0, 0, [1, 0, 0]);
      expect(opacity(glint())).toBe(0);
    });
  });

  describe('title screen', () => {
    it('is hidden until given a status, then shows it with the name, level and controls', () => {
      expect(menu().hidden).toBe(true);
      hud.title('Click to play', 'Level 2: Foundry');
      expect(menu().hidden).toBe(false);
      const text = menu().textContent!;
      expect(text).toContain('TINY FPS');
      expect(text).toContain('Level 2: Foundry');
      expect(text).toContain('Click to play');
      for (const control of ['Mouse', 'WASD / ZQSD', 'Space', 'Left click', 'M']) {
        expect(text).toContain(control);
      }
      expect(q('aside h6').textContent).toBe('TINY FPS');
    });

    it('hides when the status is empty, and is back for the next pause', () => {
      hud.title('Click to play', 'Level 1');
      hud.title('', 'Level 1');
      expect(menu().hidden).toBe(true);
      hud.title('Click to play', 'Level 1');
      expect(menu().hidden).toBe(false);
    });

    it('shows the other statuses in the same place', () => {
      for (const status of ['Connecting…', 'Joining…', 'Room is full', 'Connection closed']) {
        hud.title(status, 'Level 1');
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

  describe('death screen', () => {
    it('is hidden alive, and counts down while dead', () => {
      expect(respawn().hidden).toBe(true);
      hud.dead(3);
      expect(respawn().hidden).toBe(false);
      expect(respawn().textContent).toBe('You died\nRespawn in 3');
      hud.dead(2);
      expect(respawn().textContent).toBe('You died\nRespawn in 2');
      hud.update(10);
      expect(respawn().hidden).toBe(false);
      hud.dead(0);
      expect(respawn().hidden).toBe(true);
    });
  });

  it('keeps the texts hidden until said, then hides each after its time', () => {
    expect([title(), note(), respawn()].every(e => e.hidden)).toBe(true);
    hud.say(SAY.TITLE, 'Level 1');
    hud.say(SAY.NOTE, 'Find the exit');
    expect(title().textContent).toBe('Level 1');
    expect(note().hidden).toBe(false);
    hud.update(1.9);
    expect(title().hidden).toBe(false);
    hud.update(0.2);
    expect(title().hidden).toBe(true);
    expect(note().hidden).toBe(false);
    hud.update(1);
    expect(note().hidden).toBe(true);
  });

  it('shows the muted mark while muted', () => {
    expect(muted().hidden).toBe(true);
    hud.mute(true);
    expect(muted().hidden).toBe(false);
    hud.mute(false);
    expect(muted().hidden).toBe(true);
  });
});
