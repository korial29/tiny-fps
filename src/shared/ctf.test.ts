import { describe, expect, it } from 'vitest';
import { duo } from '../../test/teams';
import {
  END_SCREEN,
  FLAG_H,
  FLAG_LOCK,
  FLAG_REACH,
  FLAG_RETURN,
  PLAYER_H,
  RULES,
  TICK_HZ,
} from './constants';
import { Ctf, touches } from './ctf';
import type { Runner } from './ctf';
import { spawn } from './physics';
import { EV, FLAG, TEAM, TEX } from './types';
import type { PlayerState } from './types';
import { build } from './world';

/** A slab at y = 1 with a gap in it: a hole from x = 50 to 60 over which the floor is gone. */
const world = build({
  brushes: [
    { min: [-100, -5, -100], max: [50, 1, 100], top: TEX.TILE, side: TEX.BRICK },
    { min: [60, -5, -100], max: [100, 1, 100], top: TEX.TILE, side: TEX.BRICK },
  ],
  teams: [{ ...duo([[-20, 1, 0, 0]])[0] }, { ...duo([[20, 1, 0, 0]])[1] }],
  floor: -20,
  sun: { dir: [0, 1, 0], color: [1, 1, 1] },
  sky: [
    [0, 0, 1],
    [1, 1, 1],
  ],
});
const [RED, BLUE] = world.def.teams.map(t => t.base);

/** A match of three captures and an eight-minute clock, with the ids 0 and 1 red and 2 and 3 blue. */
const game = (over: Partial<typeof RULES> = {}) => {
  const ctf = new Ctf(world, { ...RULES, ...over });
  const players: Runner[] = [0, 1, 2, 3].map(id => {
    const state = spawn(id, world, 0);
    return { id, team: id < 2 ? TEAM.RED : TEAM.BLUE, state: { ...state, x: 0, z: 40 } };
  });
  players.forEach(p => ctf.join(p.id, p.team, p.state));
  const at = (id: number, x: number, z = 0, y = 1) => {
    Object.assign(players[id].state, { x, y, z, ground: y === 1 });
    return players[id].state;
  };
  const tick = (n = 1) => {
    let turn;
    for (let k = 0; k < n; k++) {
      turn = ctf.tick(players) ?? turn;
    }
    return turn;
  };
  return { ctf, players, at, tick };
};

describe('touches', () => {
  const p = (x: number, y: number, z: number): PlayerState => ({ ...spawn(0, world, 0), x, y, z });

  it('needs the body within FLAG_REACH of the foot of the flag, sideways', () => {
    expect(touches(p(0, 1, 0), [0, 1, 0])).toBe(true);
    expect(touches(p(FLAG_REACH - 0.01, 1, 0), [0, 1, 0])).toBe(true);
    expect(touches(p(FLAG_REACH + 0.01, 1, 0), [0, 1, 0])).toBe(false);
    expect(touches(p(1.1, 1, 1.1), [0, 1, 0])).toBe(false);
  });

  it('needs the body to overlap the height of the pole: not over it, not under it', () => {
    expect(touches(p(0, 1 + FLAG_H - 0.01, 0), [0, 1, 0])).toBe(true);
    expect(touches(p(0, 1 + FLAG_H + 0.01, 0), [0, 1, 0])).toBe(false);
    expect(touches(p(0, 1 - PLAYER_H + 0.01, 0), [0, 1, 0])).toBe(true);
    expect(touches(p(0, 1 - PLAYER_H - 0.01, 0), [0, 1, 0])).toBe(false);
  });
});

describe('taking a flag', () => {
  it('goes to the enemy that touches it at its base, and to nobody else', () => {
    const { ctf, at, tick } = game();
    tick();
    expect(ctf.flags.map(f => f.state)).toEqual([FLAG.HOME, FLAG.HOME]);
    // A red player at his own flag takes nothing.
    at(0, RED[0], RED[2]);
    tick();
    expect(ctf.flags.map(f => f.state)).toEqual([FLAG.HOME, FLAG.HOME]);
    // At the blue flag he takes it: carried by him.
    at(0, BLUE[0], BLUE[2]);
    tick();
    expect(ctf.flags[TEAM.BLUE]).toMatchObject({ state: FLAG.CARRIED, by: 0 });
    expect(ctf.flags[TEAM.RED].state).toBe(FLAG.HOME);
    expect(ctf.carrying(0)).toBe(TEAM.BLUE);
    expect(ctf.carrying(1)).toBe(-1);
  });

  it('is taken by the first of two enemies on it, and he keeps it while the other stands there', () => {
    const { ctf, at, tick } = game();
    at(2, RED[0], RED[2]);
    at(3, RED[0], RED[2]);
    tick(5);
    expect(ctf.flags[TEAM.RED]).toMatchObject({ state: FLAG.CARRIED, by: 2 });
  });

  it('is not taken by a player who jumps over it or stands far under it', () => {
    const { ctf, at, tick } = game();
    at(0, BLUE[0], BLUE[2], 1 + FLAG_H + 1);
    tick();
    expect(ctf.flags[TEAM.BLUE].state).toBe(FLAG.HOME);
  });
});

describe('returning and dropping', () => {
  /** Red player 0 carries the blue flag and drops it at (x, 0) by a tackle, standing. */
  const dropped = (x = 5) => {
    const g = game();
    g.at(0, BLUE[0], BLUE[2]);
    g.tick();
    const p = g.at(0, x, 0);
    g.ctf.moved(p);
    expect(g.ctf.drop(p)).toBe(true);
    return g;
  };

  it('drops under the carrier, where he stands, and counts the seconds to go home', () => {
    const { ctf } = dropped(5);
    expect(ctf.flags[TEAM.BLUE]).toEqual({
      state: FLAG.DROPPED,
      by: 0,
      x: 5,
      y: 1,
      z: 0,
      left: FLAG_RETURN,
    });
    expect(ctf.carrying(0)).toBe(-1);
  });

  it('is returned at once by a teammate of its team, who is credited with it', () => {
    const { ctf, at, tick } = dropped();
    at(2, 5, 0);
    tick();
    expect(ctf.flags[TEAM.BLUE].state).toBe(FLAG.HOME);
    expect(ctf.tally().find(t => t.id === 2)).toMatchObject({ returns: 1, caps: 0 });
  });

  it('is taken again by an enemy of its team, where it lies', () => {
    const { ctf, at, tick } = dropped();
    at(1, 5, 0);
    tick();
    expect(ctf.flags[TEAM.BLUE]).toMatchObject({ state: FLAG.CARRIED, by: 1 });
    expect(ctf.tally().every(t => t.returns === 0)).toBe(true);
  });

  it('is not taken back at once by the carrier who was made to drop it, but is after FLAG_LOCK seconds', () => {
    const { ctf, tick } = dropped();
    tick(FLAG_LOCK * TICK_HZ - 1);
    expect(ctf.flags[TEAM.BLUE].state).toBe(FLAG.DROPPED);
    tick(1);
    expect(ctf.flags[TEAM.BLUE]).toMatchObject({ state: FLAG.CARRIED, by: 0 });
  });

  it('goes to a defender before an attacker when both touch it in the same tick', () => {
    const { ctf, at, tick } = dropped();
    at(1, 5, 0);
    at(3, 5, 0);
    tick();
    expect(ctf.flags[TEAM.BLUE].state).toBe(FLAG.HOME);
  });

  it('goes home by itself after FLAG_RETURN seconds, counting down in whole seconds', () => {
    const { ctf, at, tick } = dropped();
    at(0, 0, 40);
    tick(1);
    expect(ctf.flags[TEAM.BLUE].left).toBe(FLAG_RETURN);
    tick(TICK_HZ - 1);
    expect(ctf.flags[TEAM.BLUE].left).toBe(FLAG_RETURN - 1);
    tick((FLAG_RETURN - 1) * TICK_HZ - 1);
    expect(ctf.flags[TEAM.BLUE]).toMatchObject({ state: FLAG.DROPPED, left: 1 });
    tick(1);
    expect(ctf.flags[TEAM.BLUE]).toEqual({ state: FLAG.HOME, by: 0, x: 0, y: 0, z: 0, left: 0 });
  });

  it('drops where the carrier last stood when he falls off the map', () => {
    const g = game();
    g.at(0, BLUE[0], BLUE[2]);
    g.tick();
    // He runs along a floor, then leaves it at x = 49 and falls into the hole.
    for (const x of [30, 40, 49]) {
      g.ctf.moved(g.at(0, x, 7));
    }
    const p = g.at(0, 55, 7, -5);
    p.ground = false;
    g.ctf.moved(p);
    expect(g.ctf.flags[TEAM.BLUE].state).toBe(FLAG.CARRIED);
    // Under the kill floor move() puts him back at a spawn and says so.
    Object.assign(p, spawn(0, world, 0), { ev: EV.RESPAWN });
    g.ctf.moved(p);
    expect(g.ctf.flags[TEAM.BLUE]).toMatchObject({ state: FLAG.DROPPED, x: 49, y: 1, z: 7 });
  });

  it('does nothing when a player without a flag respawns, and holds the spawn as his last ground', () => {
    const g = game();
    const p = g.at(0, 55, 7, -5);
    Object.assign(p, spawn(0, world, 0), { ev: EV.RESPAWN });
    g.ctf.moved(p);
    expect(g.ctf.flags.map(f => f.state)).toEqual([FLAG.HOME, FLAG.HOME]);
    // Taking the flag, then leaving at once: it falls at the spawn, the last ground he had.
    g.at(0, BLUE[0], BLUE[2]);
    g.tick();
    g.ctf.leave(0);
    expect(g.ctf.flags[TEAM.BLUE]).toMatchObject({ state: FLAG.DROPPED, x: -20, z: 0 });
  });

  it('drops where the carrier last stood when he leaves, and a leaver without a flag changes nothing', () => {
    const g = game();
    g.ctf.leave(1);
    expect(g.ctf.flags.map(f => f.state)).toEqual([FLAG.HOME, FLAG.HOME]);
    g.at(0, BLUE[0], BLUE[2]);
    g.tick();
    g.ctf.moved(g.at(0, 12, 3));
    g.ctf.leave(0);
    expect(g.ctf.flags[TEAM.BLUE]).toMatchObject({ state: FLAG.DROPPED, x: 12, y: 1, z: 3 });
    expect(g.ctf.tally().map(t => t.id)).toEqual([2, 3]);
  });

  describe('drop(), the hook of the tackle', () => {
    it('is false for a player who carries nothing, or while the match is over', () => {
      const g = game({ scoreLimit: 1 });
      expect(g.ctf.drop(g.players[0].state)).toBe(false);
      g.at(0, BLUE[0], BLUE[2]);
      g.tick();
      g.at(0, RED[0], RED[2]);
      expect(g.tick()).toBe('end');
      expect(g.ctf.drop(g.players[0].state)).toBe(false);
    });

    it('puts the flag on the first floor below a carrier in the air', () => {
      const g = game();
      g.at(0, BLUE[0], BLUE[2]);
      g.tick();
      const p = g.at(0, 30, 5, 4);
      p.ground = false;
      expect(g.ctf.drop(p)).toBe(true);
      expect(g.ctf.flags[TEAM.BLUE]).toMatchObject({ state: FLAG.DROPPED, x: 30, y: 1, z: 5 });
    });

    it('puts it at his last ground when there is no floor under him, over the hole', () => {
      const g = game();
      g.at(0, BLUE[0], BLUE[2]);
      g.tick();
      g.ctf.moved(g.at(0, 49, 2));
      const p = g.at(0, 55, 2, 3);
      p.ground = false;
      g.ctf.moved(p);
      expect(g.ctf.drop(p)).toBe(true);
      expect(g.ctf.flags[TEAM.BLUE]).toMatchObject({ state: FLAG.DROPPED, x: 49, y: 1, z: 2 });
    });
  });
});

describe('capturing', () => {
  it('scores for the team of a carrier who reaches his own base while his own flag is home', () => {
    const { ctf, at, tick } = game();
    at(0, BLUE[0], BLUE[2]);
    tick();
    at(0, RED[0], RED[2]);
    tick();
    expect(ctf.score).toEqual([1, 0]);
    expect(ctf.flags.map(f => f.state)).toEqual([FLAG.HOME, FLAG.HOME]);
    expect(ctf.carrying(0)).toBe(-1);
    expect(ctf.tally().find(t => t.id === 0)).toMatchObject({ caps: 1 });
  });

  it('scores nothing while his own flag is away, and scores when it is back', () => {
    const { ctf, players, at, tick } = game();
    at(0, BLUE[0], BLUE[2]);
    at(2, RED[0], RED[2]);
    tick();
    expect(ctf.flags.map(f => f.state)).toEqual([FLAG.CARRIED, FLAG.CARRIED]);
    at(0, RED[0], RED[2]);
    at(2, 0, 40);
    tick(30);
    expect(ctf.score).toEqual([0, 0]);
    expect(ctf.carrying(0)).toBe(TEAM.BLUE);
    // The blue carrier is tackled and drops the red flag where he stands; a red teammate sends it
    // home, and that same tick the carrier at the red base scores.
    ctf.drop(players[2].state);
    expect(ctf.flags[TEAM.RED].state).toBe(FLAG.DROPPED);
    at(1, 0, 40);
    tick();
    expect(ctf.flags[TEAM.RED].state).toBe(FLAG.HOME);
    expect(ctf.score).toEqual([1, 0]);
  });

  it('scores for blue as well, and keeps each side apart', () => {
    const { ctf, at, tick } = game();
    at(2, RED[0], RED[2]);
    tick();
    at(2, BLUE[0], BLUE[2]);
    tick();
    expect(ctf.score).toEqual([0, 1]);
  });

  it('does not score at the enemy base, nor with no flag', () => {
    const { ctf, at, tick } = game();
    at(0, RED[0], RED[2]);
    tick();
    at(1, BLUE[0], BLUE[2]);
    tick();
    // Player 1 took the blue flag and is at the blue base: not a capture.
    expect(ctf.score).toEqual([0, 0]);
  });
});

describe('the match', () => {
  /** One capture by red player 0. */
  const capture = (g: ReturnType<typeof game>) => {
    g.at(0, BLUE[0], BLUE[2]);
    g.tick();
    g.at(0, RED[0], RED[2]);
    return g.tick();
  };

  it('has a clock that runs down in whole seconds, and the defaults of RULES', () => {
    expect(RULES).toMatchObject({ scoreLimit: 3, timeLimit: 480 });
    const { ctf, tick } = game();
    expect(ctf.wire().clock).toBe(480);
    tick(1);
    expect(ctf.wire().clock).toBe(480);
    tick(TICK_HZ);
    expect(ctf.wire().clock).toBe(479);
  });

  it('ends at the score limit by the capture that reaches it, with the winner', () => {
    const g = game({ scoreLimit: 2 });
    expect(capture(g)).toBeUndefined();
    expect(g.ctf.over).toBe(false);
    expect(capture(g)).toBe('end');
    expect(g.ctf.over).toBe(true);
    expect(g.ctf.winner()).toBe(TEAM.RED);
    expect(g.ctf.wire()).toMatchObject({ score: [2, 0], over: true, clock: END_SCREEN });
  });

  it('ends at the time limit for the team with more captures', () => {
    const g = game({ timeLimit: 3 });
    capture(g);
    expect(g.tick(3 * TICK_HZ - 3)).toBeUndefined();
    expect(g.tick()).toBe('end');
    expect(g.ctf.winner()).toBe(TEAM.RED);
    const b = game({ timeLimit: 3 });
    b.at(2, RED[0], RED[2]);
    b.tick();
    b.at(2, BLUE[0], BLUE[2]);
    b.tick();
    expect(b.tick(3 * TICK_HZ)).toBe('end');
    expect(b.ctf.winner()).toBe(TEAM.BLUE);
  });

  it('ends as a draw when the time is up and the score is level', () => {
    const g = game({ timeLimit: 2 });
    expect(g.tick(2 * TICK_HZ)).toBe('end');
    expect(g.ctf.winner()).toBe(-1);
    expect(g.ctf.score).toEqual([0, 0]);
  });

  it('freezes the flags and the score over the end screen, then starts again from scratch', () => {
    const g = game({ scoreLimit: 1 });
    g.at(1, RED[0], RED[2]);
    g.tick();
    capture(g);
    expect(g.ctf.over).toBe(true);
    const tally = g.ctf.tally();
    expect(tally.find(t => t.id === 0)).toMatchObject({ caps: 1 });
    // Nothing is taken while the end screen shows.
    g.at(0, BLUE[0], BLUE[2]);
    g.at(2, RED[0], RED[2]);
    expect(g.tick(END_SCREEN * TICK_HZ - 1)).toBeUndefined();
    expect(g.ctf.wire()).toMatchObject({ over: true, score: [1, 0], clock: 1 });
    expect(g.tick()).toBe('start');
    expect(g.ctf.wire()).toMatchObject({ over: false, score: [0, 0], clock: RULES.timeLimit });
    expect(g.ctf.flags.map(f => f.state)).toEqual([FLAG.HOME, FLAG.HOME]);
    expect(g.ctf.tally().every(t => t.caps === 0 && t.returns === 0)).toBe(true);
  });

  it('resets by itself when asked: the room is empty', () => {
    const g = game();
    capture(g);
    g.ctf.reset();
    expect(g.ctf.wire()).toMatchObject({ score: [0, 0], over: false, clock: RULES.timeLimit });
  });
});
