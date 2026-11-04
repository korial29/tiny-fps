// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { HEALTH } from '../shared/constants';
import { ITEM } from '../shared/types';
import { SAY, createHud } from './hud';
import type { Hud } from './hud';

describe('createHud', () => {
  let screen: HTMLElement;
  let hud: Hud;
  beforeEach(() => {
    screen = document.createElement('div');
    hud = createHud(screen);
  });
  const pips = () => [...screen.querySelectorAll<HTMLElement>('ul li')];
  const marks = () => [...screen.querySelectorAll<HTMLElement>('ol li')];
  const [title, note, end, respawn] = ['h1', 'h2', 'h3', 'h4'].map(
    t => () => screen.querySelector<HTMLElement>(t)!,
  );

  it('shows one pip per health point, the first n lit', () => {
    expect(pips()).toHaveLength(HEALTH);
    hud.hp(4);
    expect(pips().map(p => p.style.opacity)).toEqual([
      ...Array(4).fill('1'),
      ...Array(HEALTH - 4).fill('0.2'),
    ]);
    hud.hp(0);
    expect(pips().every(p => p.style.opacity == '0.2')).toBe(true);
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

  it('keeps the texts hidden until said, then hides each after its time', () => {
    expect([title(), note(), end(), respawn()].every(e => e.hidden)).toBe(true);
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

  it('keeps the end screen up for 6 s, and restarts a slot that is said again', () => {
    hud.say(SAY.END, 'Run complete');
    hud.update(5.9);
    expect(end().hidden).toBe(false);
    hud.say(SAY.END, 'Run complete again');
    hud.update(5.9);
    expect(end().hidden).toBe(false);
    hud.update(0.2);
    expect(end().hidden).toBe(true);
  });

  it('shows the muted mark while muted', () => {
    const mark = screen.querySelector<HTMLElement>('h5')!;
    expect(mark.hidden).toBe(true);
    hud.mute(true);
    expect(mark.hidden).toBe(false);
    hud.mute(false);
    expect(mark.hidden).toBe(true);
  });

  it('shows the respawn text while dead', () => {
    hud.dead(true);
    expect(respawn().hidden).toBe(false);
    expect(respawn().textContent).toBe('Respawning…');
    hud.update(10);
    expect(respawn().hidden).toBe(false);
    hud.dead(false);
    expect(respawn().hidden).toBe(true);
  });
});
