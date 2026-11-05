// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE } from '../../test/teams';
import { STUMBLE_TICKS, TEAM_COLOR } from '../shared/constants';
import { STILL, spawn } from '../shared/physics';
import { encodeSnapshot } from '../shared/protocol';
import type { ServerText } from '../shared/protocol';
import { ROOFTOPS } from '../shared/map';
import { FLAG, TEAM } from '../shared/types';
import type { FlagState, PlayerInfo, SnapPlayer, SocketLike } from '../shared/types';
import { build } from '../shared/world';
import type * as effects from './effects';
import { tinyFps } from './index';
import type { TinyFps } from './index';
import { SOUND } from './sfx';

const spies = vi.hoisted(() => ({
  play: vi.fn(),
  jolt: vi.fn(),
  punch: vi.fn(),
}));

vi.mock('./audio', () => ({
  createAudio: () => ({
    unlock: () => {},
    listen: () => {},
    play: spies.play,
    loop: () => ({ set: () => {} }),
    mute: () => {},
    muted: false,
    destroy: () => {},
  }),
  savedMute: () => false,
  toggleMute: () => false,
}));
vi.mock('./effects', async importOriginal => {
  const m = await importOriginal<typeof effects>();
  return {
    ...m,
    // The real effects, with the two impulses counted.
    createEffects: () => {
      const fx = m.createEffects();
      const [jolt, punch] = [fx.jolt, fx.punch];
      fx.jolt = () => (spies.jolt(), jolt());
      fx.punch = () => (spies.punch(), punch());
      return fx;
    },
  };
});

/** Bob (blue, id 1) carries the red flag and is tackled by Cy (red, id 2); Ann (red, id 0) watches, or is one of them. */
describe('the tackle through the socket, from each side', () => {
  const world = build(ROOFTOPS);
  const roster: PlayerInfo[] = [
    { id: 0, name: 'Ann', team: TEAM.RED, color: TEAM_COLOR[0] },
    { id: 1, name: 'Bob', team: TEAM.BLUE, color: TEAM_COLOR[1] },
    { id: 2, name: 'Cy', team: TEAM.RED, color: TEAM_COLOR[0] },
  ];
  let sock: SocketLike;
  let host: HTMLElement;
  let game: TinyFps;
  const carried: FlagState = { ...IDLE.flags[0], state: FLAG.CARRIED, by: 1 };
  const lying: FlagState = { ...IDLE.flags[0], state: FLAG.DROPPED, x: 5, y: 10, z: 60, left: 10 };
  const text = (m: ServerText) => sock.onmessage!({ data: JSON.stringify(m) });
  /** A snapshot of the three, Bob stumbling for `stun` ticks (tackled by Cy), the red flag as given. */
  const snap = (stun: number, flag = carried) => {
    const players: SnapPlayer[] = roster.map(({ id, team }) => ({
      ...spawn(id, world, id, team),
      ...STILL,
      id,
      stun: id === 1 ? stun : 0,
      by: id === 1 && stun ? 2 : 0,
      ack: 0xffff,
    }));
    sock.onmessage!({
      data: encodeSnapshot({ tick: 2, players, ...IDLE, flags: [flag, IDLE.flags[1]] }),
    });
  };
  const frames = () => vi.advanceTimersByTime(50);
  const hud = () => host.firstElementChild!.shadowRoot!;
  const q = (sel: string) => hud().querySelector<HTMLElement>(sel)!;
  /** Joins as player `you` and gets the quiet snapshot first. */
  const join = (you: number) => {
    game = tinyFps(host, { name: 'Me', socket: sock });
    sock.onopen!();
    text({ t: 'roster', you, players: roster });
    snap(0);
    frames();
    spies.play.mockClear();
    spies.jolt.mockClear();
    spies.punch.mockClear();
  };
  /** The whole tackle as snapshots: the hit, two more while he stumbles, and the end of it. */
  const play = () => {
    snap(STUMBLE_TICKS, lying);
    frames();
    snap(STUMBLE_TICKS - 2, lying);
    snap(STUMBLE_TICKS - 4, lying);
    frames();
    snap(0, lying);
    frames();
  };
  const played = (id: number) => spies.play.mock.calls.filter(c => c[0] === id);

  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    document.exitPointerLock = () => {};
    vi.useFakeTimers({
      toFake: [
        'setTimeout',
        'clearTimeout',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
      ],
    });
    host = document.createElement('div');
    document.body.append(host);
    sock = {
      binaryType: '',
      onopen: null,
      onclose: null,
      onmessage: null,
      send: () => {},
      close: () => {},
    };
    spies.play.mockClear();
  });
  afterEach(() => {
    game.destroy();
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('the tackled player, once: a jolt, the vignette, an impact and a grunt, no banner of his own', () => {
    join(1);
    snap(STUMBLE_TICKS, lying);
    frames();
    expect(spies.jolt).toHaveBeenCalledTimes(1);
    expect(spies.punch).not.toHaveBeenCalled();
    expect(Number(q('u').style.opacity)).toBeGreaterThan(0.5);
    expect(played(SOUND.TACKLE)).toEqual([[SOUND.TACKLE, undefined, undefined, undefined]]);
    expect(played(SOUND.GRUNT)).toHaveLength(1);
    // The rest of the stumble and its end make nothing more.
    snap(STUMBLE_TICKS - 2, lying);
    snap(0, lying);
    frames();
    expect(spies.jolt).toHaveBeenCalledTimes(1);
    expect(played(SOUND.TACKLE)).toHaveLength(1);
    expect(played(SOUND.GRUNT)).toHaveLength(1);
    // The vignette fades by itself.
    vi.advanceTimersByTime(1500);
    expect(q('u').style.opacity).toBe('');
    expect(q('output').textContent).not.toContain('Tackled');
  });

  it('the tackler, once: a punch, an impact, and the banner "Tackled Bob!" after the flag banner', () => {
    join(2);
    play();
    expect(spies.punch).toHaveBeenCalledTimes(1);
    expect(spies.jolt).not.toHaveBeenCalled();
    expect(Number(q('u').style.opacity || 0)).toBe(0);
    expect(played(SOUND.TACKLE)).toHaveLength(1);
    expect(played(SOUND.TACKLE)[0][1]).toBeUndefined();
    expect(played(SOUND.GRUNT)).toHaveLength(0);
    // The flag drop of step 6 still fires: its sound plays, and the banner is the tackle's.
    expect(played(SOUND.DROP)).toHaveLength(1);
    expect(q('output').textContent).toBe('Tackled Bob!');
  });

  it('a bystander, once: the impact at the spot and the flag banner, no camera and no vignette', () => {
    join(0);
    play();
    expect(spies.jolt).not.toHaveBeenCalled();
    expect(spies.punch).not.toHaveBeenCalled();
    expect(played(SOUND.GRUNT)).toHaveLength(0);
    const hits = played(SOUND.TACKLE);
    expect(hits).toHaveLength(1);
    // Where Bob is: a point in the world, not the listener.
    expect(hits[0][1]).toHaveLength(3);
    expect(Number(q('u').style.opacity || 0)).toBe(0);
    expect(q('output').textContent).toBe('Your flag was dropped');
  });

  it('fires again for the next tackle, and only then', () => {
    join(2);
    play();
    play();
    expect(spies.punch).toHaveBeenCalledTimes(2);
    expect(played(SOUND.TACKLE)).toHaveLength(2);
  });
});
