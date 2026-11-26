// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BODY } from '../../shared/types';
import { ROLE } from '../../shared/kit';
import { ARMOR_MAX, GUN_MAG, HP_MAX, RIFLE_CLIP, XENO_HP } from '../../shared/constants';
import { HUD_CSS } from './css';
import { HIT_MS } from './format';
import { createHud } from './create';
import type { Hud } from './types';

describe('the gun on the HUD', () => {
  let screen: HTMLElement;
  let hud: Hud;
  beforeEach(() => {
    vi.useFakeTimers();
    screen = document.createElement('div');
    hud = createHud(screen);
  });
  afterEach(() => vi.useRealTimers());
  const pips = () =>
    [...screen.querySelectorAll('li:not(.a)')].map(li => !li.classList.contains('e'));
  const ammo = () => screen.querySelector<HTMLElement>('dl')!;
  const count = () => screen.querySelector<HTMLElement>('data')!;

  it('shows the health as HP_MAX pips, the empty ones outlined', () => {
    expect(pips()).toHaveLength(HP_MAX);
    hud.vitals(HP_MAX, -1);
    expect(pips()).toEqual(Array(HP_MAX).fill(true));
    hud.vitals(3, -1);
    expect(pips()).toEqual(pips().map((_, i) => i < 3));
    hud.vitals(0, -1);
    expect(pips()).toEqual(Array(HP_MAX).fill(false));
  });

  it('shows as many pips as the class has health, the xenomorph’s XENO_HP, before the armour’s', () => {
    hud.life(XENO_HP);
    expect(pips()).toHaveLength(XENO_HP);
    hud.vitals(10, -1);
    expect(pips()).toEqual(pips().map((_, i) => i < 10));
    expect(screen.querySelector('ul')!.lastElementChild!.classList.contains('a')).toBe(true);
    hud.life(HP_MAX);
    expect(pips()).toHaveLength(HP_MAX);
  });

  it('shows the armour as ARMOR_MAX gold pips after the health, the empty ones hidden', () => {
    const plates = () =>
      [...screen.querySelectorAll('li.a')].map(li => !li.classList.contains('e'));
    expect(plates()).toHaveLength(ARMOR_MAX);
    hud.vitals(HP_MAX, -1);
    expect(plates()).toEqual(Array(ARMOR_MAX).fill(false));
    hud.vitals(HP_MAX, -1, false, false, -1, false, undefined, false, -1, false, 0, 2);
    expect(plates()).toEqual([true, true, false]);
    expect(pips()).toEqual(Array(HP_MAX).fill(true));
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

    it('has a gun glyph, a katana glyph and the Hunter’s, in the same place', () => {
      expect(glyphs()).toHaveLength(3);
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

    it('lists carried weapons alongside fists and highlights the choice', () => {
      hud.vitals(5, 30, false, false);
      expect(shown()).toEqual(['1 fists', '3 gun']);
      hud.vitals(5, -1, true, true);
      expect(shown()).toEqual(['1 fists', '2 katana']);
      hud.vitals(5, 30, true, false);
      expect(slots().hidden).toBe(false);
      expect(shown()).toEqual(['1 fists', '2 katana', '3 gun']);
      expect(lit()).toEqual(['3 gun']);
      hud.vitals(5, 30, true, true);
      expect(lit()).toEqual(['2 katana']);
      hud.vitals(5, 30, true, false, -1, false, 6, false, -1, false, 0, 0, true);
      expect(lit()).toEqual(['1 fists']);
      expect(ammo().classList.contains('b')).toBe(true);
    });

    it('labels the Hunter weapon slots by their loadout', () => {
      const vitals = () =>
        hud.vitals(5, 30, true, false, 7, false, 6, false, 30, false, 0, 0, false, false, 44);
      vitals();
      expect(shown()).toEqual(['1 fists', '2 katana', '3 gun', '4 rifle', '5 rail']);
      hud.wear(BODY.MALE, { role: ROLE.HUNTER });
      vitals();
      // Five slots, his pistol on 2, the disc on 5, and no fists (the user, 2026-11-26).
      expect(shown()).toEqual(['1 blades', '2 pistol', '3 harpoon', '4 cannon', '5 disc']);
      // The harpoon in hand lights slot 3, the blades slot 1, the pistol slot 2.
      expect(lit()).toEqual(['3 harpoon']);
      hud.vitals(5, 30, true, true, 7, false, 6, false, 30);
      expect(lit()).toEqual(['1 blades']);
      hud.vitals(5, 44, true, false, 7, false, 9, false, 30, false, 0, 0, false, true, 30);
      expect(shown()).toEqual(['1 blades', '2 pistol', '3 harpoon', '4 cannon', '5 disc']);
      expect(lit()).toEqual(['2 pistol']);
      // His pistol counts as the marine's gun: its shots, and the gun's glyph, not his own.
      expect(count().textContent).toBe('9');
      expect(ammo().classList.contains('h')).toBe(false);
    });

    it('shows the Hunter only the weapons he has found (the user, 2026-11-26)', () => {
      hud.wear(BODY.MALE, { role: ROLE.HUNTER });
      // As he spawns: his blades alone.
      hud.vitals(5, -1, true, true);
      expect(shown()).toEqual(['1 blades']);
      // The cannon found, then the disc.
      hud.vitals(5, -1, true, true, 0);
      expect(shown()).toEqual(['1 blades', '4 cannon']);
      hud.vitals(5, -1, true, true, 0, false, 0, false, 0);
      expect(shown()).toEqual(['1 blades', '4 cannon', '5 disc']);
      // The pistol alone, out of hand and then in hand with no harpoon behind it.
      hud.vitals(5, -1, true, true, -1, false, 0, false, -1, false, 0, 0, false, false, 44);
      expect(shown()).toEqual(['1 blades', '2 pistol']);
      hud.vitals(5, 44, true, false, -1, false, 9, false, -1, false, 0, 0, false, true, -1);
      expect(shown()).toEqual(['1 blades', '2 pistol']);
      // The harpoon alone.
      hud.vitals(5, 4, true, false);
      expect(shown()).toEqual(['1 blades', '3 harpoon']);
    });

    it('shows the Hunter’s own glyph of the weapon in hand, and none of his on a marine', () => {
      const glyph = () => [0, 1, 2, 3].filter(i => ammo().classList.contains(`h${i}`));
      hud.vitals(5, 30, true, true, 7, false, 6);
      expect([ammo().classList.contains('h'), glyph()]).toEqual([false, []]);
      hud.wear(BODY.MALE, { role: ROLE.HUNTER });
      // The blades, the harpoon, the cannon and the disc, in his slots' order (the user, 2026-11-24).
      for (const [args, i] of [
        [[5, 30, true, true, 0, false, 6], 0],
        [[5, 30, true, false, 0, false, 6], 1],
        [[5, 30, true, false, 0, true, 6], 2],
        [[5, 30, true, false, 0, false, 6, false, 0, true], 3],
      ] as const) {
        hud.vitals(...(args as unknown as Parameters<typeof hud.vitals>));
        expect([ammo().classList.contains('h'), glyph()]).toEqual([true, [i]]);
      }
      expect(ammo().querySelectorAll('svg.h path')).toHaveLength(4);
    });

    it('counts nothing for the Hunter’s shoulder cannon, which spends nothing and is never empty', () => {
      hud.wear(BODY.MALE, { role: ROLE.HUNTER });
      hud.vitals(5, 12, true, false, 0, true, 0);
      expect(lit()).toEqual(['4 cannon']);
      expect(count().textContent).toBe('∞');
      expect(ammo().classList.contains('e')).toBe(false);
    });

    it('shows the rail gun’s lightning left in violet with the gun glyph, and its slot 5 when it is carried', () => {
      hud.vitals(5, -1, false, false, 7, true);
      expect([
        ammo().hidden,
        ammo().classList.contains('r'),
        ammo().classList.contains('k'),
      ]).toEqual([false, true, false]);
      expect(count().textContent).toBe('7');
      expect(shown()).toEqual(['1 fists', '5 rail']);
      hud.vitals(5, 30, true, false, 0, true);
      expect(shown()).toEqual(['1 fists', '2 katana', '3 gun', '5 rail']);
      expect(lit()).toEqual(['5 rail']);
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
      expect(rows).toContain('1 2 3 4 5fists, katana, gun, laser rifle, rail gun');
      expect(rows).toContain(
        'Numpad 1 Numpad 2 Numpad 3 Numpad 4 Numpad 5fists, katana, gun, laser rifle, rail gun',
      );
      expect(rows).toContain('Wheelnext weapon');
      expect(rows).toContain('W + Left clickthrust');
      expect(rows).toContain('A or D + Left clickcut across');
      expect(rows).toContain('Left clickslash');
      expect(rows).toContain('Blades lockedclick fast; step aside to break');
      expect(screen.querySelector('aside')!.textContent).toMatch(
        /heavier weapons along the routes/,
      );
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
