// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAPS } from '../shared/maps';
import { spawn } from '../shared/physics';
import { ROLE } from '../shared/kit';
import { MODE } from '../shared/types';
import { build } from '../shared/world';
import { STYLES } from './hair';
import { STRIDE } from './mesh';
import { createRenderer } from './render';
import { animate, soldier } from './soldier';
import type { Runner } from './soldier';
import * as store from './store';
import type { Pieces } from './store';
import { Verts } from './verts';

// A GL that answers every call with an object and every constant with a number.
const fakeGl = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (_, name: string) => (/^[A-Z_\d]+$/.test(name) ? 1 : () => ({})),
  });

describe('her close hair (hair.ts, render.ts)', () => {
  beforeEach(() => {
    vi.stubGlobal('devicePixelRatio', 1);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((kind: string) =>
      kind == 'webgl2' ? fakeGl() : {}) as never);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is in the store once the map is loaded: a woman coming close does not build it in the match', () => {
    const world = build(MAPS.highline);
    const rd = createRenderer(document.createElement('canvas'), world);
    rd.wear(new Map([[1, 1]]));
    const before = store.filled;
    for (let style = 0; style < STYLES; style++) {
      const id = style + 1;
      const p = spawn(id, world, 0, 0);
      [p.vx, p.mode] = [2, MODE.GROUND];
      const book = new Map<number, Runner>();
      const look = { role: ROLE.MARINE, hair: style, body: 1 };
      animate(book, [p], 1 / 60, world, undefined, [], new Map([[id, 1]]), new Map([[id, look]]));
      const list: Pieces = [];
      soldier(new Verts(), book.get(id)!, [0.9, 0.2, 0.1], 3, false, false, list);
      // Her hair is drawn from the store, from what was there before she came.
      const { m } = list.find(d => d.h)!;
      expect(m.count).toBeGreaterThan(0);
      expect(m.first + m.count).toBeLessThanOrEqual(before / STRIDE);
    }
  });
});
