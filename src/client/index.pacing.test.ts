// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE } from '../../test/teams';
import { INTERP_DELAY, TEAM_COLOR } from '../shared/constants';
import { MOON } from '../shared/moon';
import { spawn, STILL } from '../shared/physics';
import { decodeInput, encodeSnapshot } from '../shared/protocol';
import { park } from '../shared/rover';
import { KEY, MODE } from '../shared/types';
import type { SnapPlayer, SocketLike } from '../shared/types';
import { build } from '../shared/world';
import { tinyFps } from './index';
import type { TinyFps } from './index';
import type * as Render from './render';

const { paint, draw } = vi.hoisted(() => ({
  paint: vi.fn<Render.Renderer['frame']>(() => true),
  draw: vi.fn(() => true),
}));
vi.mock('./pacing', () => ({ createPacing: () => ({ draw }) }));
vi.mock('./render', async importOriginal => ({
  ...(await importOriginal<typeof Render>()),
  createRenderer: () => ({
    frame: paint,
    destroy: () => {},
    edge: () => {},
    hunterVision: () => {},
    portrait: () => false,
    project: () => undefined,
    steps: () => undefined,
    vision: () => {},
    wear: () => {},
  }),
}));

describe('inputs between rendered frames', () => {
  const world = build(MOON);
  let game: TinyFps;
  let host: HTMLElement;
  let sock: SocketLike;
  let sent: ArrayBuffer[];
  const input = () => decodeInput(sent.at(-1)!)!;
  const advance = (ms: number) => vi.advanceTimersByTime(ms);
  const snap = (tick: number, piloting = false) => {
    const rovers = park(world);
    const ship = rovers.find(r => r.ship)!;
    if (piloting) {
      ship.driver = 0;
    }
    const players: SnapPlayer[] = [0, 1].map(id => ({
      ...spawn(id, world, 0, id),
      ...STILL,
      id,
      ack: sent.length ? input().seq : 0xffff,
      by: 0,
      ...(piloting && id === 0 ? { x: ship.x, y: ship.y, z: ship.z, mode: MODE.RIDE } : {}),
    }));
    sock.onmessage!({ data: encodeSnapshot({ ...IDLE, tick, players, rovers }) });
  };

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
    document.exitPointerLock = () => {};
    vi.stubGlobal('devicePixelRatio', 1);
    paint.mockClear();
    draw.mockReturnValue(true);
    host = document.createElement('div');
    document.body.append(host);
    sent = [];
    sock = {
      binaryType: '',
      onopen: null,
      onmessage: null,
      onclose: null,
      send: data => {
        if (typeof data !== 'string') {
          sent.push(data);
        }
      },
      close: () => {},
    };
    game = tinyFps(host, { name: 'Ann', socket: sock, map: 'tranquility' });
    sock.onopen!();
    sock.onmessage!({
      data: JSON.stringify({
        t: 'roster',
        you: 0,
        players: [0, 1].map(id => ({ id, name: 'Player', team: id, color: TEAM_COLOR[id] })),
      }),
    });
    snap(10);
    advance(160);
    const root = host.firstElementChild!.shadowRoot!;
    Object.defineProperty(root, 'pointerLockElement', { value: root.querySelector('canvas') });
    expect(paint).toHaveBeenCalled();
  });

  afterEach(() => {
    game.destroy();
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends the displayed rewind tick while simulation inputs continue', () => {
    const start = performance.now();
    snap(20);
    advance(100);
    snap(26);
    advance(INTERP_DELAY - 32);
    const displayedAt = paint.mock.lastCall![13]!.now;
    const expected = 20 + ((displayedAt - INTERP_DELAY - start) / 100) * 6;
    expect(expected).toBeGreaterThan(20);
    expect(expected).toBeLessThan(26);
    draw.mockReturnValue(false);
    const previous = sent.length;
    const frames = paint.mock.calls.length;
    advance(64);
    expect(sent.length).toBeGreaterThan(previous + 1);
    expect(paint.mock.calls).toHaveLength(frames);
    for (const data of sent.slice(previous)) {
      expect(decodeInput(data)!.view).toBeCloseTo(expected, 2);
    }
    draw.mockReturnValue(true);
    advance(64);
    expect(input().view).toBe(26);
  });

  it('suppresses double-click missiles after boarding, even with no repaint', () => {
    draw.mockReturnValue(false);
    snap(12, true);
    const frames = paint.mock.calls.length;
    const click = (type: string, button: number) =>
      document.dispatchEvent(new MouseEvent(type, { button }));
    click('mousedown', 0);
    click('mouseup', 0);
    click('mousedown', 0);
    const previous = sent.length;
    advance(32);
    expect(paint.mock.calls).toHaveLength(frames);
    expect(sent.length).toBeGreaterThan(previous);
    for (const data of sent.slice(previous)) {
      expect(decodeInput(data)!.keys & (KEY.FIRE | KEY.SPECIAL)).toBe(KEY.FIRE);
    }
    click('mousedown', 2);
    advance(24);
    expect(sent.slice(-2).some(data => !!(decodeInput(data)!.keys & KEY.SPECIAL))).toBe(true);
    click('mouseup', 0);
    click('mouseup', 2);
  });
});
