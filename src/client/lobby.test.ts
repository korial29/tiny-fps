// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIGHLINE } from '../shared/map';
import { MOON } from '../shared/moon';
import { ROLE, rolesOf } from '../shared/kit';
import type { SocketLike } from '../shared/types';
import { tinyFps } from './index';
import { TRAITS, createLobby } from './lobby';
import type { Cast } from './lobby';
import type * as Render from './render';

// The renderer's builds (warmSteps()) are left out: the scene waits for none. Run for real, the
// first test's hook spent them, over 10 s on a loaded runner.
vi.mock('./render', async importOriginal => ({
  ...(await importOriginal<typeof Render>()),
  warmSteps: () => [],
}));

/** The character screen with no WebGL (jsdom has none): the tiles, the words and Start still work. */
describe('the character screen', () => {
  let host: HTMLElement;
  const shadow = () => host.firstElementChild!.shadowRoot!;
  const q = <T extends HTMLElement>(sel: string) => shadow().querySelector<T>(sel)!;
  const all = (sel: string) => [...shadow().querySelectorAll<HTMLElement>(sel)];
  const group = (label: string) => all(`[aria-label=${label}] [role=radio]`);

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
  });
  afterEach(() => {
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows a tile for each class the map offers, the first one picked with the first skin', () => {
    const start = vi.fn();
    createLobby(host, HIGHLINE, start);
    expect(group('Class').map(b => b.querySelector('b')!.textContent)).toEqual(
      rolesOf(HIGHLINE).map(r => TRAITS[r].name),
    );
    expect(q('h1').textContent).toBe('Marine');
    q('.go').click();
    expect(start).toHaveBeenCalledWith({ body: 0, tone: 0, hair: 0, role: ROLE.MARINE });
    // Start takes the screen away.
    expect(host.children).toHaveLength(0);
  });

  it('names the class picked over its strengths and weaknesses, and hides what it cannot change', () => {
    createLobby(host, MOON, () => {});
    expect(group('Class').map(b => b.querySelector('b')!.textContent)).toEqual([
      'Astronaut',
      'Xenomorph',
      'Hunter',
    ]);
    group('Class')[2].click();
    expect(q('h1').textContent).toBe('Hunter');
    expect(all('.p li').map(li => li.textContent)).toEqual(TRAITS[ROLE.HUNTER].pros);
    expect(all('.c li').map(li => li.textContent)).toEqual(TRAITS[ROLE.HUNTER].cons);
    expect(q('.look').hidden).toBe(true);
  });

  it('keeps the last choice for the next visit', () => {
    let got: Cast | undefined;
    createLobby(host, HIGHLINE, c => (got = c));
    group('Class')[1].click();
    group('Body')[1].click();
    group('Skin')[3].click();
    q('.go').click();
    expect(got).toEqual({ body: 1, tone: 3, hair: 0, role: ROLE.NINJA });
    createLobby(host, HIGHLINE, () => {});
    expect(q('h1').textContent).toBe('Ninja');
  });

  it('opens again in a match on what the player wears, with no renderer of its own', () => {
    const start = vi.fn();
    const draw = vi.fn((..._: unknown[]) => true);
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame');
    // The last visit's choice is not what he wears now.
    localStorage.setItem('tiny-fps-cast', JSON.stringify({ body: 0, role: ROLE.MARINE }));
    const lobby = createLobby(host, HIGHLINE, start, {
      body: 1,
      tone: 2,
      hair: undefined,
      role: ROLE.NINJA,
    });
    expect(q('h1').textContent).toBe('Ninja');
    expect(group('Body').map(b => b.getAttribute('aria-checked'))).toEqual(['false', 'true']);
    expect(q('.go').textContent).toBe('Apply');
    expect(q('.lb').classList.contains('ag')).toBe(true);
    vi.advanceTimersByTime(1000);
    // It draws nothing itself: no frame asked, no context made.
    expect(raf).not.toHaveBeenCalled();
    expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
    // The game's frames offer its renderer: the big picture of the choice shown, 30 times a second at most.
    const picture = q<HTMLCanvasElement>('figure canvas');
    picture.height = 90;
    expect(q('figure span').hidden).toBe(false);
    // The first one was due at once: the second frame draws too, then every other one.
    lobby.paint(1000, draw);
    lobby.paint(1016, draw);
    lobby.paint(1020, draw);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw.mock.calls[0].slice(0, 2)).toEqual([
      picture,
      { body: 1, tone: 2, hair: 0, role: ROLE.NINJA },
    ]);
    expect(q('figure span').hidden).toBe(true);
    // A class picked and not applied yet is the one drawn.
    group('Class')[0].click();
    lobby.paint(1040, draw);
    expect(draw.mock.calls[2][1]).toMatchObject({ role: ROLE.MARINE });
    q('.go').click();
    // Gone, it asks for nothing more.
    lobby.paint(2000, draw);
    expect(draw).toHaveBeenCalledTimes(3);
    expect(start).toHaveBeenCalledWith({ body: 1, tone: 2, hair: 0, role: ROLE.MARINE });
    expect(host.children).toHaveLength(0);
  });

  it('goes back from a match with Back or Escape, nothing chosen', () => {
    const start = vi.fn();
    createLobby(host, HIGHLINE, start, { body: 0 });
    group('Class')[1].click();
    q('.bk').click();
    expect(host.children).toHaveLength(0);
    createLobby(host, HIGHLINE, start, { body: 0 });
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(host.children).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
    // Before a match there is no way back.
    createLobby(host, HIGHLINE, start);
    expect(shadow().querySelector('.bk')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    expect(host.children).toHaveLength(1);
  });

  it('joins the room only on Start, with the whole choice', () => {
    const sent: string[] = [];
    const sock: SocketLike = {
      binaryType: '',
      onopen: null,
      onclose: null,
      onmessage: null,
      send: d => sent.push(d as string),
      close: () => {},
    };
    const game = tinyFps(host, { name: 'Ann', socket: sock, cast: true });
    const started = vi.fn();
    game.on('start', started);
    sock.onopen!();
    expect(sent).toEqual([]);
    group('Class')[2].click();
    q('.go').click();
    expect(started).toHaveBeenCalledOnce();
    expect(JSON.parse(sent[0])).toEqual({
      t: 'join',
      name: 'Ann',
      body: 0,
      tone: 0,
      hair: 0,
      role: ROLE.XENO,
    });
    game.destroy();
  });

  it('goes from Start straight into the game: the lock its click takes passes to the canvas', () => {
    // jsdom has no pointer lock: the element that asked last holds it.
    let held: Element | null = null;
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => held });
    document.exitPointerLock = () => {};
    const asks: Element[] = [];
    Element.prototype.requestPointerLock = function (this: Element) {
      asks.push(this);
      held = asks[asks.length - 1];
      return Promise.resolve();
    };
    const sock: SocketLike = {
      binaryType: '',
      onopen: null,
      onclose: null,
      onmessage: null,
      send: () => {},
      close: () => {},
    };
    const game = tinyFps(host, { name: 'Ann', socket: sock, cast: true });
    sock.onopen!();
    expect(asks).toEqual([]);
    q('.go').click();
    // The click's gesture: the container takes the lock, the game's canvas not built yet.
    expect(asks).toEqual([host]);
    vi.advanceTimersByTime(400);
    const canvas = host.firstElementChild!.shadowRoot!.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(asks).toEqual([host, canvas]);
    game.destroy();
    delete (document as { pointerLockElement?: Element | null }).pointerLockElement;
    delete (Element.prototype as { requestPointerLock?: unknown }).requestPointerLock;
  });
});
