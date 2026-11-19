// The bots' bench (docs/BOTS.md): bot-only matches, headless, with the numbers a change of the bots
// is judged on. Skipped unless BOTMATCH gives the number of matches: `npm run botmatch`.
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeSnapshot } from './protocol';
import { Room } from './room';
import { FLAG } from './types';
import type { Conn, PlayerState } from './types';

const MATCHES = Number(process.env.BOTMATCH ?? 0);
const MAP = process.env.BOTMATCH_MAP ?? 'highline';
/** Minutes a match is played, at most: a match that ends sooner starts again. */
const MINUTES = Number(process.env.BOTMATCH_MINUTES ?? 16);
/** Ticks without a metre of way that make a block. */
const BLOCK = 300;

interface Tally {
  captures: number;
  taken: number;
  deaths: number;
  falls: number;
  blocks: number;
  stopped: number;
  turns: number;
}

/**
 * One match of 8 bots, 4 a side, at a skill drawn from the match's number: a person joins red so
 * the bots come, and lies down for the whole match (a lying player touches no flag, nobody shoots him).
 */
const play = (n: number): Tally => {
  const room = new Room({ bots: 9, map: MAP, botSkill: n % 8 });
  let last: ArrayBuffer | undefined;
  const c: Conn = { send: d => typeof d !== 'string' && (last = d) };
  room.connect(c);
  room.receive(c, JSON.stringify({ t: 'join', name: 'bench' }));
  const players = () => [
    ...(
      room as unknown as { peers: Map<Conn, { bot?: unknown; state: PlayerState }> }
    ).peers.values(),
  ];
  const me = players().find(p => !p.bot)!;
  // Matches of the same code differ only by where they start: a few seconds of bots alone first.
  const t: Tally = { captures: 0, taken: 0, deaths: 0, falls: 0, blocks: 0, stopped: 0, turns: 0 };
  const seen = new Map<
    PlayerState,
    { x: number; z: number; px: number; pz: number; since: number; yaw: number; down: number }
  >();
  let flags: number[] = [FLAG.HOME, FLAG.HOME];
  let score = 0;
  for (let k = 0; k < 60 * 60 * MINUTES + n * 37; k++) {
    me.state.down = 999;
    room.tick();
    if (k < n * 37) {
      continue;
    }
    for (const p of players()) {
      const s = p.state;
      if (!p.bot) {
        continue;
      }
      const o = seen.get(s) ?? {
        x: s.x,
        z: s.z,
        px: s.x,
        pz: s.z,
        since: k,
        yaw: s.yaw,
        down: s.down,
      };
      if (s.down && !o.down) {
        t.deaths++;
      }
      // Put back at a spawn up: a fall under the kill floor (a respawn after going down is no fall).
      if (!s.down && !o.down && Math.hypot(s.x - o.px, s.z - o.pz) > 20) {
        t.falls++;
      }
      const d = Math.hypot(s.x - o.x, s.z - o.z);
      if (s.down || d > 1) {
        Object.assign(o, { x: s.x, z: s.z, since: k });
      } else if (k - o.since === BLOCK) {
        t.blocks++;
      }
      if (!s.down && Math.hypot(s.vx, s.vz) < 0.5) {
        t.stopped++;
      }
      const turn = Math.abs(((s.yaw - o.yaw + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
      if (turn > 1) {
        t.turns++;
      }
      [o.yaw, o.down, o.px, o.pz] = [s.yaw, s.down, s.x, s.z];
      seen.set(s, o);
    }
    if (last && k % 2 === 0) {
      const snap = decodeSnapshot(last)!;
      const now = snap.flags.map(f => f.state);
      t.taken += now.filter((f, i) => f === FLAG.CARRIED && flags[i] !== FLAG.CARRIED).length;
      const sum = snap.score[0] + snap.score[1];
      t.captures += sum > score ? sum - score : 0;
      [flags, score] = [now, sum];
    }
  }
  t.stopped = Math.round(t.stopped / 60);
  return t;
};

describe.skipIf(!MATCHES)('bot matches', () => {
  it(`plays ${MATCHES} matches on ${MAP}`, () => {
    const all = Array.from({ length: MATCHES }, (_, n) => play(n));
    const sum = (k: keyof Tally) => all.reduce((a, t) => a + t[k], 0) / all.length;
    const mean = Object.fromEntries(
      (Object.keys(all[0]) as (keyof Tally)[]).map(k => [k, +sum(k).toFixed(2)]),
    );
    writeFileSync(
      process.env.BOTMATCH_OUT ?? 'node_modules/.cache/botmatch.json',
      JSON.stringify({ map: MAP, mean, all }),
    );
    expect(all).toHaveLength(MATCHES);
  }, 3_600_000);
});
