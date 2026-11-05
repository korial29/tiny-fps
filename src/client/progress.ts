// Where the game stands, read from the snapshots: the own health and who is alive. It drives the
// HUD and the effects. No DOM of its own, unit-tested.
import { PLAYER_RESPAWN, TICK_HZ } from '../shared/constants';
import type { Level, MapDef, Snapshot } from '../shared/types';
import type { Effects } from './effects';
import type { Hud } from './hud';

export interface Progress {
  /** The own player has no health left. */
  readonly dead: boolean;
  /** The own health: 0 when dead or unknown. */
  readonly hp: number;
  /** The map's name, for the title screen. */
  readonly name: string;
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
}

/** The yaw of the spawn nearest (x, z): where a player put back at the start should look. */
export const facing = ({ spawns }: MapDef, x: number, z: number): number =>
  spawns.reduce((a, b) =>
    Math.hypot(b[0] - x, b[1] - z) < Math.hypot(a[0] - x, a[1] - z) ? b : a,
  )[2];

export const createProgress = ({ lvl, you, fx, hud }: Deps): Progress => {
  /** Host tick the own player died at, as the first snapshot saw it. */
  let died = 0;
  let hp = new Map<number, number>();
  const p: { -readonly [K in keyof Progress]: Progress[K] } = {
    dead: false,
    hp: 0,
    name: lvl.map.name ?? '',
    alive: id => hp.get(id) !== 0,

    snapshot(s) {
      const id = you();
      const me = s.players.find(q => q.id == id);
      const was = hp.get(id);
      if (me && was !== undefined && me.hp < was) {
        fx.hit();
      }
      hp = new Map(s.players.map(q => [q.id, q.hp]));
      if (me?.hp === 0 && !p.dead) {
        died = s.tick;
      }
      p.dead = me?.hp === 0;
      p.hp = me?.hp ?? 0;
      hud.hp(p.hp);
      // The tick is a u16. The respawn comes PLAYER_RESPAWN ticks after the death.
      const left = PLAYER_RESPAWN - ((s.tick - died) & 0xffff);
      hud.dead(p.dead ? Math.max(1, Math.ceil(left / TICK_HZ)) : 0);
    },
  };
  return p;
};
