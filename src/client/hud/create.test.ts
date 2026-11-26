// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { XENO_HP } from '../../shared/constants';
import { HUD_CSS, rim } from './css';
import { createHud } from './create';
import { VISOR } from '../helmet';
import type { Hud } from './types';

describe('createHud', () => {
  let screen: HTMLElement;
  let hud: Hud;
  beforeEach(() => {
    screen = document.createElement('div');
    hud = createHud(screen);
  });
  const q = <T extends HTMLElement>(sel: string) => screen.querySelector<T>(sel)!;
  const muted = () => q('h5');

  it('shows the Hunter the V key: blinking in the plain view, steady with a special one', () => {
    const label = q<HTMLElement>('i.hv');
    const state = () => [label.hidden, label.classList.contains('idle'), label.textContent];
    hud.hunterVision('', false, false);
    expect(state()[0]).toBe(true);
    hud.hunterVision('', false, true);
    expect(state()).toEqual([false, true, 'VVISION']);
    hud.hunterVision('THERMAL', false, true);
    expect(state()).toEqual([false, false, 'VTHERMAL']);
    // The crosshair's i rule of the host (6 px) must not squeeze the label.
    expect(HUD_CSS).toContain('i.hv{pointer-events:none;top:48px;width:auto;height:auto;');
  });

  it('closes the three sides of the Hunter laser’s triangle over its target, then turns it locked', () => {
    const sight = q<HTMLElement>('i.hl');
    hud.hunterAim([0.3, 0.4], 0.5);
    expect([
      sight.hidden,
      sight.style.left,
      sight.style.top,
      sight.classList.contains('locked'),
    ]).toEqual([false, '30%', '40%', false]);
    // Tracking: three sides, far out and each on its own beat (the user, 2026-11-23).
    const out = (now: number) => {
      hud.hunterAim([0.3, 0.4], 0, now);
      return [...sight.querySelectorAll('b')].map(b =>
        b.style.transform.match(/-?[\d.]+/g)!.map(Number),
      );
    };
    const [a, b] = [out(1000), out(1500)];
    expect(a).toHaveLength(3);
    expect(Math.min(...a.map(t => -t[1]))).toBeGreaterThan(20);
    const moved = a.map((t, i) => Math.abs(t[1] - b[i][1]));
    expect(new Set(moved.map(m => m.toFixed(2))).size).toBe(3);
    // Locked, they join into the triangle round him, a third of a turn apart, which turns at
    // 180 degrees a second.
    const at = (now: number) => {
      hud.hunterAim([0.3, 0.4], 1, now);
      return [...sight.querySelectorAll('b')].map(b =>
        b.style.transform.match(/-?[\d.]+/g)!.map(Number),
      );
    };
    expect(at(2000)).toEqual([
      [0, 0],
      [120, 0],
      [240, 0],
    ]);
    expect(at(2250).map(t => t[0])).toEqual([45, 165, 285]);
    expect(HUD_CSS).toContain('clip-path:polygon(0 0,100% 0,calc(100% - 5.2px) 100%,5.2px 100%)');
    expect(sight.classList.contains('locked')).toBe(true);
    expect(sight.querySelector('small')!.textContent).toBe('LOCK');
    hud.hunterAim();
    expect(sight.hidden).toBe(true);
  });

  it('leaves a stable HUD alone and refreshes the same vitals after a kit change', () => {
    const frame = () => {
      hud.vitals(3, 42, false, false, -1, false, 12);
      hud.ship();
      hud.aim();
      hud.hull();
      hud.mission();
    };
    frame();
    const observer = new MutationObserver(() => {});
    observer.observe(screen, { subtree: true, attributes: true, childList: true });
    frame();
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();

    hud.life(XENO_HP);
    hud.magazines([10, 10, 10]);
    frame();
    expect(screen.querySelectorAll('ul li.e:not(.a)')).toHaveLength(XENO_HP - 3);
    expect(q('dl span').textContent).toBe('▮▮▮\n30');
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
    // A glow in from every edge, not only a darkening of the corners.
    expect(HUD_CSS).toMatch(/u\{inset:0;opacity:0;box-shadow:inset /);
  });

  it('whites the view out from above by the strike’s light, over the down screen', () => {
    const g = () => q('sup');
    expect(g().style.opacity).toBe('');
    hud.glare(0.25);
    expect(g().style.opacity).toBe('0.5');
    expect(g().style.getPropertyValue('--w')).toBe('25.0%');
    hud.glare(1);
    expect(g().style.opacity).toBe('1');
    expect(g().style.getPropertyValue('--w')).toBe('100.0%');
    hud.glare(0.005);
    expect(g().style.opacity).toBe('');
    // Above the DOWN screen, which it gives way to as it clears.
    expect(HUD_CSS).toMatch(/sup\{inset:0;z-index:1;/);
    expect(g().previousElementSibling!.tagName).toBe('MARK');
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
      /del\{inset:0;background:radial-gradient\(ellipse 84% 90% at 50% 52%,#0000 64%,#000d 100%\)\}/,
    );
    const svg = decodeURIComponent(
      /del::after\{[^}]*url\("data:image\/svg\+xml,([^"]*)"\)/.exec(HUD_CSS)![1],
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
    // The view blurred round the glass, under the sheen: outside the outline and a soft band inside it.
    const blur = /del::before\{([^}]*)\}/.exec(HUD_CSS)![1];
    expect(blur).toContain('backdrop-filter:blur(7px)');
    const mask = decodeURIComponent(/mask:url\("data:image\/svg\+xml,([^"]*)"\)/.exec(blur)![1]);
    expect(mask).toContain('fill-rule="evenodd"');
    expect(mask).toContain('feGaussianBlur');
    expect(mask).toContain(`L${rim()[1][0]} ${+rim()[1][1].toFixed(2)}L`);
    // The visor's shape, as on the helmet (helmet.ts): in a box of 100 by 100, y down.
    const pts = rim();
    const top = pts.slice(0, pts.length / 2);
    const low = pts.slice(pts.length / 2).reverse();
    const at = (l: [number, number][], x: number) => l.find(p => p[0] === x)![1];
    // The upper edge comes down to the middle: a frown, its point rounded.
    expect(at(top, 50)).toBeGreaterThan(at(top, 35) + 1);
    expect(at(top, 65)).toBeCloseTo(at(top, 35), 9);
    expect(at(top, 50) - at(top, 49.5)).toBeLessThan((at(top, 40) - at(top, 39.5)) / 2);
    // The lower edge runs up toward its ends, by 0.4 of the helmet's own rise over the visor's height.
    expect(at(low, 15)).toBeLessThan(at(low, 34) - 4);
    expect(at(low, 15)).toBeGreaterThan(at(low, 34) - 8);
    expect(at(low, 20) - at(low, 15)).toBeCloseTo(at(low, 80) - at(low, 85), 9);
    expect(VISOR.rise / (2 * VISOR.r[1])).toBeCloseTo(0.5, 6);
    // Round ends: the two edges close on each other at the sides, with no corner on the way.
    expect(at(top, 1)).toBeCloseTo(at(low, 1), 9);
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
    // Wide and tall, a thin frame round it: 6 down at its top, 1 in from each side.
    expect(Math.min(...top.map(p => p[1]))).toBeGreaterThan(5.9);
    expect(Math.min(...pts.map(p => p[0]))).toBe(1);
    // The guard's notch in the middle, flat-topped: the face (72 px wide, its top 111 px up) and the
    // health sit in it on a screen of 800 by 600.
    expect(at(low, 50)).toBeCloseTo(at(low, 46), 1);
    // It stands 18.8 over where the V would meet in the middle, and over the edge at its foot.
    expect(at(low, 50)).toBeCloseTo(81.2, 1);
    expect(at(low, 50)).toBeLessThan(at(low, 28) - 2);
    // Softened: long shoulders, no step: it gains under 1.5 a unit of width anywhere.
    for (let x = 27; x < 50; x += 0.5) {
      expect(Math.abs(at(low, x + 0.5) - at(low, x)) / 0.5).toBeLessThan(1.5);
    }
    expect((100 - at(low, 50)) * 6).toBeGreaterThan(111);
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
});
