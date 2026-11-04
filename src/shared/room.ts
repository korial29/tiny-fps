import type { Conn, Every, Rules } from './types';

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
  public constructor(_rules: Partial<Rules> = {}) {}

  public connect(_conn: Conn): void {
    throw new Error('todo');
  }

  public receive(_conn: Conn, _data: string | ArrayBuffer): void {
    throw new Error('todo');
  }

  public disconnect(_conn: Conn): void {
    throw new Error('todo');
  }

  /** One host tick. Public so tests can drive the room without a timer. */
  public tick(): void {
    throw new Error('todo');
  }

  public start(_every?: Every): void {
    throw new Error('todo');
  }

  public stop(): void {
    throw new Error('todo');
  }
}
