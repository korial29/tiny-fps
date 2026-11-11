// Wire format.
// Text frames carry rare JSON messages (join, map, roster, full, end).
// Binary frames carry the hot path: inputs (client → host) and snapshots (host → client).
//
// Input, 12 bytes: [type u8 = MSG_INPUT][seq u16][keys u16][yaw u16][pitch i16][view u16][frac u8]
//   yaw in 65536ths of a turn, decoded in [0, 2π); pitch in 1/10000 rad; view is the host tick
//   the others were drawn at, in 1/256 tick: integer part u16, then frac u8 (0 when absent).
//   keys is a u16: KEY bits 0 to 14 (forward, back, left, right, jump, sprint, dash, crouch, fire, blade, special, rail, reload, rifle, use).
// Snapshot: [type u8 = MSG_SNAPSHOT][tick u16][counts u8], counts: bits 0-4 the players, bits 5-7
//   the rovers (0 on a map without any). Then players × 62 bytes:
//   [id u8][x f32][y f32][z f32][vx f32][vy f32][vz f32][edge f32]
//   [yaw u16][pitch i16][ack u16][mode u8][t u8][dash u8][timers u8][stun u8]
//   [gun u24][shots u8][hits u8][swing u8][lost u8][charge u8][lock u8][foe u8][pushes u8][away u8]
//   [rail u8][railing u8][slow u8][mag u8][cap u8][reload u8][rifle u8][clip u8][heat u8][nade u8]
//   mode: bits 0-2 MODE, bits 3-5 wall (SIDE), bit 6 jumps left, bit 7 air dashes left
//   dash: bits 0-5 the dash timer, bits 6-7 the high bits of the tackler's id (see stun)
//   timers: bits 0-2 coyote ticks, bits 3-5 jump buffer ticks, bit 6 jump held, bit 7 dash held
//   stun: bits 0-5 the stumble ticks left after a tackle, bits 6-7 the low bits of the id of the
//   player who tackled (`by`, 4 bits in all: ids go to 15; 0 when the stumble is over)
//   The floats are the host's float32 state, exact (see move in physics.ts), and with the rest
//   they are all a move needs to continue from. ground comes from the mode; ev and fall (what the
//   animation reads) are not sent, they read 0.
//   gun, 24 bits, big-endian: bits 0-2 hp, bits 3-5 cool (ticks to the next shot), bits 6-12 ammo
//   (127: no gun), bits 13-19 down (ticks left lying, 0 when up), bit 20 rack (inside the circle of
//   the team's rack), bit 21 blade (has the katana), bit 22 wield (the katana is in hand), bit 23 zap
//   (the stumble is a katana's shock). shots and hits are the wrapping counters of the shots fired
//   and the hits landed (a plasma ball or a cut).
//   swing: bits 0-5 the ticks left in the katana's swing, bits 6-7 the low two bits of its cut (CUT).
//   lost: bits 0-2 the LIMB a katana's cut took off when it put him down (NONE once up), bit 3 the
//   high bit of the cut (a special), the rest 0. charge: the ticks FIRE has been held with the gun.
//   lock: the ticks left in a saber lock; foe: bits 0-3 the id locked with, bit 7 FIRE held at the
//   last step (`pressed`); pushes: the FIRE presses in the lock; away: the ticks a side or back key
//   has been held in it. rail: the rail gun's ticks of lightning plus one (0: no rail gun);
//   railing: bit 0 railed (it is in hand), bit 1 inRail (inside the circle of the rail rack), bit 2
//   zapping (its bolt went out), bit 3 rifled (the laser rifle in hand), bit 4 inRifle, bit 5 hot (overheated),
//   bit 6 USE held (the third bit of `held`: the timers byte is full); slow: the ticks left drained by the bolt. Bit 4 of lost: fried; bit
//   5: heavy (the katana's charged cut let go). charge is the katana's too, held at a cut's top.
//   mag: the shots in the gun's battery; cap: the ticks in the rail gun's capsule; reload: the ticks
//   left swapping the one in hand; rifle: the laser rifle's rounds plus one (0: none); clip: its cell;
//   heat: the rail gun's heat (HEAT_MAX at most). nade: bits 0-5 the ticks before the rifle's
//   launcher fires again (`lob`), bits 6-7 its grenades left (`nades`).
//   Then the rovers, rovers × 57 bytes, in the order of WorldDef.rovers then WorldDef.ships:
//     [x f32][y f32][z f32][vx f32][vy f32][vz f32][yaw f32][pitch f32][roll f32][wy f32][wp f32]
//     [wr f32][steer f32][driver u8][rider u8][kind u8][wreck u8][nades u8]
//     All thirteen are the host's float32, exact, the angles too: the driver's client replays its
//     inputs from them (drive in rover.ts). driver and rider are player ids, NOBODY (255) when empty.
//     kind: bit 7 a spaceship (ship.ts), bits 0-6 its armour; wreck: the ticks before a destroyed
//     ship is back, in fours, rounded up; nades: its missiles. All 0 for a rover.
//   Then the match, after the rovers: [red u8][blue u8][clock u16] the captures of each team, and
//   the whole seconds to the end of the match (bit 15: it is over, and the clock counts to the next
//   one), [packs u48: high u16, low u32] bit n set when pack n is there to take (Snapshot.packs); then the red and the blue flag, each [state u8 = FLAG] and by state:
//     HOME: nothing more (2 bytes in all for the two flags);
//     CARRIED: [by u8] the carrier's player id;
//     DROPPED: [x i16][y i16][z i16] in 1/16 m, [left u8] whole seconds before it goes home.
//   Then, only when there are any, the plasma balls and the katana's arcs: [count u8], count × 11 bytes:
//     [id u8][by u8][x i16][y i16][z i16][yaw u8][pitch i8][power u8]
//     id: the shooter's `shots` after the shot; by: bits 0-6 the shooter's id, bit 7 burst (it burst
//     where it is: the last snapshot that carries it); x, y, z in 1/32 m; the direction as a yaw in
//     256ths of a turn and a pitch in 127ths of a quarter turn; power: the health it takes, or for an
//     arc of energy bit 7 set and the CUT that threw it (Ball.arc) in bits 0-6, or for a grenade
//     (power NADE) bit 6 set and its speed in whole m/s in bits 0-5 (Ball.v).
//   Then, only on a map with doors: the balls' count is always written (0 with none), and after
//   the balls [doors u8], then a nibble a door, the first in the high half of its byte: how far it
//   is open in fifteenths (Snapshot.doors). 1 + doors / 2 bytes, and 1 more when no ball flies.
//   A snapshot is 4 + 62 × players + 57 × rovers + 10 + 2 to 16 bytes: 12 on top of the players and
//   the rovers when both flags are home and no ball flies; with balls, 1 + 11 × balls more.
// Every multi-byte field is big-endian (DataView's default).
import { NADE } from './constants';
import { FLAG, KEY, MODE } from './types';
import type { Ball, FlagState, Input, PlayerInfo, Rover, Snapshot } from './types';

/** join: the first frame of a peer, `body` the character he picked (BODY, the man without it). map: the host picks the map of the next match (MAPS key). body: a joined player changes character (BODY), at once. */
export type ClientText =
  | { t: 'join'; name: string; body?: number }
  | { t: 'map'; map: string }
  | { t: 'body'; body: number };

/** What a player did in a match, for the end screen: it carries the name and the team, which a leaver takes out of the roster. */
export interface Result {
  id: number;
  name: string;
  team: number;
  caps: number;
  returns: number;
}

export type ServerText =
  /**
   * Everyone in the room, `you` among them, the map played (MAPS key), the host's id (who picks
   * the map) and the map he picked for the next match, when it is another one.
   */
  | {
      t: 'roster';
      you: number;
      players: PlayerInfo[];
      map?: string;
      host?: number;
      next?: string;
    }
  | { t: 'full' }
  /** The match is over: the final captures of red and blue, and every player's result. */
  | { t: 'end'; score: [number, number]; players: Result[] };

export const MSG_INPUT = 1;
export const MSG_SNAPSHOT = 2;

export const INPUT_BYTES = 12;
export const SNAP_HEAD = 4;
export const SNAP_PLAYER = 62;
/** Bytes of a rover: thirteen float32, the two seats and a ship's three bytes. */
export const SNAP_ROVER = 57;
/** The rover count has three bits of the head's count byte, the players the other five. */
export const MAX_ROVERS = 7;
/** A rover's floats, in wire order. */
const ROVER_F = [
  ...['x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw'],
  ...['pitch', 'roll', 'wy', 'wp', 'wr', 'steer'],
] as const;
/** The match block after the players and the rovers: the captures, the clock, the packs; the flags follow (2 to 16 bytes). */
export const SNAP_MATCH = 10;

/** Bytes of a plasma ball. */
export const SNAP_BALL = 11;

/** The no-gun value of the ammo's 7 bits. */
const NO_GUN = 127;

/** A flag's resting place on the wire: 1/16 m in an i16, so ±2 km. A ball's: 1/32 m, ±1 km. */
const POS = 16;
const BALL_POS = 32;
/** A ball's yaw: 256ths of a turn; its pitch: 127ths of a quarter turn. */
const YAW8 = 128 / Math.PI;
const PITCH8 = 254 / Math.PI;

const TURN = 65536 / (2 * Math.PI);
/** Radians to 65536ths of a turn; the mask also folds negative and ≥ 2π angles into one turn. */
const toTurn = (yaw: number): number => Math.round(yaw * TURN) & 0xffff;
const clamp16 = (v: number): number => Math.max(-32768, Math.min(32767, Math.round(v)));
/** Pitch in 1/10000 rad, and back. */
const toPitch = (pitch: number): number => clamp16(pitch * 10000);
const fromPitch = (w: number): number => w / 10000;
const fromTurn = (w: number): number => w / TURN;
/** A view tick in 1/256 tick, modulo the u16 tick circle (24 bits); absent is 0. */
const toView = (view = 0): number => Math.round(view * 256) & 0xffffff;

/**
 * The input as the host will read it after encodeInput and decodeInput: yaw, pitch and view
 * rounded to the wire (an absent view stays absent here, and reads 0 on the host). The client
 * predicts with this, so both sides move with the same values.
 */
export const onWire = (i: Input): Input => ({
  ...i,
  yaw: fromTurn(toTurn(i.yaw)),
  pitch: fromPitch(toPitch(i.pitch)),
  ...(i.view !== undefined && { view: toView(i.view) / 256 }),
});

export const encodeInput = (i: Input): ArrayBuffer => {
  const v = new DataView(new ArrayBuffer(INPUT_BYTES));
  v.setUint8(0, MSG_INPUT);
  v.setUint16(1, i.seq & 0xffff);
  v.setUint16(3, i.keys & 0x7fff);
  v.setUint16(5, toTurn(i.yaw));
  v.setInt16(7, toPitch(i.pitch));
  const view = toView(i.view);
  v.setUint16(9, view >> 8);
  v.setUint8(11, view & 0xff);
  return v.buffer;
};

/** Null on anything that is not a well-formed input frame. */
export const decodeInput = (buf: ArrayBuffer): Input | null => {
  if (buf.byteLength !== INPUT_BYTES) {
    return null;
  }
  const v = new DataView(buf);
  if (v.getUint8(0) !== MSG_INPUT) {
    return null;
  }
  return {
    seq: v.getUint16(1),
    keys: v.getUint16(3) & 0x7fff,
    yaw: fromTurn(v.getUint16(5)),
    pitch: fromPitch(v.getInt16(7)),
    view: (v.getUint16(9) * 256 + v.getUint8(11)) / 256,
  };
};

/** Bytes of a flag on the wire, by its state. */
const flagBytes = (state: number): number =>
  state === FLAG.CARRIED ? 2 : state === FLAG.DROPPED ? 8 : 1;

export const encodeSnapshot = (s: Snapshot): ArrayBuffer => {
  // A rover past the count's three bits is not sent.
  const rovers = (s.rovers ?? []).slice(0, MAX_ROVERS);
  const mid = SNAP_HEAD + SNAP_PLAYER * s.players.length;
  const end = mid + SNAP_ROVER * rovers.length;
  const balls = s.balls ?? [];
  const tail = end + SNAP_MATCH + s.flags.reduce((n, f) => n + flagBytes(f.state), 0);
  const doors = s.doors ?? [];
  const gate = doors.length && 1 + Math.ceil(doors.length / 2);
  const v = new DataView(
    new ArrayBuffer(tail + (balls.length || gate ? 1 + SNAP_BALL * balls.length : 0) + gate),
  );
  v.setUint8(0, MSG_SNAPSHOT);
  v.setUint16(1, s.tick & 0xffff);
  v.setUint8(3, s.players.length | (rovers.length << 5));
  s.players.forEach((p, i) => {
    const o = SNAP_HEAD + i * SNAP_PLAYER;
    v.setUint8(o, p.id);
    v.setFloat32(o + 1, p.x);
    v.setFloat32(o + 5, p.y);
    v.setFloat32(o + 9, p.z);
    v.setFloat32(o + 13, p.vx);
    v.setFloat32(o + 17, p.vy);
    v.setFloat32(o + 21, p.vz);
    v.setFloat32(o + 25, p.edge);
    v.setUint16(o + 29, toTurn(p.yaw));
    v.setInt16(o + 31, toPitch(p.pitch));
    v.setUint16(o + 33, p.ack & 0xffff);
    v.setUint8(o + 35, (p.mode & 7) | ((p.wall & 7) << 3) | ((p.jumps & 1) << 6) | (p.dashes << 7));
    v.setUint8(o + 36, p.t);
    v.setUint8(o + 37, p.dash | (((p.by >> 2) & 3) << 6));
    v.setUint8(
      o + 38,
      (p.coyote & 7) |
        ((p.buffer & 7) << 3) |
        (p.held & KEY.JUMP ? 64 : 0) |
        (p.held & KEY.DASH ? 128 : 0),
    );
    v.setUint8(o + 39, p.stun | ((p.by & 3) << 6));
    const gun =
      p.hp |
      (p.cool << 3) |
      ((p.ammo < 0 ? NO_GUN : p.ammo) << 6) |
      (p.down << 13) |
      (+!!p.rack << 20) |
      (+!!p.blade << 21) |
      (+!!p.wield << 22) |
      (+!!p.zap << 23);
    v.setUint8(o + 40, gun >> 16);
    v.setUint16(o + 41, gun & 0xffff);
    v.setUint8(o + 43, p.shots);
    v.setUint8(o + 44, p.hits);
    v.setUint8(o + 45, ((p.swing ?? 0) & 63) | (((p.cut ?? 0) & 3) << 6));
    v.setUint8(
      o + 46,
      ((p.lost ?? 0) & 7) | (((p.cut ?? 0) & 4) << 1) | (p.fried ? 16 : 0) | (p.heavy ? 32 : 0),
    );
    v.setUint8(o + 47, p.charge ?? 0);
    v.setUint8(o + 48, p.lock ?? 0);
    v.setUint8(o + 49, ((p.foe ?? 0) & 15) | (p.pressed ? 128 : 0));
    v.setUint8(o + 50, p.pushes ?? 0);
    v.setUint8(o + 51, p.away ?? 0);
    v.setUint8(o + 52, (p.rail ?? -1) + 1);
    v.setUint8(
      o + 53,
      +!!p.railed |
        (+!!p.inRail << 1) |
        (+!!p.zapping << 2) |
        (+!!p.rifled << 3) |
        (+!!p.inRifle << 4) |
        (+!!p.hot << 5) |
        (p.held & KEY.USE ? 64 : 0),
    );
    v.setUint8(o + 54, p.slow ?? 0);
    v.setUint8(o + 55, p.mag ?? 0);
    v.setUint8(o + 56, p.cap ?? 0);
    v.setUint8(o + 57, p.reload ?? 0);
    v.setUint8(o + 58, (p.rifle ?? -1) + 1);
    v.setUint8(o + 59, p.clip ?? 0);
    v.setUint8(o + 60, p.heat ?? 0);
    v.setUint8(o + 61, ((p.nades ?? 0) << 6) | (p.lob ?? 0));
  });
  rovers.forEach((r, i) => {
    const o = mid + i * SNAP_ROVER;
    ROVER_F.forEach((k, j) => v.setFloat32(o + 4 * j, r[k]));
    v.setUint8(o + 52, r.driver);
    v.setUint8(o + 53, r.rider);
    if (r.ship) {
      v.setUint8(o + 54, 128 | Math.max(0, Math.min(127, r.hp ?? 0)));
      v.setUint8(o + 55, Math.min(255, Math.ceil((r.wreck ?? 0) / 4)));
      v.setUint8(o + 56, r.nades ?? 0);
    }
  });
  v.setUint8(end, s.score[0]);
  v.setUint8(end + 1, s.score[1]);
  v.setUint16(end + 2, (s.clock & 0x7fff) | (s.over ? 0x8000 : 0));
  const packs = s.packs ?? 0;
  v.setUint16(end + 4, Math.floor(packs / 2 ** 32));
  v.setUint32(end + 6, packs % 2 ** 32);
  let o = end + SNAP_MATCH;
  for (const f of s.flags) {
    v.setUint8(o, f.state);
    if (f.state === FLAG.CARRIED) {
      v.setUint8(o + 1, f.by);
    } else if (f.state === FLAG.DROPPED) {
      v.setInt16(o + 1, clamp16(f.x * POS));
      v.setInt16(o + 3, clamp16(f.y * POS));
      v.setInt16(o + 5, clamp16(f.z * POS));
      v.setUint8(o + 7, Math.min(255, f.left));
    }
    o += flagBytes(f.state);
  }
  if (balls.length || gate) {
    v.setUint8(o++, balls.length);
  }
  for (const b of balls) {
    v.setUint8(o, b.id);
    v.setUint8(o + 1, (b.by & 127) | (b.burst ? 128 : 0));
    [b.x, b.y, b.z].forEach((c, k) => v.setInt16(o + 2 + 2 * k, clamp16(c * BALL_POS)));
    v.setUint8(o + 8, Math.round(Math.atan2(-b.dx, -b.dz) * YAW8) & 255);
    v.setInt8(o + 9, Math.round(Math.asin(Math.max(-1, Math.min(1, b.dy))) * PITCH8));
    v.setUint8(
      o + 10,
      b.arc ? 128 | b.arc : b.power === NADE ? 64 | Math.min(63, Math.round(b.v!)) : (b.power ?? 1),
    );
    o += SNAP_BALL;
  }
  if (gate) {
    v.setUint8(o++, doors.length);
    doors.forEach((d, k) => {
      const at = o + (k >> 1);
      v.setUint8(at, v.getUint8(at) | (Math.round(d * 15) << (k & 1 ? 0 : 4)));
    });
  }
  return v.buffer;
};

/** Null on anything that is not a well-formed snapshot frame. */
export const decodeSnapshot = (buf: ArrayBuffer): Snapshot | null => {
  if (buf.byteLength < SNAP_HEAD) {
    return null;
  }
  const v = new DataView(buf);
  const count = v.getUint8(3) & 31;
  const mid = SNAP_HEAD + SNAP_PLAYER * count;
  const end = mid + SNAP_ROVER * (v.getUint8(3) >> 5);
  if (v.getUint8(0) !== MSG_SNAPSHOT || buf.byteLength < end + SNAP_MATCH + 2) {
    return null;
  }
  const players = [];
  for (let i = 0; i < count; i++) {
    const o = SNAP_HEAD + i * SNAP_PLAYER;
    const mode = v.getUint8(o + 35);
    const timers = v.getUint8(o + 38);
    const [dash, stun] = [v.getUint8(o + 37), v.getUint8(o + 39)];
    const m = mode & 7;
    const gun = (v.getUint8(o + 40) << 16) | v.getUint16(o + 41);
    players.push({
      id: v.getUint8(o),
      x: v.getFloat32(o + 1),
      y: v.getFloat32(o + 5),
      z: v.getFloat32(o + 9),
      vx: v.getFloat32(o + 13),
      vy: v.getFloat32(o + 17),
      vz: v.getFloat32(o + 21),
      edge: v.getFloat32(o + 25),
      yaw: fromTurn(v.getUint16(o + 29)),
      pitch: fromPitch(v.getInt16(o + 31)),
      ack: v.getUint16(o + 33),
      ground: m === MODE.GROUND || m === MODE.SLIDE || m === MODE.CROUCH,
      mode: m,
      wall: (mode >> 3) & 7,
      jumps: (mode >> 6) & 1,
      dashes: mode >> 7,
      t: v.getUint8(o + 36),
      dash: dash & 63,
      stun: stun & 63,
      by: ((dash >> 6) << 2) | (stun >> 6),
      coyote: timers & 7,
      buffer: (timers >> 3) & 7,
      held:
        (timers & 64 ? KEY.JUMP : 0) |
        (timers & 128 ? KEY.DASH : 0) |
        (v.getUint8(o + 53) & 64 ? KEY.USE : 0),
      ev: 0,
      fall: 0,
      hp: gun & 7,
      cool: (gun >> 3) & 7,
      ammo: ((gun >> 6) & 127) === NO_GUN ? -1 : (gun >> 6) & 127,
      down: (gun >> 13) & 127,
      rack: ((gun >> 20) & 1) === 1,
      shots: v.getUint8(o + 43),
      hits: v.getUint8(o + 44),
      blade: ((gun >> 21) & 1) === 1,
      wield: ((gun >> 22) & 1) === 1,
      zap: ((gun >> 23) & 1) === 1,
      swing: v.getUint8(o + 45) & 63,
      cut: (v.getUint8(o + 45) >> 6) | ((v.getUint8(o + 46) >> 1) & 4),
      lost: v.getUint8(o + 46) & 7,
      charge: v.getUint8(o + 47),
      lock: v.getUint8(o + 48),
      foe: v.getUint8(o + 49) & 15,
      pressed: v.getUint8(o + 49) > 127,
      pushes: v.getUint8(o + 50),
      away: v.getUint8(o + 51),
      rail: v.getUint8(o + 52) - 1,
      railed: (v.getUint8(o + 53) & 1) > 0,
      inRail: (v.getUint8(o + 53) & 2) > 0,
      zapping: (v.getUint8(o + 53) & 4) > 0,
      fried: (v.getUint8(o + 46) & 16) > 0,
      heavy: (v.getUint8(o + 46) & 32) > 0,
      slow: v.getUint8(o + 54),
      mag: v.getUint8(o + 55),
      cap: v.getUint8(o + 56),
      reload: v.getUint8(o + 57),
      rifle: v.getUint8(o + 58) - 1,
      clip: v.getUint8(o + 59),
      rifled: (v.getUint8(o + 53) & 8) > 0,
      inRifle: (v.getUint8(o + 53) & 16) > 0,
      hot: (v.getUint8(o + 53) & 32) > 0,
      heat: v.getUint8(o + 60),
      nades: v.getUint8(o + 61) >> 6,
      lob: v.getUint8(o + 61) & 63,
    });
  }
  const rovers: Rover[] = [];
  for (let o = mid; o < end; o += SNAP_ROVER) {
    const r = { driver: v.getUint8(o + 52), rider: v.getUint8(o + 53) } as Rover;
    ROVER_F.forEach((k, j) => (r[k] = v.getFloat32(o + 4 * j)));
    const kind = v.getUint8(o + 54);
    if (kind & 128) {
      Object.assign(r, {
        ship: true,
        hp: kind & 127,
        wreck: v.getUint8(o + 55) * 4,
        nades: v.getUint8(o + 56),
      });
    }
    rovers.push(r);
  }
  const clock = v.getUint16(end + 2);
  let o = end + SNAP_MATCH;
  const flags: FlagState[] = [];
  for (let k = 0; k < 2; k++) {
    const state = o < buf.byteLength ? v.getUint8(o) : -1;
    if (state < 0 || state > FLAG.DROPPED || o + flagBytes(state) > buf.byteLength) {
      return null;
    }
    const f: FlagState = { state, by: 0, x: 0, y: 0, z: 0, left: 0 };
    if (state === FLAG.CARRIED) {
      f.by = v.getUint8(o + 1);
    } else if (state === FLAG.DROPPED) {
      [f.x, f.y, f.z] = [1, 3, 5].map(d => v.getInt16(o + d) / POS);
      f.left = v.getUint8(o + 7);
    }
    flags.push(f);
    o += flagBytes(state);
  }
  // A count of 0 is only written before the doors: alone, a zero byte there is padding.
  const some = o < buf.byteLength;
  const n = some ? v.getUint8(o++) : 0;
  const gate = o + n * SNAP_BALL;
  const ports = gate < buf.byteLength ? v.getUint8(gate) : 0;
  if (gate + (ports && 1 + Math.ceil(ports / 2)) !== buf.byteLength || (some && !n && !ports)) {
    return null;
  }
  const doors = Array.from(
    { length: ports },
    (_, k) => ((v.getUint8(gate + 1 + (k >> 1)) >> (k & 1 ? 0 : 4)) & 15) / 15,
  );
  const balls: Ball[] = [];
  for (let k = 0; k < n; k++, o += SNAP_BALL) {
    const [yaw, pitch] = [v.getUint8(o + 8) / YAW8, v.getInt8(o + 9) / PITCH8];
    balls.push({
      id: v.getUint8(o),
      by: v.getUint8(o + 1) & 127,
      x: v.getInt16(o + 2) / BALL_POS,
      y: v.getInt16(o + 4) / BALL_POS,
      z: v.getInt16(o + 6) / BALL_POS,
      dx: -Math.sin(yaw) * Math.cos(pitch),
      dy: Math.sin(pitch),
      dz: -Math.cos(yaw) * Math.cos(pitch),
      burst: v.getUint8(o + 1) > 127,
      ...(v.getUint8(o + 10) > 127
        ? { power: 1, arc: v.getUint8(o + 10) & 127 }
        : v.getUint8(o + 10) > 63
          ? { power: NADE, v: v.getUint8(o + 10) & 63 }
          : { power: v.getUint8(o + 10) }),
    });
  }
  return {
    tick: v.getUint16(1),
    players,
    score: [v.getUint8(end), v.getUint8(end + 1)],
    clock: clock & 0x7fff,
    over: (clock & 0x8000) !== 0,
    flags: flags as Snapshot['flags'],
    packs: v.getUint16(end + 4) * 2 ** 32 + v.getUint32(end + 6),
    ...(n ? { balls } : {}),
    ...(rovers.length ? { rovers } : {}),
    ...(ports ? { doors } : {}),
  };
};

/** Returns null on anything that is not a known text message. */
export const parseText = <T extends ClientText | ServerText>(raw: string): T | null => {
  try {
    const msg = JSON.parse(raw);
    return msg && typeof msg.t === 'string' ? msg : null;
  } catch {
    return null;
  }
};
