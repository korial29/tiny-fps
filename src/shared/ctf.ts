// Capture the flag, the host's side: the two flags, the score, the match clock and the end of a
// match. Rules over the players the room hands in, ticked at TICK_HZ; no timer, no DOM, no sockets.
// The flags never touch the movement: nothing here changes a PlayerState, so prediction is the same
// with or without them.
import {
  END_SCREEN,
  FLAG_H,
  FLAG_LOCK,
  FLAG_REACH,
  FLAG_RETURN,
  PLAYER_H,
  TICK_HZ,
} from './constants';
import { EV, FLAG } from './types';
import type { FlagState, PlayerState, Rules, Snapshot } from './types';
import { ray } from './world';
import type { World } from './world';

type Vec3 = [number, number, number];

/** A player as the rules see him. */
export interface Runner {
  id: number;
  team: number;
  state: PlayerState;
}

/** What a tick of the match ended or began. */
export type Turn = 'end' | 'start';

/** The captures, returns and frags of one player this match. */
export interface Tally {
  id: number;
  caps: number;
  returns: number;
  frags: number;
}

interface Mate {
  team: number;
  caps: number;
  returns: number;
  frags: number;
  /** The last point he stood on: where a flag falls when he falls off the map or leaves. */
  ground: Vec3;
}

const home = (): FlagState => ({ state: FLAG.HOME, by: 0, x: 0, y: 0, z: 0, left: 0 });

/** How far under a carrier a flag that he drops in the air is looked for a floor, metres. */
const FALL = 60;

export class Ctf {
  /** Captures per team, red then blue. */
  public score: [number, number] = [0, 0];
  /** The match is over and the end screen shows. */
  public over = false;
  /** Frags this match, by everyone: the first is first blood. */
  public frags = 0;
  /** The flag of each team, red then blue. */
  public flags: [FlagState, FlagState] = [home(), home()];
  private world: World;
  private rules: Rules;
  private mates = new Map<number, Mate>();
  /** Ticks to the end of the match, or to the next one while it is over. */
  private clock: number;
  /** Ticks before each dropped flag goes home. */
  private back = [0, 0];
  /** Who may not take each flag, and for how many more ticks: the carrier that was made to drop it. */
  private lock = [
    { id: -1, left: 0 },
    { id: -1, left: 0 },
  ];
  /** Ticks before a tackled flag can be sent home: it lies there, and the carrier's mates may take it. */
  private hold = [0, 0];

  public constructor(world: World, rules: Rules) {
    this.world = world;
    this.rules = rules;
    this.clock = rules.timeLimit * TICK_HZ;
  }

  /** A player joined, standing at `at`. */
  public join(id: number, team: number, at: PlayerState): void {
    this.mates.set(id, { team, caps: 0, returns: 0, frags: 0, ground: [at.x, at.y, at.z] });
  }

  /** A player left: a flag he carried is dropped where he last stood. */
  public leave(id: number): void {
    const k = this.carrying(id);
    const m = this.mates.get(id);
    if (k >= 0 && m) {
      this.dropAt(k, m.ground);
    }
    this.mates.delete(id);
  }

  /** A player was put at `at` (a new match): his last ground is there. */
  public place(id: number, at: PlayerState): void {
    const m = this.mates.get(id);
    if (m) {
      m.ground = [at.x, at.y, at.z];
    }
  }

  /**
   * The player's state after one move. Under the kill floor and put back at a spawn (EV.RESPAWN),
   * a carrier drops the flag where he last stood; then a floor under him is his last ground.
   */
  public moved(p: PlayerState): void {
    const m = this.mates.get(p.id);
    if (!m) {
      return;
    }
    const k = this.carrying(p.id);
    if (p.ev & EV.RESPAWN && k >= 0) {
      this.dropAt(k, m.ground);
    }
    if (p.ground) {
      m.ground = [p.x, p.y, p.z];
    }
  }

  /**
   * Makes the player drop the flag he carries (the tackle of step 7). It lies under him: where he
   * stands, or on the first floor below him, or at his last ground when there is none (over the
   * void). False when he carried nothing.
   */
  public drop(p: PlayerState): boolean {
    const k = this.carrying(p.id);
    const m = this.mates.get(p.id);
    if (k < 0 || !m || this.over) {
      return false;
    }
    let at: Vec3 = m.ground;
    if (p.ground) {
      at = [p.x, p.y, p.z];
    } else {
      const d = ray(this.world, [p.x, p.y + 0.05, p.z], [0, -1, 0], FALL);
      if (d < FALL) {
        at = [p.x, p.y + 0.05 - d, p.z];
      }
    }
    this.dropAt(k, at);
    this.lock[k] = { id: p.id, left: FLAG_LOCK * TICK_HZ };
    this.hold[k] = FLAG_LOCK * TICK_HZ;
    return true;
  }

  /** The team whose flag the player carries, or -1. */
  public carrying(id: number): number {
    return this.flags.findIndex(f => f.state === FLAG.CARRIED && f.by === id);
  }

  /** The winning team of a match that is over, or -1 for a draw. */
  public winner(): number {
    const [r, b] = this.score;
    return r > b ? 0 : b > r ? 1 : -1;
  }

  /** What every player has done this match. */
  public tally(): Tally[] {
    return [...this.mates].map(([id, m]) => ({
      id,
      caps: m.caps,
      returns: m.returns,
      frags: m.frags,
    }));
  }

  /**
   * Player `id` put an enemy down: his frags this match, or 0 when he is not in it or the match is
   * over.
   */
  public frag(id: number): number {
    const m = this.mates.get(id);
    if (!m || this.over) {
      return 0;
    }
    this.frags++;
    return ++m.frags;
  }

  /** The room is empty: the next match starts from scratch. */
  public reset(): void {
    this.over = false;
    this.score = [0, 0];
    this.frags = 0;
    this.flags = [home(), home()];
    this.back = [0, 0];
    this.lock.forEach(l => (l.left = 0));
    this.hold = [0, 0];
    this.clock = this.rules.timeLimit * TICK_HZ;
    for (const m of this.mates.values()) {
      m.caps = m.returns = m.frags = 0;
    }
  }

  /** The part of a snapshot that is the match's. */
  public wire(): Pick<Snapshot, 'score' | 'clock' | 'over' | 'flags'> {
    return {
      score: [...this.score],
      clock: Math.ceil(this.clock / TICK_HZ),
      over: this.over,
      flags: this.flags.map(f => ({ ...f })) as [FlagState, FlagState],
    };
  }

  /**
   * One host tick over the players: the dropped flags run down, flags are taken, returned and
   * captured, the clock runs. 'end' when the match has just ended, 'start' when the end screen is
   * done and a new match begins (the room puts everyone back at a spawn).
   */
  public tick(players: Runner[]): Turn | undefined {
    if (this.over) {
      if (--this.clock <= 0) {
        this.reset();
        return 'start';
      }
      return;
    }
    for (const k of [0, 1]) {
      const f = this.flags[k];
      this.lock[k].left--;
      this.hold[k]--;
      if (f.state === FLAG.DROPPED) {
        f.left = Math.ceil(--this.back[k] / TICK_HZ);
        if (this.back[k] <= 0) {
          this.flags[k] = home();
        }
      }
    }
    for (const k of [0, 1]) {
      const f = this.flags[k];
      if (f.state === FLAG.CARRIED) {
        continue;
      }
      const at = f.state === FLAG.HOME ? this.world.def.teams[k].base : ([f.x, f.y, f.z] as Vec3);
      // A teammate sends a lying flag home, before an enemy gets to take it, once a tackled flag has
      // lain its FLAG_LOCK (the tackler stands on it); an enemy takes it at its base.
      const near = players.filter(q => touches(q.state, at));
      const mate =
        f.state === FLAG.DROPPED && this.hold[k] <= 0 ? near.find(q => q.team === k) : undefined;
      const foe = near.find(
        q => q.team !== k && (q.id !== this.lock[k].id || this.lock[k].left <= 0),
      );
      if (mate) {
        const m = this.mates.get(mate.id);
        if (m) {
          m.returns++;
        }
        this.flags[k] = home();
      } else if (foe) {
        this.flags[k] = { ...home(), state: FLAG.CARRIED, by: foe.id };
      }
    }
    for (const p of players) {
      const k = this.carrying(p.id);
      // Home with the enemy flag, and one's own flag at its base.
      if (
        k >= 0 &&
        this.flags[p.team].state === FLAG.HOME &&
        touches(p.state, this.world.def.teams[p.team].base)
      ) {
        this.score[p.team]++;
        const m = this.mates.get(p.id);
        if (m) {
          m.caps++;
        }
        this.flags[k] = home();
      }
    }
    if (this.score.some(s => s >= this.rules.scoreLimit) || --this.clock <= 0) {
      this.over = true;
      this.clock = END_SCREEN * TICK_HZ;
      return 'end';
    }
  }

  private dropAt(k: number, [x, y, z]: Vec3): void {
    this.flags[k] = { state: FLAG.DROPPED, by: 0, x, y, z, left: FLAG_RETURN };
    this.back[k] = FLAG_RETURN * TICK_HZ;
  }
}

/** Whether the player's body reaches the flag foot at `at`: close enough, and overlapping its height. */
export const touches = (p: PlayerState, at: Vec3): boolean =>
  Math.hypot(p.x - at[0], p.z - at[2]) < FLAG_REACH &&
  p.y < at[1] + FLAG_H &&
  p.y + PLAYER_H > at[1];
