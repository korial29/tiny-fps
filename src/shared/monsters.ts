// The horde: the map's monsters and their bullets, stepped once per host tick. Host only, no DOM,
// no Node API; all randomness comes from the generator it is given, so a seed replays a game.
import {
  ALERT_R,
  BULLET_LIFE,
  BULLET_R,
  BULLET_SPEED,
  EYE,
  FLYER_H,
  FLYER_HOVER,
  FLYER_SPEED,
  HARD_RATE,
  HARD_SPEED,
  MAX_MONSTERS,
  MAX_PLAYERS,
  MELEE_EVERY,
  MELEE_R,
  PLAYER_H,
  PLAYER_R,
  SHOOT_EVERY,
  SIGHT_COS,
  SIGHT_EVERY,
  SIGHT_RANGE,
  STEP_H,
  TICK_HZ,
  WALKER_SPEED,
} from './constants';
import { blocked, sectorAt } from './level';
import { TAU, fly, forward, norm, walk } from './physics';
import { hit, monsterBody, trace } from './shoot';
import { EVENT, MONSTER } from './types';
import type { Bullet, GameEvent, Level, Monster, PlayerState } from './types';

const DT = 1 / TICK_HZ;
/** Radians a monster turns per tick toward its target. */
const TURN = 0.05;
/** A patrolling monster moves at this share of its speed. */
const PATROL = 0.4;
/** A chasing monster stops this close (metres): inside MELEE_R, short of standing in the player. */
const STOP = 1;
/** Ticks between the start of a swing and its blow. */
const SWING_DELAY = 15;
/** Height of a player's chest above the feet: where monsters aim. */
const CHEST = 1.2;
/** The snapshot counts bullets with a u8. */
const MAX_BULLETS = 255;

/** Mulberry32: a small seeded generator, uniform in [0, 1). */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

interface Mob extends Monster {
  /** Vertical speed: a walker falls like a player. */
  vy: number;
  ground: boolean;
  /** Player being hunted, -1 while patrolling. */
  target: number;
  /** Ticks to the next random turn of the patrol. */
  turn: number;
  /** Ticks before the next swing, and to the blow of the swing under way (0: none). */
  melee: number;
  swing: number;
  /** Ticks before the next bullet. */
  shoot: number;
}

interface Shell extends Bullet {
  vx: number;
  vy: number;
  vz: number;
  life: number;
}

export interface Horde {
  /** The living monsters, copied. */
  monsters(): Monster[];
  /** The bullets in flight, copied. */
  bullets(): Bullet[];
  /** What happened since the owner last emptied it: the owner takes events off the front. */
  events: GameEvent[];
  /** One host tick, with the players' states. */
  step(players: PlayerState[]): void;
  /**
   * A player's shot killed monster `id`: it dies at once, and the monsters that see it hunt `by`.
   * Returns the monster, undefined when `id` is not alive.
   */
  kill(id: number, by: number): Monster | undefined;
}

/**
 * The monsters of the level's map, from the first spawn. In hard mode they move HARD_SPEED faster
 * and swing and shoot HARD_RATE as often.
 */
export const createHorde = (lvl: Level, rand: () => number, hard = false): Horde => {
  const def = (lvl.map.monsters ?? []).slice(0, MAX_MONSTERS);
  const [fast, rate] = hard ? [HARD_SPEED, HARD_RATE] : [1, 1];
  const [walkerSpeed, flyerSpeed] = [WALKER_SPEED * fast, FLYER_SPEED * fast];
  const [shootEvery, meleeEvery] = [SHOOT_EVERY, MELEE_EVERY].map(n => Math.round(n * rate));
  let shells: Shell[] = [];
  const events: GameEvent[] = [];
  let tick = 0;
  let nextBullet = 0;
  const mobs: Mob[] = def.map(([x, z, yaw, kind], i) => {
    const { floor, ceil } = lvl.map.sectors[Math.max(sectorAt(lvl, x, z), 0)];
    const flyer = kind === MONSTER.FLYER;
    return {
      id: MAX_PLAYERS + i,
      kind,
      x: Math.fround(x),
      y: Math.fround(flyer ? Math.min(floor + FLYER_HOVER, ceil - FLYER_H) : floor),
      z: Math.fround(z),
      yaw: norm(yaw),
      chase: false,
      vy: 0,
      ground: true,
      target: -1,
      turn: Math.floor(rand() * 240),
      melee: 0,
      swing: 0,
      shoot: Math.floor(rand() * shootEvery),
    };
  });

  const mid = (m: Mob): number => m.y + monsterBody(m).h / 2;
  const eye = (m: Mob): [number, number, number] => [
    m.x,
    m.kind === MONSTER.WALKER ? m.y + EYE : mid(m),
    m.z,
  ];
  const eyeOf = (p: PlayerState): [number, number, number] => [p.x, p.y + EYE, p.z];
  const hunt = (m: Mob, id: number): void => {
    m.target = id;
    m.chase = id >= 0;
  };

  /** The monsters within ALERT_R of `src` that it can see, and that are not hunting, hunt `who`. */
  const alert = (src: Mob, who: number): void => {
    for (const m of mobs) {
      if (
        m !== src &&
        !m.chase &&
        Math.hypot(m.x - src.x, m.z - src.z) < ALERT_R &&
        !blocked(lvl, eye(src), eye(m))
      ) {
        hunt(m, who);
      }
    }
  };

  /** The nearest player in range, inside the sight cone and not hidden becomes the target. */
  const look = (m: Mob, players: PlayerState[]): void => {
    const [fx, fz] = forward(m.yaw);
    let seen: PlayerState | undefined;
    let near = Infinity;
    for (const p of players) {
      const [dx, dz] = [p.x - m.x, p.z - m.z];
      const d = Math.hypot(dx, dz);
      if (
        d <= SIGHT_RANGE &&
        d < near &&
        dx * fx + dz * fz >= SIGHT_COS * d &&
        !blocked(lvl, eye(m), eyeOf(p))
      ) {
        [seen, near] = [p, d];
      }
    }
    if (seen) {
      const spotted = !m.chase;
      hunt(m, seen.id);
      if (spotted) {
        alert(m, seen.id);
      }
    }
  };

  const turnTo = (m: Mob, yaw: number): void => {
    const arc = ((((yaw - m.yaw + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
    m.yaw = norm(m.yaw + Math.max(-TURN, Math.min(TURN, arc)));
  };

  /** Whether the floor under the axis is more than a step below `y`. */
  const ledge = (m: Mob, y: number): boolean =>
    lvl.map.sectors[Math.max(sectorAt(lvl, m.x, m.z), 0)].floor < y - STEP_H;

  const patrol = (m: Mob): void => {
    const s = (m.kind === MONSTER.WALKER ? walkerSpeed : flyerSpeed) * PATROL * DT;
    const [fx, fz] = forward(m.yaw);
    const before = { x: m.x, y: m.y, z: m.z, vy: m.vy, ground: m.ground };
    if (m.kind === MONSTER.WALKER) {
      walk(m, fx * s, fz * s, false, lvl);
    } else {
      // A flyer sinks back to its hover height after a chase.
      fly(m, fx * s, -s, fz * s, lvl);
    }
    // A wall in the way, or a drop (a ledge or the pit, deeper than a step): back, and turn.
    const drop = m.kind === MONSTER.WALKER && ledge(m, before.y);
    if (drop || Math.hypot(m.x - before.x, m.z - before.z) < s / 2) {
      if (drop) {
        Object.assign(m, before);
      }
      m.yaw = norm(m.yaw + rand() * TAU);
    } else if (--m.turn <= 0) {
      m.turn = 120 + Math.floor(rand() * 240);
      m.yaw = norm(m.yaw + (rand() - 0.5) * Math.PI);
    }
  };

  /** A walker that sees the player fires a bullet from its eye at the chest, and waits. */
  const shootAt = (m: Mob, p: PlayerState): void => {
    const [ox, oy, oz] = eye(m);
    if (shells.length >= MAX_BULLETS || blocked(lvl, [ox, oy, oz], eyeOf(p))) {
      m.shoot = 0;
      return;
    }
    const v: [number, number, number] = [p.x - ox, p.y + CHEST - oy, p.z - oz];
    const k = (BULLET_SPEED * DT) / Math.hypot(...v);
    shells.push({
      id: nextBullet++ & 0xff,
      x: ox,
      y: oy,
      z: oz,
      vx: v[0] * k,
      vy: v[1] * k,
      vz: v[2] * k,
      life: BULLET_LIFE,
    });
    m.shoot = shootEvery + Math.floor((rand() - 0.5) * 20);
  };

  const chase = (m: Mob, p: PlayerState): void => {
    const [dx, dz] = [p.x - m.x, p.z - m.z];
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      turnTo(m, Math.atan2(-dx, -dz));
    }
    if (m.kind === MONSTER.WALKER) {
      const [fx, fz] = forward(m.yaw);
      const s = d > STOP ? walkerSpeed * DT : 0;
      walk(m, fx * s, fz * s, false, lvl);
    } else {
      // Straight at the chest, at FLYER_SPEED in 3D, the body's middle on it.
      const dy = p.y + CHEST - FLYER_H / 2 - m.y;
      const k = Math.min(1, (flyerSpeed * DT) / (Math.hypot(d, dy) || 1));
      fly(m, d > STOP ? dx * k : 0, dy * k, d > STOP ? dz * k : 0, lvl);
    }

    // Melee: the swing is seen at once, the blow lands SWING_DELAY later if the target is still
    // within reach, in front.
    const near =
      Math.hypot(p.x - m.x, p.z - m.z) <= MELEE_R &&
      m.y < p.y + PLAYER_H &&
      p.y < m.y + monsterBody(m).h;
    m.melee = Math.max(0, m.melee - 1);
    if (m.swing && !--m.swing && near) {
      const [fx, fz] = forward(m.yaw);
      if ((p.x - m.x) * fx + (p.z - m.z) * fz > 0) {
        events.push({ type: EVENT.HURT, id: p.id, x: p.x, y: p.y + CHEST, z: p.z });
      }
    }
    if (near && !m.melee) {
      events.push({ type: EVENT.SWING, id: m.id, x: m.x, y: mid(m), z: m.z });
      [m.melee, m.swing] = [meleeEvery, SWING_DELAY];
    }

    if (m.kind === MONSTER.WALKER && m.shoot-- <= 0 && d <= SIGHT_RANGE) {
      shootAt(m, p);
    }
  };

  /** Moves a bullet one tick; false when it is spent: it hit a player or the level, or timed out. */
  const advance = (b: Shell, players: PlayerState[]): boolean => {
    const len = Math.hypot(b.vx, b.vy, b.vz);
    const o: [number, number, number] = [b.x, b.y, b.z];
    const dir: [number, number, number] = [b.vx / len, b.vy / len, b.vz / len];
    let t = trace(lvl, o, dir, len);
    let who = -1;
    for (const p of players) {
      // The player's cylinder grown by the bullet's radius.
      const u = hit(o, dir, {
        id: p.id,
        x: p.x,
        y: p.y - BULLET_R,
        z: p.z,
        r: PLAYER_R + BULLET_R,
        h: PLAYER_H + 2 * BULLET_R,
      });
      if (u < t) {
        [t, who] = [u, p.id];
      }
    }
    [b.x, b.y, b.z] = [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t];
    if (who >= 0) {
      events.push({ type: EVENT.HURT, id: who, x: b.x, y: b.y, z: b.z });
    } else if (t < len) {
      events.push({ type: EVENT.BOOM, id: b.id, x: b.x, y: b.y, z: b.z });
    }
    return who < 0 && t >= len && --b.life > 0;
  };

  return {
    monsters: () =>
      mobs.map(({ id, kind, x, y, z, yaw, chase }) => ({ id, kind, x, y, z, yaw, chase })),

    bullets: () => shells.map(({ id, x, y, z }) => ({ id, x, y, z })),

    events,

    step: players => {
      tick++;
      for (const m of mobs) {
        if ((tick + m.id) % SIGHT_EVERY === 0) {
          look(m, players);
        }
        const target = players.find(p => p.id === m.target);
        if (m.chase && !target) {
          hunt(m, -1);
        }
        if (target) {
          chase(m, target);
        } else {
          patrol(m);
        }
      }
      shells = shells.filter(b => advance(b, players));
    },

    kill: (id, by) => {
      const i = mobs.findIndex(m => m.id === id);
      if (i < 0) {
        return;
      }
      const [m] = mobs.splice(i, 1);
      events.push({ type: EVENT.DIE, id, x: m.x, y: mid(m), z: m.z });
      alert(m, by);
      return m;
    },
  };
};
