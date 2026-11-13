// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE } from '../../test/teams';
import { TEAM_COLOR } from '../shared/constants';
import { STILL, spawn } from '../shared/physics';
import { encodeSnapshot } from '../shared/protocol';
import type { ServerText } from '../shared/protocol';
import { HIGHLINE, ROOFTOPS } from '../shared/map';
import { MOON } from '../shared/moon';
import { BODY, FLAG, TEAM } from '../shared/types';
import { ROLE } from '../shared/kit';
import type { FlagState, PlayerInfo, SnapPlayer, SocketLike, Snapshot } from '../shared/types';
import { build } from '../shared/world';
import { tinyFps } from './index';
import type { TinyFps } from './index';

/** The game with no WebGL (jsdom has none): the sockets, the HUD and the events still run. */
describe('tinyFps, the match through the socket', () => {
  const world = build(ROOFTOPS);
  let sent: (string | ArrayBuffer)[];
  let sock: SocketLike;
  let host: HTMLElement;
  let game: TinyFps;

  const roster: PlayerInfo[] = [
    { id: 0, name: 'Ann', team: TEAM.RED, color: TEAM_COLOR[0] },
    { id: 1, name: 'Bob', team: TEAM.BLUE, color: TEAM_COLOR[1] },
  ];
  const text = (m: ServerText) => sock.onmessage!({ data: JSON.stringify(m) });
  const snap = (over: Partial<Snapshot> = {}) => {
    const players: SnapPlayer[] = [0, 1].map(id => ({
      ...spawn(id, world, 0, id),
      ...STILL,
      id,
      ack: 0xffff,
      by: 0,
    }));
    sock.onmessage!({ data: encodeSnapshot({ tick: 2, players, ...IDLE, ...over }) });
  };
  const flag = (over: Partial<FlagState>): FlagState => ({ ...IDLE.flags[0], ...over });
  const hud = () => host.firstElementChild!.shadowRoot!;
  const q = (sel: string) => hud().querySelector<HTMLElement>(sel)!;
  const frames = () => vi.advanceTimersByTime(50);

  beforeEach(() => {
    // jsdom has neither a canvas nor a pointer lock.
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
    sent = [];
    sock = {
      binaryType: '',
      onopen: null,
      onclose: null,
      onmessage: null,
      send: d => sent.push(d),
      close: () => {},
    };
    host = document.createElement('div');
    document.body.append(host);
    game = tinyFps(host, { name: 'Ann', socket: sock });
    sock.onopen!();
    text({ t: 'roster', you: 0, players: roster });
    snap();
    frames();
  });
  afterEach(() => {
    game.destroy();
    host.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('joins, and shows the score, the clock and both flags at home from the first snapshot', () => {
    expect(JSON.parse(sent[0] as string)).toEqual({ t: 'join', name: 'Ann' });
    expect(q('nav').hidden).toBe(false);
    expect(q('nav').textContent).toContain('RED 0');
    expect(q('nav').textContent).toContain('8:00');
    expect(q('nav').textContent).toContain('Red flag: home');
    expect(q('nav').textContent).toContain('Blue flag: home');
    expect(q('output').hidden).toBe(true);
  });

  it('puts the name of the map it plays, Highline, on the title screen', () => {
    expect(hud().textContent).toContain(HIGHLINE.name);
    expect(HIGHLINE.name).toBe('Highline');
  });

  it('says in a banner that the other team took the own flag, and names the carrier in the flag line', () => {
    snap({ flags: [flag({ state: FLAG.CARRIED, by: 1 }), flag({})] });
    frames();
    expect(q('output').hidden).toBe(false);
    expect(q('output').textContent).toBe('Blue took your flag');
    expect(q('nav').textContent).toContain('Red flag: taken by Bob');
  });

  it('says a drop, a return and a score, one banner after the other', () => {
    snap({ flags: [flag({}), flag({ state: FLAG.CARRIED, by: 0 })] });
    expect(q('output').textContent).toBe('You took the blue flag');
    snap({ flags: [flag({}), flag({ state: FLAG.DROPPED, x: 1, y: 2, z: 3, left: 10 })] });
    expect(q('output').textContent).toBe('Blue flag dropped');
    frames();
    expect(q('nav').textContent).toContain('Blue flag: dropped 10s');
    snap({ flags: [flag({}), flag({})] });
    expect(q('output').textContent).toBe('Blue flag returned');
    snap({ score: [1, 0] });
    expect(q('output').textContent).toBe('Red scored');
    frames();
    expect(q('nav').textContent).toContain('RED 1');
    // The banner goes after a few seconds.
    vi.advanceTimersByTime(3000);
    expect(q('output').hidden).toBe(true);
  });

  it('shows the end screen when the match is over, with the result from the end message', () => {
    snap({ score: [3, 1] });
    text({
      t: 'end',
      score: [3, 1],
      players: [
        { id: 0, name: 'Ann', team: 0, caps: 3, returns: 1 },
        { id: 1, name: 'Bob', team: 1, caps: 1, returns: 0 },
      ],
    });
    // The result alone is not the end screen: the snapshot has to say the match is over.
    frames();
    expect(q('section').hidden).toBe(true);
    snap({ score: [3, 1], over: true, clock: 10 });
    frames();
    expect(q('section').hidden).toBe(false);
    expect(q('section h6').textContent).toBe('RED WINS');
    expect(q('section').textContent).toContain('Ann');
    expect(q('section').textContent).toContain('Next match in 10');
    expect(q('nav').textContent).toContain('END');
    // The next match: the screen goes, the score is back to nothing.
    snap();
    frames();
    expect(q('section').hidden).toBe(true);
    expect(q('output').textContent).toBe('New match');
    expect(q('nav').textContent).toContain('RED 0');
  });

  it('sends the whole choice made on the title screen, and wears what the roster answers', () => {
    const radios = (label: string) => [
      ...hud().querySelectorAll<HTMLElement>(`[aria-label="${label}"] [role=radio]`),
    ];
    const checked = () => radios('Body').map(c => c.getAttribute('aria-checked'));
    expect(checked()).toEqual(['true', 'false']);
    radios('Body')[BODY.FEMALE].click();
    expect(JSON.parse(sent.at(-1) as string)).toMatchObject({ t: 'body', body: BODY.FEMALE });
    radios('Class')[ROLE.NINJA].click();
    expect(JSON.parse(sent.at(-1) as string)).toMatchObject({
      body: BODY.FEMALE,
      role: ROLE.NINJA,
    });
    // No astronaut off the moon: greyed out and deaf to a click.
    const told = sent.length;
    radios('Class')[ROLE.ASTRONAUT].click();
    expect(sent).toHaveLength(told);
    // The host's word is the last one: his roster says the man again.
    text({ t: 'roster', you: 0, players: roster });
    expect(checked()).toEqual(['true', 'false']);
    text({
      t: 'roster',
      you: 0,
      players: [{ ...roster[0], body: BODY.FEMALE, tone: 5, role: ROLE.NINJA }, roster[1]],
    });
    expect(checked()).toEqual(['false', 'true']);
    expect(radios('Skin')[5].getAttribute('aria-checked')).toBe('true');
    expect(radios('Class')[ROLE.NINJA].getAttribute('aria-checked')).toBe('true');
  });

  it('starts on the title screen’s button as on the canvas, and on nothing else in its panel', () => {
    const lock = vi.fn();
    (q('canvas') as HTMLCanvasElement).requestPointerLock = lock;
    hud().querySelectorAll<HTMLElement>('[role=tab]')[1].click();
    hud().querySelectorAll<HTMLElement>('[role=radio]')[1].click();
    q('aside main').click();
    expect(lock).not.toHaveBeenCalled();
    q('aside header>:last-child').click();
    expect(lock).toHaveBeenCalledOnce();
  });

  it('tells the map’s kind and lore on the title screen', () => {
    frames();
    expect(q('aside h3').textContent).toBe(HIGHLINE.name);
    expect(q('aside address').textContent).toContain(HIGHLINE.tag);
    expect(q('aside address').textContent).toContain(HIGHLINE.lore);
  });

  it('offers no map to pick in the game’s menu, to the host or anyone', () => {
    for (const host of [0, 1]) {
      text({ t: 'roster', you: 0, players: roster, map: 'highline', host });
      frames();
      expect(hud().querySelector('menu')).toBeNull();
    }
    expect(sent.some(d => typeof d == 'string' && JSON.parse(d).t == 'map')).toBe(false);
  });

  it('follows the room to another map on the same socket, without joining again', () => {
    const told = vi.fn();
    game.on('roster', told);
    text({ t: 'roster', you: 0, players: roster, map: 'tranquility', host: 0 });
    expect(told).toHaveBeenCalledOnce();
    expect(host.childElementCount).toBe(1);
    expect(game.players()).toEqual(roster);
    snap();
    frames();
    expect(q('aside').textContent).toContain(MOON.name);
    expect(q('nav').hidden).toBe(false);
    expect(sent.filter(d => typeof d == 'string' && JSON.parse(d).t == 'join')).toHaveLength(1);
    // The new scene sends its inputs on the socket.
    const before = sent.length;
    frames();
    expect(sent.length).toBeGreaterThan(before);
    expect(sent.at(-1)).toBeInstanceOf(ArrayBuffer);
  });

  it('tints the name tag of another player with his team colour', () => {
    // No renderer here, so no projection: the tag exists but is hidden. It is tinted all the same.
    const tag = [...hud().querySelectorAll<HTMLElement>('b')].find(b => b.textContent === 'Bob');
    expect(tag).toBeDefined();
    expect(tag!.style.color).not.toBe('');
  });
});
