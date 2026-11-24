// @vitest-environment jsdom
// The weapon keys, end to end: a key pressed, the keys of the step it gives, the weapon the host
// puts in hand for the class, and the slot the HUD lights.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loaded } from '../../test/loaded';
import { at, yard } from '../../test/yard';
import { step } from '../shared/gun';
import { KITS, ROLE } from '../shared/kit';
import type { PlayerState } from '../shared/types';
import { createHud } from './hud';
import type { Hud } from './hud';
import { createInput, slotOf, slotted, SLOTS, WEAPON } from './input';
import type { Controls } from './input';

const { FISTS, BLADE, GUN, RIFLE, RAIL } = WEAPON;

/** The weapon in hand as the host's state tells it, in WEAPON's values. */
const inHand = (p: PlayerState): number =>
  p.fists ? FISTS : p.rifled ? RIFLE : p.railed ? RAIL : p.wield ? BLADE : GUN;

/** What 1 to 5 put in hand (the user, 2026-11-24): fists, katana, pistol, assault rifle, Tesla gun. */
const ORDER = [
  [FISTS, '1 fists'],
  [BLADE, '2 katana'],
  [GUN, '3 gun'],
  [RIFLE, '4 rifle'],
  [RAIL, '5 rail'],
] as const;

describe('the weapon keys', () => {
  let canvas: HTMLCanvasElement;
  let screen: HTMLElement;
  let ctl: Controls;
  let hud: Hud;
  const key = (code: string) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { code, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { code, cancelable: true }));
  };
  const lit = () =>
    [...screen.querySelector('dl small')!.children]
      .filter(k => k.classList.contains('a'))
      .map(k => k.textContent);
  beforeEach(() => {
    canvas = document.createElement('canvas');
    screen = document.createElement('div');
    document.body.append(canvas);
    ctl = createInput(canvas);
    hud = createHud(screen);
    Object.defineProperty(document, 'pointerLockElement', { value: canvas, configurable: true });
    document.dispatchEvent(new Event('pointerlockchange'));
  });
  afterEach(() => {
    ctl.destroy();
    canvas.remove();
    Object.defineProperty(document, 'pointerLockElement', { value: null, configurable: true });
  });

  it('has fists, katana, pistol, assault rifle and Tesla gun on 1 to 5, each weapon in one slot', () => {
    expect(SLOTS).toEqual([FISTS, BLADE, GUN, RIFLE, RAIL]);
    for (const hunter of [false, true]) {
      const all = [0, 1, 2, 3, 4].map(slot => slotted(slot, hunter));
      expect([...all].sort()).toEqual([0, 1, 2, 3, 4]);
      expect(all.map(w => slotOf(w, hunter))).toEqual([0, 1, 2, 3, 4]);
    }
  });

  for (const [name, role] of [
    ['marine', ROLE.MARINE],
    ['ninja', ROLE.NINJA],
    ['astronaut', ROLE.ASTRONAUT],
  ] as const) {
    for (const pad of ['Digit', 'Numpad']) {
      it(`puts the ${name}'s weapon of each ${pad} key in his hand and lights its slot`, () => {
        // Every weapon carried, so that no key falls back on another weapon.
        const { p } = at(0, 0);
        Object.assign(p, loaded({ ammo: 12, blade: true, rail: 30, rifle: 30 }));
        // Each key from every other weapon in hand, the last one included.
        for (const n of [1, 2, 3, 4, 5, 4, 2, 5, 3, 1, 3, 5, 2, 4, 1]) {
          const [weapon, label] = ORDER[n - 1];
          key(`${pad}${n}`);
          expect(ctl.weapon, `${pad}${n}`).toBe(weapon);
          step(p, { seq: 0, keys: ctl.take(), yaw: 0, pitch: 0 }, yard, 0, true, [], KITS[role]);
          expect(inHand(p), `${pad}${n} in hand`).toBe(weapon);
          hud.vitals(
            p.hp,
            p.ammo,
            !!p.blade,
            !!p.wield,
            p.rail,
            !!p.railed,
            0,
            false,
            p.rifle,
            !!p.rifled,
            0,
            0,
            !!p.fists,
          );
          expect(lit(), `${pad}${n} on the HUD`).toEqual([label]);
        }
      });
    }
  }

  it('keeps the weapon in hand on a key whose weapon he does not carry, and hides its slot', () => {
    const { p } = at(0, 0);
    Object.assign(p, loaded({ ammo: 12 }));
    key('Digit5');
    step(p, { seq: 0, keys: ctl.take(), yaw: 0, pitch: 0 }, yard, 0, true, [], KITS[ROLE.MARINE]);
    expect(inHand(p)).toBe(GUN);
    hud.vitals(p.hp, p.ammo, false, false, -1, false, 0, false, -1, false, 0, 0, false);
    expect(lit()).toEqual(['3 gun']);
    const shown = [...screen.querySelectorAll<HTMLElement>('dl small kbd')].filter(k => !k.hidden);
    expect(shown.map(k => k.textContent)).toEqual(['1 fists', '3 gun']);
  });
});
