import { BOLT, HP_MAX, LOCK_WIN, PLAYER_H, PLAYER_R, TICK_HZ, VEHICLE } from '../shared/constants';
import { mapKey, mapOf } from '../shared/maps';
import { bruise, eyeHeight, heightOf } from '../shared/physics';
import { cylinder } from '../shared/plasma';
import { decodeSnapshot, encodeInput, parseText } from '../shared/protocol';
import type { ClientText, ServerText } from '../shared/protocol';
import { EV, FLAG, KEY, MODE } from '../shared/types';
import type { Choice, PlayerInfo, PlayerState, SocketLike, Snapshot } from '../shared/types';
import { ROLE, kitOf, roleOf, rolesOf } from '../shared/kit';
import { TONES, toneOf } from './features';
import { styleOf } from './hair';
import { shaved } from './skin';
import { SONGS, SOUND } from './sfx';
import { aimOf, gap2, struck } from '../shared/rover';
import { SHIP, altitude, limits } from '../shared/ship';
import { build, hidden, ray } from '../shared/world';
import { createAnnouncer } from './announce';
import { LINE, SAID } from './voice/clips';
import { createAudio, savedMute, toggleMute } from './audio';
import { createBalls } from './balls';
import { createTracer } from './beams';
import { beats, cues, say } from './beats';
import { createBody } from './body';
import { chasePitch, createChase } from './chase';
import { createCombat, sight, voiceOf } from './combat';
import { createDoors } from './doors';
import { createEffects } from './effects';
import { flagDraws } from './flag';
import { createFoley } from './foley';
import { mood } from './face';
import { dashing, felled, strain } from './expression';
import { HUD_CSS, OUT_HINT, boarding, createHud, kmh } from './hud';
import type { Summary } from './hud';
import { createInput } from './input';
import { createPredictor } from './predict';
import { gather } from './lights';
import { marks } from './marks';
import { packsOf } from './props';
import { HEAD, createRenderer } from './render';
import { createWrecks } from './wreck';
import type { Renderer } from './render';

export type { PlayerInfo, SocketLike } from '../shared/types';

export interface TinyFpsOptions {
  name: string;
  /** WebSocket URL, e.g. ws://localhost:8787/demo (the path picks the room). */
  url?: string;
  /** Any WebSocket-like socket, e.g. localSocket('room') from '@korial29/tiny-fps/local'. */
  socket?: SocketLike;
  /**
   * The map's key, 'highline' (the default) or 'tranquility', built while the room is joined. The
   * room's roster says the map it plays, and the game follows it: the host picks it.
   */
  map?: string;
  /** The character to play (BODY): the man (0, the default) or the woman (1). The look only. */
  body?: number;
}

/** quit: the player left from the pause menu (Escape, then Quit); the page decides where he goes. */
export type TinyFpsEvent = 'roster' | 'open' | 'close' | 'quit';

export interface TinyFps {
  on(ev: TinyFpsEvent, cb: () => void): void;
  /** Everyone in the room, the own player included. */
  players(): PlayerInfo[];
  /** Closes the socket, stops the loop and removes the canvas. */
  destroy(): void;
}

const STEP = 1 / TICK_HZ;
/** Steps run in one frame at most: a background tab catches up by this much, not by minutes. */
const MAX_STEPS = 5;
/** Metres within which a vehicle shows its health over it: a rover, a ship. */
const NEAR_HULL = [14, 24];
/** Ms after a hard landing during which a loss of health is the fall's, not a foe's: the snapshot's lag. */
const FELL = 500;

/**
 * Mounts the game in a Shadow DOM inside container: one WebGL2 canvas filling it, a click locks the
 * pointer, the mouse looks, WASD (ZQSD on AZERTY) moves, Shift sprints, Space jumps (again in the
 * air for a second jump), C crouches and slides, a direction key pressed twice dashes, E gets in
 * and out of a rover. Without the lock the title screen shows: a menu, the character to play, the
 * mode, the map and the controls.
 *
 * The socket is this function's; the scene of one map is play()'s, behind a socket of its own.
 * When the room plays another map, the scene goes and one of the new map takes its place on the
 * same connection: the room keeps the player, his team and the host.
 */
export const tinyFps = (container: HTMLElement, opts: TinyFpsOptions): TinyFps => {
  const listeners: Record<TinyFpsEvent, (() => void)[]> = {
    roster: [],
    open: [],
    close: [],
    quit: [],
  };
  const emit = (ev: TinyFpsEvent) => listeners[ev].forEach(cb => cb());
  const ws = opts.socket ?? (new WebSocket(opts.url!) as unknown as SocketLike);
  ws.binaryType = 'arraybuffer';
  let map = mapKey(opts.map);
  let roster: PlayerInfo[] = [];
  /** The connection is open, and the last roster as it came: a new scene gets both. */
  let up = false;
  let told: string | undefined;
  let port: SocketLike;
  let scene: { destroy(): void };
  let dead = false;
  const mount = () => {
    const p: SocketLike = {
      binaryType: 'arraybuffer',
      onopen: null,
      onclose: null,
      onmessage: null,
      // A scene that is gone sends nothing more.
      send: d => port == p && ws.send(d),
      close: () => {},
    };
    port = p;
    scene = play(container, map, p, () => emit('quit'));
    if (up) {
      p.onopen?.();
    }
    if (told) {
      p.onmessage?.({ data: told });
    }
  };
  ws.onopen = () => {
    up = true;
    ws.send(
      JSON.stringify({
        t: 'join',
        name: opts.name,
        ...(opts.body ? { body: opts.body } : {}),
      } satisfies ClientText),
    );
    port.onopen?.();
    emit('open');
  };
  ws.onclose = () => {
    up = false;
    port.onclose?.();
    emit('close');
  };
  ws.onmessage = ev => {
    const m = typeof ev.data == 'string' ? parseText<ServerText>(ev.data) : null;
    if (m?.t == 'roster') {
      [told, roster] = [ev.data as string, m.players];
      if (mapKey(m.map) != map) {
        map = mapKey(m.map);
        scene.destroy();
        mount();
        emit('roster');
        return;
      }
    }
    port.onmessage?.(ev);
    if (m?.t == 'roster') {
      emit('roster');
    }
  };
  mount();
  return {
    on: (ev, cb) => void listeners[ev].push(cb),
    players: () => roster,
    destroy() {
      if (dead) {
        return;
      }
      dead = true;
      scene.destroy();
      ws.onopen = ws.onclose = ws.onmessage = null;
      ws.close();
    },
  };
};

/** The game on one map, talking through `ws`: the scene, the HUD, the input, the sound. */
const play = (
  container: HTMLElement,
  key: string,
  ws: SocketLike,
  quit = () => {},
): { destroy(): void } => {
  const wrap = document.createElement('div');
  const root = wrap.attachShadow({ mode: 'open' });
  root.innerHTML =
    `<style>:host{display:block;width:100%;height:100%}div{position:relative;width:100%;height:100%;overflow:hidden;background:#000;font:600 14px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000}` +
    `canvas{display:block;width:100%;height:100%;cursor:pointer}` +
    `i,p,b{position:absolute;pointer-events:none;user-select:none;margin:0}` +
    HUD_CSS +
    `i{left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px #0008}` +
    // Over the helmet's blurred rim (the HUD's del), under the death screen.
    `p{bottom:8px;left:12px;z-index:1}` +
    `b{transform:translate(-50%,-100%);font-size:12px;white-space:nowrap}[hidden]{display:none}</style>` +
    `<div><canvas></canvas><i></i><p></p></div>`;
  container.append(wrap);
  const canvas = root.querySelector('canvas')!;
  const count = root.querySelector('p')!;
  const screen = root.querySelector('div')!;
  // The title screen's button is a click on the canvas: the pointer lock and the sound start there.
  const hud = createHud(
    screen,
    () => canvas.click(),
    () => {
      document.exitPointerLock?.();
      quit();
    },
  );
  /** The player has been in the game: Escape then opens the pause menu. */
  let started = false;

  const world = build(mapOf(key));
  const predictor = createPredictor(world);
  const audio = createAudio(undefined, undefined, SONGS[key]);
  audio.mute(savedMute());
  hud.mute(audio.muted);
  hud.frags(0);
  hud.visor(!!world.def.helmets);
  const ctl = createInput(canvas, () => hud.mute(toggleMute(audio)));
  // The click that takes the pointer lock is the gesture that lets the sound start.
  canvas.addEventListener('click', () => audio.unlock());
  const fx = createEffects();
  const announcer = createAnnouncer();
  const foley = createFoley(audio);
  const body = createBody(world);
  const chase = createChase(world);
  const tracer = createTracer();
  const balls = createBalls(world);
  const doors = createDoors(world);
  const combat = createCombat(
    world,
    audio,
    hud,
    fx,
    tracer,
    ctl,
    balls,
    id => rd?.muzzle(id),
    id => voiceOf(id, roster.find(p => p.id == id)?.body),
  );
  const wrecks = createWrecks(world, { tracer, audio, fx });
  let rd: Renderer | undefined;
  try {
    rd = createRenderer(canvas, world);
  } catch {
    // No WebGL2: stay connected, say so on the title screen.
  }
  const bases = world.def.teams.map(t => t.base);
  const racks = world.def.teams.map(t => t.rack);
  const blades = world.def.teams.map(t => t.blade);
  const rails = world.def.teams.map(t => t.rail);
  const rifles = world.def.teams.map(t => t.rifle);
  let roster: PlayerInfo[] = [];
  /** What the own player picked, as last told or answered: drawn at once, and sent to the host, whose roster dresses everyone. */
  let picked: Choice & { body: number } = { body: 0 };
  const avatar = hud.cast(c => {
    picked = c;
    ws.send(JSON.stringify({ t: 'body', ...c } satisfies ClientText));
  });
  /** What the live picture shows: the own id, colour and choice. */
  let drawn = '';
  /** The own player's id and team, from the roster. */
  let you = { id: -1, team: 0 };
  /** The latest snapshot, for the flags and the match; the one before it tells what just happened. */
  let match: Snapshot | undefined;
  /** The rovers' laser bolts of the last snapshot, by shooter and id. */
  let bolts = new Set<number>();
  /** The result of the match that has just ended, while its end screen shows. */
  let ended: Summary | undefined;
  let colors = new Map<number, string>();
  let names = new Map<number, string>();
  /** Tags above the others, by player id. */
  const tags = new Map<number, HTMLElement>();
  let open = false;
  /** Shown on the title screen instead of "Click to play": a closed connection, a full room, no WebGL. */
  let msg = rd ? '' : 'WebGL2 is not available';
  /** The own player is known, and the look angles start from where the host spawned it. */
  let ready = false;
  /** The face in the HUD: its mind, the own player as last framed, and how long the trigger has been held. */
  const feel = mood();
  let [felt, firing]: [PlayerState | undefined, number] = [undefined, 0];
  /** When the own player last landed hard enough to hurt (ms): that hurt comes from no foe. */
  let thud = -Infinity;
  /** The others as last framed (a foe put down shows between two frames), and the own team has just captured. */
  let prior = new Map<number, PlayerState>();
  let won = false;
  /** The rover last driven (its index), whether the own player is seated, and since when (ms). */
  let [wheel, seated, since] = [-1, false, 0];
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  let dead = false;

  ws.onopen = () => (open = true);
  ws.onclose = () => {
    open = false;
    msg ||= 'Connection closed';
  };
  ws.onmessage = ({ data }) => {
    if (typeof data != 'string') {
      const s = decodeSnapshot(data);
      if (s) {
        predictor.snapshot(s, performance.now());
        // A vehicle's laser bolt, new in this snapshot: its blaster is heard where it is, each a
        // little off the pitch of the last so that a salvo does not drone.
        const flying = new Set<number>();
        for (const b of s.balls ?? []) {
          if (b.power === BOLT) {
            const key = (b.by << 8) | b.id;
            flying.add(key);
            if (!bolts.has(key) && !b.burst) {
              audio.play(SOUND.BLASTER, [b.x, b.y, b.z], 0.6, 0.92 + 0.16 * ((b.id * 0.618) % 1));
            }
          }
        }
        bolts = flying;
        balls.snapshot(s.balls ?? [], you.id, performance.now());
        // A door that starts to open or to shut is heard where it is.
        for (const c of doors.snapshot(s.doors)) {
          audio.play(c.id, c.at, 0.9);
        }
        const told = beats(match, s);
        for (const beat of told) {
          const line = say(beat, you, id => names.get(id) ?? 'Someone');
          if (line) {
            hud.banner(line.text, line.team);
          }
          if (beat.kind == 'start') {
            hud.frags(0);
            // A new match: everyone is back at a spawn, facing the way his team's spawns do.
            [ctl.yaw, ctl.pitch] = [world.def.teams[you.team].spawns[0][3], 0];
          }
          for (const c of cues(beat, you)) {
            audio.play(c.id, c.at, c.gain, c.rate);
          }
          if (beat.kind == 'capture') {
            // The team that captured grins, the own face in the HUD with it.
            rd?.cheer(roster.filter(p => p.team == beat.team).map(p => p.id));
            won ||= beat.team == you.team;
          }
          if (beat.kind == 'tackle') {
            // The own player tackled, or was: the camera answers.
            if (beat.who == you.id) {
              fx.jolt();
            } else if (beat.by == you.id) {
              fx.punch();
            }
          } else if (beat.kind == 'shock') {
            tracer.shock(beat.at);
            if (beat.who == you.id) {
              fx.jolt();
            }
          }
        }
        for (const line of announcer.step(match, s, told, you)) {
          audio.say(line);
          if (line == LINE.AIM) {
            hud.fragged('', SAID[line]);
          }
        }
        match = s;
      }
      return;
    }
    const m = parseText<ServerText>(data);
    if (m?.t == 'roster') {
      roster = m.players;
      colors = new Map(roster.map(p => [p.id, p.color]));
      names = new Map(roster.map(p => [p.id, p.name]));
      rd?.wear(
        new Map(roster.map(p => [p.id, p.body ?? 0])),
        new Map(
          roster.map(({ id, tone, hair, role }) => [
            id,
            { tone, hair, role: roleOf(role, world.def) },
          ]),
        ),
      );
      const own = roster.find(p => p.id == m.you);
      you = { id: m.you, team: own?.team ?? 0 };
      const build = own?.body ?? 0;
      picked = { body: build, tone: own?.tone, hair: own?.hair, role: own?.role };
      body.wear(
        build,
        own?.tone === undefined ? undefined : TONES[own.tone],
        roleOf(own?.role, world.def) == ROLE.NINJA,
      );
      // The title screen shows what his id gives where he has picked nothing: his skin and cut as drawn.
      hud.wear(
        build,
        {
          tone: own?.tone ?? TONES.indexOf(toneOf(m.you)),
          hair: own?.hair ?? (build ? styleOf(m.you) : shaved(m.you) ? 0 : undefined),
          role: roleOf(own?.role, world.def),
        },
        rolesOf(world.def),
      );
      predictor.you(you.id, you.team, own?.role);
      const kit = kitOf(own?.role, world.def);
      hud.magazines([kit.mag, kit.cap, kit.clip]);
      // No map to pick in the game's menu (the user, 2026-11-13): it is the join page's choice.
      count.textContent = `Players: ${roster.length}`;
    } else if (m?.t == 'frag') {
      const who = (id: number): [string, number] => [
        names.get(id) ?? 'Someone',
        roster.find(p => p.id == id)?.team ?? 0,
      ];
      hud.feed(who(m.by), who(m.who));
      if (m.by == you.id) {
        hud.frags(m.n);
        const line = announcer.frag(m, you, performance.now() / 1000);
        hud.fragged(`${who(m.who)[0]} killed!`, line === undefined ? '' : SAID[line]);
        if (line !== undefined) {
          audio.say(line);
        }
      }
    } else if (m?.t == 'end') {
      ended = { score: m.score, players: m.players };
      audio.say(announcer.end(m.score, you.team));
    } else if (m?.t == 'full') {
      msg = 'Room is full';
    }
  };

  const tag = (id: number) => {
    let el = tags.get(id);
    if (!el) {
      tags.set(id, (el = document.createElement('b')));
      screen.append(el);
    }
    return el;
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const before = last;
    acc = Math.min(acc + (now - last) / 1000, MAX_STEPS * STEP);
    last = now;

    if (!ready) {
      const me = predictor.me(0);
      if (me) {
        // Inputs carry the yaw: start from the spawn's, or the first one would turn the player.
        [ctl.yaw, ctl.pitch, ready] = [me.yaw, me.pitch, true];
      }
      acc = 0;
    }
    for (; ready && acc >= STEP; acc -= STEP) {
      const was = predictor.me(1);
      const input = predictor.step({ keys: ctl.take(), yaw: ctl.yaw, pitch: ctl.pitch }, now);
      combat.step(was, predictor.me(1));
      ctl.track(was, predictor.me(1));
      if (open) {
        ws.send(encodeInput(input));
      }
    }

    const me = predictor.me(acc / STEP);
    const others = predictor.others(now);
    const eye: [number, number, number] = me ? [me.x, me.y + eyeHeight(me), me.z] : [0, 0, 0];
    // The rovers, and the own seat: at the wheel the camera chases the rover, beside it the view
    // stays in the rider's head, where his shots leave from.
    const rovers = predictor.rovers(now, acc / STEP);
    const seat = predictor.riding();
    const driving = seat?.seat === 0;
    since = seat && !seated ? now : since;
    seated = !!seat;
    if (driving) {
      wheel = seat.rover;
      ctl.pitch = chasePitch(ctl.pitch, rovers[wheel]);
    }
    audio.listen(eye, ctl.yaw);
    const dt = Math.min((now - before) / 1000, 0.1);
    // The flags and the bases for the renderer and the lights, and the HUD that goes with them.
    const who = (id: number) => (id == you.id ? me : others.find(p => p.id == id));
    const ctf = match && {
      bases,
      flags: flagDraws(match.flags, bases, who),
      racks,
      blades,
      rails,
      rifles,
      packs: packsOf(world.def.packs, match.packs),
      ammo: packsOf(world.def.ammo, match.packs, world.def.packs?.length),
      cells: packsOf(
        world.def.cells,
        match.packs,
        (world.def.packs?.length ?? 0) + (world.def.ammo?.length ?? 0),
      ),
      vests: packsOf(
        world.def.vests,
        match.packs,
        (world.def.packs?.length ?? 0) +
          (world.def.ammo?.length ?? 0) +
          (world.def.cells?.length ?? 0),
      ),
    };
    // What the live steps did, once: the camera and the sounds read it, the inputs sent do not.
    const hit = predictor.events();
    thud = hit.ev & EV.LAND && bruise(hit.fall) ? now : thud;
    // The bob goes with the legs as last drawn.
    // Seated, the move keys are the rover's: no strafe leans the view.
    fx.update(me, seat ? 0 : ctl.keys, dt, hit, body.phase);
    hud.hurt(fx.hurt);
    const carrying = !!match?.flags.some(f => f.state === FLAG.CARRIED && f.by == you.id);
    const car = driving ? rovers[wheel] : undefined;
    ctl.pilot = !!car?.ship;
    hud.rover(
      seat ? (now - since < OUT_HINT * 1000 ? 'get out' : '') : boarding(me, rovers, carrying),
      car ? kmh(car) : undefined,
    );
    const [up, out] = car?.ship ? limits(car, world) : [0, 0];
    hud.ship(
      car?.ship ? { nades: car.nades ?? 0, alt: altitude(car.y - SHIP.DROP), up, out } : undefined,
    );
    if (me) {
      // A hit comes from the nearest foe up: the angle to him off the view, to the right.
      const worn = (q: PlayerState) => q.hp + (q.armor ?? 0);
      const lost = felt && !felt.down ? Math.max(0, worn(felt) - worn(me)) : 0;
      const team = new Map(roster.map(p => [p.id, p.team]));
      let [from, near] = [undefined as number | undefined, Infinity];
      for (const p of others) {
        const [dx, dz] = [p.x - me.x, p.z - me.z];
        const d = Math.hypot(dx, dz);
        if (lost && now - thud > FELL && !p.down && team.get(p.id) != you.team && d < near) {
          const [s, c] = [Math.sin(ctl.yaw), Math.cos(ctl.yaw)];
          [from, near] = [Math.atan2(dx * c - dz * s, -dx * s - dz * c), d];
        }
      }
      const has = (q?: PlayerState) =>
        q ? +(q.ammo >= 0) + +!!q.blade + +((q.rail ?? -1) >= 0) + +((q.rifle ?? -1) >= 0) : 0;
      firing = ctl.keys & KEY.FIRE && !me.down ? firing + dt : 0;
      hud.face(
        feel(dt, {
          hp: me.hp,
          max: HP_MAX,
          down: me.down > 0,
          flag: carrying,
          lost,
          from,
          got: !!felt && has(me) > has(felt),
          firing,
          effort: strain(me) > 0.5,
          focus: firing > 0 || !!me.charge,
          shout: !me.down && (dashing(me) || !!me.swing),
          grin: won || (!!felt && felled(felt, me, id => prior.get(id), others)),
        }),
      );
      won = false;
    }
    felt = me && { ...me };
    prior = new Map(others.map(p => [p.id, p]));
    // A saber lock: the gauge of the tug of war, the own presses against the foe's.
    const foe = me?.lock ? who(me.foe ?? -1) : undefined;
    hud.duel(foe ? ((me!.pushes ?? 0) - (foe.pushes ?? 0)) / LOCK_WIN : undefined);
    body.update(me, dt, fx.kick, canvas.clientWidth / (canvas.clientHeight || 1));
    // The steps sound as the drawn feet land: the own body's now, the others' as last drawn.
    foley.me(me, hit, body.steps);
    foley.others(others, id => rd?.steps(id));
    foley.rover(
      seat && !rovers[seat.rover]?.ship ? rovers[seat.rover] : undefined,
      dt,
      driving ? ctl.keys : 0,
    );
    foley.ship(
      seat && rovers[seat.rover]?.ship ? rovers[seat.rover] : undefined,
      dt,
      driving ? ctl.keys : 0,
    );
    if (world.def.helmets) {
      foley.breathe(me, dt);
    }
    // The camera moves for the eye only: the inputs keep sending the real height and angles. A
    // cut's twist turns the drawn view a little with the body.
    const cam: [number, number, number] = [eye[0], eye[1] + fx.dy, eye[2]];
    // At the wheel the camera leaves the head for the chase view, and comes back on the way out:
    // what shakes the head (the bob, the dips, the rolls) fades with the share of it.
    const shot = chase.frame(
      rovers[wheel],
      driving,
      cam,
      ctl.pitch + fx.pitch,
      ctl.yaw,
      ctl.pitch,
      dt,
    );
    const third = shot.k > 0;
    const pov = shot.at;
    const pitch = shot.pitch;
    const view = ctl.yaw + body.spun() * (1 - shot.k);
    const lens = third
      ? { ...fx, roll: fx.roll * (1 - shot.k), fov: fx.fov * (1 - shot.k) + shot.fov }
      : fx;
    // The driver is unarmed and his body is the renderer's to draw whole: no sight, no muzzle.
    const look = me && !third ? sight(world, eye, cam, ctl.yaw, ctl.pitch, pitch) : undefined;
    if (look) {
      body.aim(look.local);
    }
    combat.frame(
      me &&
        look && {
          eye,
          cam,
          yaw: ctl.yaw,
          pitch: ctl.pitch,
          drawn: pitch,
          muzzle: body.muzzle(),
          ...look,
        },
      me,
      others,
      ctl.keys,
      dt,
      now,
    );
    // The vehicles as drawn: their damage arcs, blows up and falls apart on the way (wreck.ts).
    // After the tracer's update of this frame: a bolt it adds is drawn at least once at any rate.
    const shown = wrecks.frame(rovers, dt, eye);
    if (me && rd) {
      // The cards' pictures, once the own player and his colour are known: drawn before the frame, which then takes the canvas back.
      const mine = `${you.id}${colors.get(you.id)}${JSON.stringify(picked)}`;
      if (!ctl.locked() && drawn != mine && colors.has(you.id)) {
        const color = colors.get(you.id)!;
        // Dressed as the class he plays here.
        const look = { ...picked, role: roleOf(picked.role, world.def) };
        drawn = rd.portrait(avatar, me, picked.body, color, look) ? mine : drawn;
        // Each haircut on offer, on his own head (none under a space helmet, which hides it).
        if (!world.def.helmets) {
          hud
            .heads()
            .forEach((c, hair) => rd!.portrait(c, me, picked.body, color, { ...look, hair }, HEAD));
        }
      }
      rd.frame(
        pov,
        view,
        pitch,
        others,
        colors,
        lens,
        [...gather({ eye: pov, yaw: view, pitch, others, t: now / 1000, ctf }), ...tracer.lights()],
        third ? undefined : body,
        ctf,
        tracer,
        shown,
        third ? me : undefined,
        v => {
          doors.draw(v, pov, dt);
          wrecks.draw(v);
        },
      );
      // The reticle: where the lasers cross, on what the look meets as the host's sight() does
      // (a wall, another vehicle, a runner who is up), or along the look.
      if (car) {
        const hulls = rovers.filter(r => r !== car && !r.wreck);
        const up = others.filter(p => !p.down && p.mode !== MODE.RIDE);
        const [x, y, z] = aimOf(car, ctl.yaw, ctl.pitch, (o, d, m) =>
          Math.min(
            ray(world, o, d, m),
            ...hulls.map(r => struck(r, o, d, m)),
            ...up.map(p => cylinder(o, d, p, PLAYER_R, heightOf(p))),
          ),
        );
        hud.aim(rd.project(x, y, z));
      } else {
        hud.aim();
      }
    }
    // The health of the vehicle he sits in, and of the nearest other one within NEAR_HULL metres in sight.
    const mine = seat && rovers[seat.rover];
    const near = rovers
      .filter(r => me && r !== mine && !r.wreck && gap2(r, me) < NEAR_HULL[+!!r.ship] ** 2)
      .sort((a, b) => gap2(a, me!) - gap2(b, me!))[0];
    const over: [number, number, number] | undefined = near && [
      near.x,
      near.y + (near.ship ? 2.4 : 1.7),
      near.z,
    ];
    const at = over && !hidden(world, pov, over) ? rd?.project(...over) : undefined;
    hud.hull(
      mine ? (mine.hp ?? VEHICLE.HP) : undefined,
      near && at ? { hp: near.hp ?? VEHICLE.HP, at } : undefined,
    );
    if (match) {
      hud.match(match, id => names.get(id) ?? '?');
      hud.marks(
        me && rd
          ? marks({
              eye,
              id: you.id,
              team: you.team,
              yaw: view,
              flags: match.flags,
              bases,
              where: id => {
                const p = who(id);
                return p && [p.x, p.y, p.z];
              },
              project: rd.project,
            })
          : [],
      );
      // A match that is over shows its result until the next one; its text arrives with the snapshot that says so.
      hud.end(match.over ? ended : undefined, match.clock);
    }
    const seen = new Set<number>();
    for (const p of others) {
      const top: [number, number, number] = [p.x, p.y + PLAYER_H + 0.3, p.z];
      // Behind a wall the tag would give the player away.
      const at = me && !hidden(world, pov, top) ? rd?.project(...top) : undefined;
      const el = tag(p.id);
      seen.add(p.id);
      el.hidden = !at;
      if (at) {
        el.style.left = at[0] * 100 + '%';
        el.style.top = at[1] * 100 + '%';
      }
      const name = names.get(p.id) ?? '';
      if (el.textContent != name) {
        el.textContent = name;
      }
      // In the team's colour.
      el.style.color = colors.get(p.id) ?? '';
    }
    for (const [id, el] of tags) {
      if (!seen.has(id)) {
        el.remove();
        tags.delete(id);
      }
    }

    started ||= ctl.locked();
    hud.paused(started);
    hud.title(
      msg ||
        (!open
          ? 'Connecting…'
          : !ready
            ? 'Joining…'
            : ctl.locked()
              ? ''
              : started
                ? 'Resume'
                : 'Click to play'),
      world.def.name ?? '',
      world.def.tag,
      world.def.lore,
    );
  };
  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      if (dead) {
        return;
      }
      dead = true;
      cancelAnimationFrame(raf);
      ctl.destroy();
      audio.destroy();
      rd?.destroy();
      ws.onopen = ws.onclose = ws.onmessage = null;
      ws.close();
      document.exitPointerLock();
      wrap.remove();
    },
  };
};
