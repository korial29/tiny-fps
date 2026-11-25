import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ServerText } from '../shared/protocol';
import { MAPS, RULES, Room } from './index';
import type { Conn } from './index';

describe('room entry', () => {
  it('drives a Room over any transport, the map locked by the embedding page', () => {
    const texts: ServerText[] = [];
    const conn: Conn = { send: d => typeof d === 'string' && texts.push(JSON.parse(d)) };
    const room = new Room({ ...RULES, map: 'landfall', lockMap: true });
    room.connect(conn);
    room.receive(conn, JSON.stringify({ t: 'join', name: 'Ann' }));
    room.receive(conn, JSON.stringify({ t: 'map', map: 'highline' }));
    const rosters = texts.filter(m => m.t === 'roster');
    expect(rosters).toHaveLength(1);
    expect(rosters[0]).toMatchObject({ map: 'landfall', players: [{ name: 'Ann' }] });
    expect(Object.keys(MAPS)).toContain('landfall');
    room.disconnect(conn);
  });

  it('does not import ws or Node APIs', () => {
    const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/from '(ws|node:)/);
  });
});
