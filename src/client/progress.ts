// Where the run stands, read from the snapshots: the level, health, pickups, keys and phase. It
// switches levels and drives the HUD and the effects. No DOM of its own, unit-tested.
import { TICK_HZ } from '../shared/constants';
import { compile } from '../shared/level';
import { LEVELS } from '../shared/levels';
import { PHASE } from '../shared/types';
import type { Item, Level, Snapshot } from '../shared/types';
import type { Effects } from './effects';
import { SAY } from './hud';
import type { Hud } from './hud';
import { ITEM_COLOR } from './items';

/** An item that vanishes this close (metres, on the floor plane) to the own player was theirs. */
const NEAR = 1.5;

/** Ticks as m:ss.s, the tenth cut, not rounded. */
export const clock = (ticks: number) => {
  const d = Math.floor((ticks * 10) / TICK_HZ);
  return `${Math.floor(d / 600)}:${String(Math.floor(d / 10) % 60).padStart(2, '0')}.${d % 10}`;
};

export interface Progress {
  /** The level of the latest snapshot. */
  readonly lvl: Level;
  /** The pickups lying in it. */
  readonly items: Item[];
  /** The own player has no health left. */
  readonly dead: boolean;
  /** False for a player the latest snapshot shows without health: not drawn. */
  alive(id: number): boolean;
  /** A snapshot, before the predictor sees it: a new level or `hard` switches everything. */
  snapshot(s: Snapshot): void;
  /** The run is won: the end screen with its time. */
  end(ticks: number, hard: boolean): void;
}

export interface Deps {
  /** The level the predictor, renderer and effects were built with. */
  lvl: Level;
  /** The own player id, -1 while unknown. */
  you(): number;
  predictor: { level(lvl: Level): void };
  /** Absent without WebGL. */
  rd?: { level(lvl: Level): void };
  /** What the old level left waiting: shots and events. */
  delays: { clear(): void }[];
  fx: Effects;
  hud: Hud;
}

export const createProgress = ({ lvl, you, predictor, rd, delays, fx, hud }: Deps): Progress => {
  /** Level and `hard` of the last snapshot, as one number; -1 before the first. */
  let at = -1;
  let phase = -1;
  let hp = new Map<number, number>();
  const p: { -readonly [K in keyof Progress]: Progress[K] } = {
    lvl,
    items: [],
    dead: false,
    alive: id => hp.get(id) !== 0,

    snapshot(s) {
      const id = you();
      const key = s.level * 2 + +s.hard;
      if (key != at) {
        const map = LEVELS[s.level];
        if (!map) {
          return;
        }
        at = key;
        p.lvl = compile(map);
        p.items = [];
        hp = new Map();
        phase = -1;
        predictor.level(p.lvl);
        rd?.level(p.lvl);
        fx.reset(p.lvl);
        delays.forEach(d => d.clear());
        hud.say(SAY.TITLE, `Level ${s.level + 1}${s.hard ? '\nHard mode' : ''}`);
      }
      const me = s.players.find(q => q.id == id);
      const was = hp.get(id);
      if (me && was !== undefined && me.hp < was) {
        fx.hit();
      }
      hp = new Map(s.players.map(q => [q.id, q.hp]));
      for (const it of p.items) {
        if (
          me &&
          !s.items.some(j => j.id == it.id) &&
          Math.hypot(it.x - me.x, it.z - me.z) < NEAR
        ) {
          fx.pickup(ITEM_COLOR[it.kind]);
        }
      }
      p.items = s.items;
      if (s.phase != phase) {
        phase = s.phase;
        hud.say(SAY.NOTE, phase == PHASE.RETURN ? 'Back to the start!' : 'Find the exit');
      }
      p.dead = me?.hp === 0;
      hud.hp(me?.hp ?? 0);
      hud.keys(s.keys);
      hud.dead(p.dead);
    },

    end: (ticks, hard) =>
      hud.say(
        SAY.END,
        `Run complete\n${clock(ticks)}${hard ? ' (hard)' : ''}\nNext run: Hard mode`,
      ),
  };
  return p;
};
