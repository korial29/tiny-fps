// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HIGHLINE } from '../shared/map';
import { MOON } from '../shared/moon';
import { ROLE, rolesOf } from '../shared/kit';
import type { SocketLike } from '../shared/types';
import { tinyFps } from './index';
import { TRAITS, createLobby } from './lobby';
import type { Cast } from './lobby';

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
});
