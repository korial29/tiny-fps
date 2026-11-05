// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { HUD_CSS, createHud } from './hud';
import type { Hud } from './hud';

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
      for (const control of ['Mouse', 'WASD / ZQSD', 'Space', 'M']) {
        expect(text).toContain(control);
      }
      expect(q('aside h6').textContent).toBe('TINY FPS');
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

  it('shows the muted mark while muted', () => {
    expect(muted().hidden).toBe(true);
    hud.mute(true);
    expect(muted().hidden).toBe(false);
    hud.mute(false);
    expect(muted().hidden).toBe(true);
  });
});
