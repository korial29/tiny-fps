import { BOLT, HP_MAX, LOCK_WIN, PLAYER_H, TICK_HZ } from '../shared/constants';
import { MAPS, mapKey, mapOf } from '../shared/maps';
import { eyeHeight } from '../shared/physics';
import { decodeSnapshot, encodeInput, parseText } from '../shared/protocol';
import type { ClientText, ServerText } from '../shared/protocol';
import { FLAG, KEY } from '../shared/types';
import type { PlayerInfo, PlayerState, SocketLike, Snapshot } from '../shared/types';
import { SOUND } from './sfx';
import { ROVER, aimOf } from '../shared/rover';
import { build, hidden, ray } from '../shared/world';
import { createAnnouncer } from './announce';
import { createAudio, savedMute, toggleMute } from './audio';
import { createBalls } from './balls';
import { createTracer } from './beams';
import { beats, cues, say } from './beats';
import { createBody } from './body';
import { chasePitch, createChase } from './chase';
import { createCombat, sight } from './combat';
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
import { createRenderer } from './render';
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

export type TinyFpsEvent = 'roster' | 'open' | 'close';

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
  const listeners: Record<TinyFpsEvent, (() => void)[]> = { roster: [], open: [], close: [] };
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
    scene = play(container, map, p);
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
const play = (container: HTMLElement, key: string, ws: SocketLike): { destroy(): void } => {
  const wrap = document.createElement('div');
  const root = wrap.attachShadow({ mode: 'open' });
  root.innerHTML =
    `<style>:host{display:block;width:100%;height:100%}div{position:relative;width:100%;height:100%;overflow:hidden;background:#000;font:600 14px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000}` +
    `canvas{display:block;width:100%;height:100%;cursor:pointer}` +
    `i,p,b{position:absolute;pointer-events:none;user-select:none;margin:0}` +
    HUD_CSS +
    `i{left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px #0008}` +
    `p{bottom:8px;left:12px}` +
    `b{transform:translate(-50%,-100%);font-size:12px;white-space:nowrap}[hidden]{display:none}</style>` +
    `<div><canvas></canvas><i></i><p></p></div>`;
  container.append(wrap);
  const canvas = root.querySelector('canvas')!;
  const count = root.querySelector('p')!;
  const screen = root.querySelector('div')!;
  // The title screen's button is a click on the canvas: the pointer lock and the sound start there.
  const hud = createHud(screen, () => canvas.click());

  const world = build(mapOf(key));
  const predictor = createPredictor(world);
  const audio = createAudio();
  audio.mute(savedMute());
  hud.mute(audio.muted);
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
  const combat = createCombat(world, audio, hud, fx, tracer, ctl, balls, id => rd?.muzzle(id));
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
  /** The title screen's character cards: a choice goes to the host, whose roster dresses everyone. */
  const cards = hud.cast(body => ws.send(JSON.stringify({ t: 'body', body } satisfies ClientText)));
  /** Whose pictures the cards show: the own id and colour. */
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
        // A rover's laser bolt, new in this snapshot: its shot is heard where it is.
        const flying = new Set<number>();
        for (const b of s.balls ?? []) {
          if (b.power === BOLT) {
            const key = (b.by << 8) | b.id;
            flying.add(key);
            if (!bolts.has(key) && !b.burst) {
              audio.play(SOUND.LASE, [b.x, b.y, b.z], 0.35, 1.5);
            }
          }
        }
        bolts = flying;
        balls.snapshot(s.balls ?? [], you.id, performance.now());
        const told = beats(match, s);
        for (const beat of told) {
          const line = say(beat, you, id => names.get(id) ?? 'Someone');
          if (line) {
            hud.banner(line.text, line.team);
          }
          if (beat.kind == 'start') {
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
        for (const line of announcer.step(match, s, told, you, performance.now() / 1000)) {
          audio.say(line);
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
      rd?.wear(new Map(roster.map(p => [p.id, p.body ?? 0])));
      you = { id: m.you, team: roster.find(p => p.id == m.you)?.team ?? 0 };
      body.wear(roster.find(p => p.id == m.you)?.body ?? 0);
      hud.wear(roster.find(p => p.id == m.you)?.body ?? 0);
      predictor.you(you.id, you.team);
      hud.maps(
        Object.entries(MAPS).map(([k, d]) => [k, d.name ?? k]),
        key,
        m.next,
        names.get(m.host ?? -1) ?? '?',
        m.host == you.id,
        map => ws.send(JSON.stringify({ t: 'map', map } satisfies ClientText)),
      );
      count.textContent = `Players: ${roster.length}`;
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
      ctl.pitch = chasePitch(ctl.pitch);
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
    };
    // What the live steps did, once: the camera and the sounds read it, the inputs sent do not.
    const hit = predictor.events();
    // The bob goes with the legs as last drawn.
    // Seated, the move keys are the rover's: no strafe leans the view.
    fx.update(me, seat ? 0 : ctl.keys, dt, hit, body.phase);
    hud.hurt(fx.hurt);
    const carrying = !!match?.flags.some(f => f.state === FLAG.CARRIED && f.by == you.id);
    hud.rover(
      seat ? (now - since < OUT_HINT * 1000 ? 'get out' : '') : boarding(me, rovers, carrying),
      driving && rovers[wheel] ? kmh(rovers[wheel]) : undefined,
    );
    if (me) {
      // A hit comes from the nearest foe up: the angle to him off the view, to the right.
      const lost = felt && !felt.down ? Math.max(0, felt.hp - me.hp) : 0;
      const team = new Map(roster.map(p => [p.id, p.team]));
      let [from, near] = [undefined as number | undefined, Infinity];
      for (const p of others) {
        const [dx, dz] = [p.x - me.x, p.z - me.z];
        const d = Math.hypot(dx, dz);
        if (lost && !p.down && team.get(p.id) != you.team && d < near) {
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
    foley.rover(seat && rovers[seat.rover], dt, driving ? ctl.keys : 0);
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
    if (me && rd) {
      // The cards' pictures, once the own player and his colour are known: drawn before the frame, which then takes the canvas back.
      const mine = `${you.id}${colors.get(you.id)}`;
      if (!ctl.locked() && drawn != mine && colors.has(you.id)) {
        drawn = cards.every((c, build) => rd!.portrait(c, me, build, colors.get(you.id)!))
          ? mine
          : drawn;
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
        rovers,
        third ? me : undefined,
      );
      // The rover's reticle: where its lasers cross along the look, or the ground or wall before it.
      const car = driving ? rovers[wheel] : undefined;
      if (car) {
        const [o, to]: [number, number, number][] = [
          [car.x, car.y, car.z],
          aimOf(car, ctl.yaw, ctl.pitch),
        ];
        const d = to.map((v, k) => (v - o[k]) / ROVER.GUN_AIM) as [number, number, number];
        const t = ray(world, o, d, ROVER.GUN_AIM);
        hud.aim(rd.project(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t));
      } else {
        hud.aim();
      }
    }
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

    hud.title(
      msg || (!open ? 'Connecting…' : !ready ? 'Joining…' : ctl.locked() ? '' : 'Click to play'),
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
