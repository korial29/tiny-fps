import { INPUT_BURST, MAX_NAME, RULES, SNAP_EVERY, TICK_HZ } from './constants';
import { YARD } from './map';
import { move, spawn } from './physics';
import { decodeInput, encodeSnapshot, parseText } from './protocol';
import type { ClientText, ServerText } from './protocol';
import type { Conn, Every, PlayerInfo, PlayerState, Rules } from './types';

interface Player {
  conn: Conn;
  info: PlayerInfo;
  state: PlayerState;
  /** Inputs the player may still apply: +1 per tick, at most INPUT_BURST. */
  bank: number;
  /** Seq of the last applied input. Starts at 65535, the seq before the client's first (0). */
  ack: number;
}

/** Ticks run at most this many times per timer callback, so a stalled host does not spiral. */
const MAX_CATCH_UP = 20;
/** A new player does not spawn within this many metres of another one. */
const SPAWN_CLEAR = 2;

const COLORS = [
  '#e6194b',
  '#3cb44b',
  '#ffe119',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#bfef45',
  '#fabed4',
  '#469990',
  '#dcbeff',
  '#9a6324',
  '#800000',
  '#aaffc3',
  '#808000',
];

/** First n characters (code points) of s, trimmed. */
const cut = (s: string, n: number): string => Array.from(s).slice(0, n).join('').trim();

const cleanName = (raw: unknown): string =>
  cut(
    (typeof raw === 'string' ? raw : '')
      .replace(/\s+/g, ' ')
      .replace(/\p{Cc}/gu, '')
      .trim(),
    MAX_NAME,
  );

/** name, or name 2, name 3… (base cut to stay within MAX_NAME) when it is taken. */
const unique = (name: string, taken: string[]): string => {
  let out = name;
  for (let n = 2; taken.includes(out); n++) {
    out = `${cut(name, MAX_NAME - 1 - `${n}`.length)} ${n}`;
  }
  return out;
};

const setEvery: Every = (cb, ms) => {
  const id = setInterval(cb, ms);
  return () => clearInterval(id);
};

/**
 * One game, transport-agnostic. The Node server and the local host tab both drive a Room: they
 * feed it connections and frames, the room answers through Conn.send.
 *
 * - A peer joins with { t: 'join', name }: unique name (`Bob 2`), unique colour, a spawn point not
 *   taken by another player; 'full' beyond rules.maxPlayers. Everyone gets a fresh 'roster' on
 *   every join and leave.
 * - Each input frame moves its player at once with move(); the INPUT_BURST bank drops the excess.
 * - Every SNAP_EVERY ticks of TICK_HZ, one snapshot with every player goes to every peer.
 */
export class Room {
  /** Every connected peer; null until it joins. */
  private peers = new Map<Conn, Player | null>();
  private ticks = 0;
  private halt: (() => void) | undefined;
  private rules: Rules;
  /** Round-robin cursor over the spawn points, used once they are all taken. */
  private rr = 0;

  /** Missing rules fall back to RULES. */
  public constructor(rules: Partial<Rules> = {}) {
    this.rules = { ...RULES, ...rules };
  }

  /** Number of joined players. */
  public get size(): number {
    return this.players().length;
  }

  /** A peer opened. Nothing is sent until it joins. */
  public connect(conn: Conn): void {
    this.peers.set(conn, null);
  }

  /** A text (JSON) or binary frame from a peer. */
  public receive(conn: Conn, data: string | ArrayBuffer): void {
    const p = this.peers.get(conn);
    if (typeof data === 'string') {
      const msg = parseText<ClientText>(data);
      if (p === null && msg?.t === 'join') {
        this.join(conn, msg.name);
      }
      return;
    }
    const input = p && decodeInput(data);
    // An input beyond the bank is dropped, and not acked.
    if (input && p.bank > 0) {
      p.bank--;
      move(p.state, input, YARD);
      p.ack = input.seq;
    }
  }

  /** A peer left: its player goes, the roster goes out again. */
  public disconnect(conn: Conn): void {
    const p = this.peers.get(conn);
    this.peers.delete(conn);
    if (p) {
      this.roster();
    }
  }

  /** One host tick. Public so tests can drive the room without a timer. */
  public tick(): void {
    const players = this.players();
    if (!players.length) {
      return;
    }
    players.forEach(p => (p.bank = Math.min(INPUT_BURST, p.bank + 1)));
    if (++this.ticks % SNAP_EVERY === 0) {
      // One buffer for everyone: transports must not mutate it.
      const snap = encodeSnapshot({
        tick: this.ticks,
        players: players.map(p => ({ ...p.state, ack: p.ack })),
      });
      players.forEach(p => p.conn.send(snap));
    }
  }

  /**
   * Drives tick() with a timer. An accumulator on performance.now() keeps the
   * simulation at TICK_HZ whatever the timer jitter; after a stall at most
   * MAX_CATCH_UP ticks are replayed and the rest of the backlog is dropped.
   * `every` replaces setInterval, e.g. with a Worker-backed timer that
   * background tabs do not throttle.
   */
  public start(every: Every = setEvery): void {
    if (this.halt) {
      return;
    }
    const dt = 1000 / TICK_HZ;
    let last = performance.now();
    let acc = 0;
    this.halt = every(() => {
      const now = performance.now();
      acc += now - last;
      last = now;
      for (let n = 0; acc >= dt && n < MAX_CATCH_UP; n++) {
        this.tick();
        acc -= dt;
      }
      acc %= dt;
    }, dt);
  }

  public stop(): void {
    this.halt?.();
    this.halt = undefined;
  }

  private players(): Player[] {
    return [...this.peers.values()].filter(p => p !== null);
  }

  private join(conn: Conn, name: unknown): void {
    const players = this.players();
    if (players.length >= this.rules.maxPlayers) {
      conn.send(JSON.stringify({ t: 'full' } satisfies ServerText));
      return;
    }
    // Smallest free id.
    let id = 0;
    while (players.some(p => p.info.id === id)) {
      id++;
    }
    // First colour nobody wears (all of them taken only when maxPlayers exceeds the palette).
    const color =
      COLORS.find(c => !players.some(p => p.info.color === c)) ?? COLORS[id % COLORS.length];
    // First spawn point with nobody within SPAWN_CLEAR, else the next one round-robin.
    const near = (n: number): boolean => {
      const { x, z } = spawn(id, YARD, n);
      return players.some(p => Math.hypot(p.state.x - x, p.state.z - z) < SPAWN_CLEAR);
    };
    let n = 0;
    while (n < YARD.spawns.length && near(n)) {
      n++;
    }
    const player: Player = {
      conn,
      info: {
        id,
        // Two present players never share a name.
        name: unique(
          cleanName(name) || `Player ${id}`,
          players.map(p => p.info.name),
        ),
        color,
      },
      state: spawn(id, YARD, n < YARD.spawns.length ? n : this.rr++),
      bank: INPUT_BURST,
      ack: 0xffff,
    };
    this.peers.set(conn, player);
    this.roster();
  }

  /** Each joined peer gets the full roster with its own id. */
  private roster(): void {
    const players = this.players();
    const list = players.map(p => p.info).sort((a, b) => a.id - b.id);
    players.forEach(p =>
      p.conn.send(
        JSON.stringify({ t: 'roster', you: p.info.id, players: list } satisfies ServerText),
      ),
    );
  }
}
