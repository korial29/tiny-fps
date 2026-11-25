// Bring your own transport: drive a Room from any server (Socket.io, a worker…), without `ws`.
// Each peer is a Conn: pass it to connect(), its frames to receive() (text as a string, binary as
// an ArrayBuffer of exactly its bytes) and call disconnect() when it goes. start() runs the
// room's clock, stop() ends it.
export { Room } from '../shared/room';
export { RULES } from '../shared/constants';
export { MAPS } from '../shared/maps';
export type { Conn, Rules } from '../shared/types';
