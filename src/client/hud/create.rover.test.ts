// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { HIGHLINE } from '../../shared/map';
import { build } from '../../shared/world';
import { VEHICLE } from '../../shared/constants';
import { ROVER } from '../../shared/rover';
import { MODE, NOBODY } from '../../shared/types';
import type { Rover } from '../../shared/types';
import { HUD_CSS } from './css';
import { GLORY_ACT } from './text';
import { boarding, kmh } from './format';
import { createHud } from './create';
import { createTargeting } from '../targeting';
import { targetingPhysics } from '../targeting-physics';
import type { Hud } from './types';

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

    it('pulses the prompt of a glory kill alone, under the crosshair rather than over the face', () => {
      hud.rover(GLORY_ACT);
      expect(prompt().textContent).toBe(`E${GLORY_ACT}`);
      expect(prompt().classList.contains('g')).toBe(true);
      hud.rover('drive');
      expect(prompt().classList.contains('g')).toBe(false);
      hud.rover('');
      expect(HUD_CSS).toMatch(/samp\.g\{[^}]*animation:urge/);
      expect(HUD_CSS).toMatch(
        /@keyframes urge\{to\{transform:translateX\(-50%\) scale\(1\.\d+\)\}\}/,
      );
      expect(HUD_CSS).toMatch(/samp\{left:50%;top:5\d%/);
      expect(HUD_CSS).not.toMatch(/samp\{[^}]*bottom:/);
      // The key stays in the box: the orbital mission's var rule had it 66 px down, on the face.
      expect(HUD_CSS).toMatch(/samp var\{position:static;/);
    });

    it('puts the reticle where the lasers cross on screen, and hides it off the wheel', () => {
      createTargeting(screen, build(HIGHLINE), targetingPhysics);
      const css = screen.querySelector('style')!.textContent;
      const q = () => screen.querySelector<HTMLElement>('q')!;
      expect(q().hidden).toBe(true);
      hud.aim([0.25, 0.4]);
      expect(q().hidden).toBe(false);
      expect([q().style.left, q().style.top]).toEqual(['25%', '40%']);
      hud.aim();
      expect(q().hidden).toBe(true);
      expect(css).toMatch(/q\{[^}]*border-radius:50%/);
      expect(css).toContain('q::before,q::after{content:none}');
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
      expect(HUD_CSS).toMatch(/samp\{left:50%;top:5\d%/);
      expect(HUD_CSS).toMatch(/cite\{[^}]*right/);
      expect(HUD_CSS).toContain('div.v>i,.v dl,.v del,div.o>i,.o dl,.o del{display:none}');
      expect(HUD_CSS.split('{')[0].split(',')).toEqual(expect.arrayContaining(['samp', 'cite']));
    });

    it('hides the gun and the crosshair the same way while a glory kill is watched from outside', () => {
      hud.outside(true);
      expect(screen.classList.contains('o')).toBe(true);
      hud.outside(false);
      expect(screen.classList.contains('o')).toBe(false);
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
