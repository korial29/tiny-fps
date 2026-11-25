// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE } from '../../test/teams';
import { TEAM_COLOR } from '../shared/constants';
import { spawn, STILL } from '../shared/physics';
import { encodeSnapshot } from '../shared/protocol';
import type { SnapPlayer, SocketLike } from '../shared/types';
import { tinyFps } from './index';
import type { TinyFps } from './index';
import type * as Render from './render';
import { build } from '../shared/world';
import { HIGHLINE } from '../shared/map';

/** What the renderer drew into the game's canvas, in order: the view (F) or a menu picture (P). */
const { drawn } = vi.hoisted(() => ({ drawn: [] as string[] }));
vi.mock('./pacing', () => ({ createPacing: () => ({ draw: () => true }) }));
vi.mock('./render', async importOriginal => ({
  ...(await importOriginal<typeof Render>()),
  // No builds for the scene to wait for: run for real, they took over 10 s on a loaded runner.
  warmSteps: () => [],
  createRenderer: () => ({
    frame: () => (drawn.push('F'), true),
    destroy: () => {},
    edge: () => {},
    hunterVision: () => {},
    portrait: () => (drawn.push('P'), true),
    project: () => undefined,
    steps: () => undefined,
    vision: () => {},
    wear: () => {},
  }),
}));

describe('the character pictures of the menu', () => {
  const world = build(HIGHLINE);
  let game: TinyFps;
  let host: HTMLElement;
  let sock: SocketLike;

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'setTimeout',
        'clearTimeout',
      ],
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal('devicePixelRatio', 1);
    document.exitPointerLock = () => {};
    drawn.length = 0;
    host = document.createElement('div');
    document.body.append(host);
    sock = {
      binaryType: '',
      onopen: null,
      onmessage: null,
      onclose: null,
      send: () => {},
      close: () => {},
    };
    game = tinyFps(host, { name: 'Ann', socket: sock, map: 'highline' });
    sock.onopen!();
    sock.onmessage!({
      data: JSON.stringify({
        t: 'roster',
        you: 0,
        players: [0, 1].map(id => ({ id, name: 'Player', team: id, color: TEAM_COLOR[id] })),
      }),
    });
    const players: SnapPlayer[] = [0, 1].map(id => ({
      ...spawn(id, world, 0, id),
      ...STILL,
      id,
      ack: 0xffff,
      by: 0,
    }));
    sock.onmessage!({ data: encodeSnapshot({ ...IDLE, tick: 10, players }) });
  });

  afterEach(() => {
    game.destroy();
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('are drawn before the view of the same frame, which the screen then shows', () => {
    // The menu is open (no pointer lock): its picture is drawn again and again, animated.
    let pictures = 0;
    for (let i = 0; i < 120; i++) {
      drawn.length = 0;
      vi.advanceTimersByTime(16);
      pictures += drawn.filter(d => d == 'P').length;
      // Whatever a frame draws, the view comes last: a picture never stays on the screen.
      expect(drawn.lastIndexOf('P')).toBeLessThan(Math.max(drawn.lastIndexOf('F'), 0));
    }
    expect(pictures).toBeGreaterThan(5);
  });

  it('keep the picture moving long after the menu opened, some 30 times a second', () => {
    // PlayerState.t, which once timed it, stops at 255 ticks: some four seconds.
    vi.advanceTimersByTime(10_000);
    drawn.length = 0;
    for (let i = 0; i < 60; i++) {
      vi.advanceTimersByTime(1000 / 60);
    }
    const pictures = drawn.filter(d => d == 'P').length;
    expect(pictures).toBeGreaterThanOrEqual(25);
    expect(pictures).toBeLessThanOrEqual(31);
  });

  it('draw at most one picture a frame', () => {
    for (let i = 0; i < 120; i++) {
      drawn.length = 0;
      vi.advanceTimersByTime(16);
      expect(drawn.filter(d => d == 'P').length).toBeLessThanOrEqual(1);
    }
  });
});
