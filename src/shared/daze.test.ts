import { describe, expect, it } from 'vitest';
import { DAZE_SPEED, DAZE_TICKS, SPRINT_SPEED } from './constants';
import { ROOFTOPS } from './map';
import { move, spawn } from './physics';
import { KEY } from './types';
import { build } from './world';

describe('daze', () => {
  it('slows a dazed runner to DAZE_SPEED, then gives his speed back step by step', () => {
    const w = build(ROOFTOPS);
    const p = spawn(0, w, 0);
    const input = (seq: number) => ({ seq, keys: KEY.FORWARD | KEY.SPRINT, yaw: p.yaw, pitch: 0 });
    let seq = 0;
    for (; seq < 90; seq++) {
      move(p, input(seq), w);
    }
    expect(Math.hypot(p.vx, p.vz)).toBeGreaterThan(DAZE_SPEED);
    p.daze = DAZE_TICKS;
    const speeds: number[] = [];
    for (let i = 0; i < DAZE_TICKS + 30; i++, seq++) {
      move(p, input(seq), w);
      speeds.push(Math.hypot(p.vx, p.vz));
    }
    expect(speeds[0]).toBeLessThanOrEqual(
      DAZE_SPEED + (SPRINT_SPEED - DAZE_SPEED) / DAZE_TICKS + 1e-6,
    );
    expect(speeds[DAZE_TICKS / 2]).toBeGreaterThan(speeds[0]);
    expect(p.daze).toBe(0);
  });
});
