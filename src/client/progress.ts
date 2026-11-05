// Where the game stands, read from the snapshots: health, pickups, keys and phase. It drives the
// HUD and the effects. No DOM of its own, unit-tested.
import { PLAYER_RESPAWN, TICK_HZ } from '../shared/constants';
import { PHASE } from '../shared/types';
import type { Item, Level, MapDef, Snapshot } from '../shared/types';
import type { Audio } from './audio';
import type { Effects } from './effects';
import { SAY } from './hud';
import type { Hud } from './hud';
import { ITEM_COLOR } from './items';
import { SOUND } from './sfx';

/** An item that vanishes this close (metres, on the floor plane) to the own player was theirs. */
const NEAR = 1.5;

export interface Progress {
  /** The pickups lying in it. */
  readonly items: Item[];
  /** The own player has no health left. */
  readonly dead: boolean;
  /** The own health: 0 when dead or unknown. */
  readonly hp: number;
  /** The map's name, for the title screen. */
  readonly name: string;
  /** The level is in its RETURN phase: the team runs back to the exit. */
  readonly returning: boolean;
  /** False for a player the latest snapshot shows without health: not drawn. */
  alive(id: number): boolean;
  /** A snapshot. */
  snapshot(s: Snapshot): void;
}

export interface Deps {
  /** The level the game is played on. */
  lvl: Level;
  /** The own player id, -1 while unknown. */
  you(): number;
  fx: Effects;
  hud: Hud;
  /** Plays COLLECT when the own player takes an item. */
  audio?: Pick<Audio, 'play'>;
}

/** The yaw of the spawn nearest (x, z): where a player put back at the start should look. */
export const facing = ({ spawns }: MapDef, x: number, z: number): number =>
  spawns.reduce((a, b) =>
    Math.hypot(b[0] - x, b[1] - z) < Math.hypot(a[0] - x, a[1] - z) ? b : a,
  )[2];

export const createProgress = ({ lvl, you, fx, hud, audio }: Deps): Progress => {
  let phase = -1;
  /** Host tick the own player died at, as the first snapshot saw it. */
  let died = 0;
  let hp = new Map<number, number>();
  const p: { -readonly [K in keyof Progress]: Progress[K] } = {
    items: [],
    dead: false,
    hp: 0,
    name: lvl.map.name ?? '',
    returning: false,
    alive: id => hp.get(id) !== 0,

    snapshot(s) {
      const id = you();
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
          audio?.play(SOUND.COLLECT);
        }
      }
      p.items = s.items;
      if (s.phase != phase) {
        phase = s.phase;
        p.returning = phase == PHASE.RETURN;
        hud.say(SAY.NOTE, phase == PHASE.RETURN ? 'Back to the start!' : 'Find the exit');
      }
      if (me?.hp === 0 && !p.dead) {
        died = s.tick;
      }
      p.dead = me?.hp === 0;
      p.hp = me?.hp ?? 0;
      hud.hp(p.hp);
      hud.keys(s.keys);
      // The tick is a u16. The respawn comes PLAYER_RESPAWN ticks after the death.
      const left = PLAYER_RESPAWN - ((s.tick - died) & 0xffff);
      hud.dead(p.dead ? Math.max(1, Math.ceil(left / TICK_HZ)) : 0);
    },
  };
  return p;
};
