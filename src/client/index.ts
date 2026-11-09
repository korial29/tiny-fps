import { HP_MAX, LOCK_WIN, PLAYER_H, TICK_HZ } from '../shared/constants';
import { MAPS, mapKey, mapOf } from '../shared/maps';
import { eyeHeight } from '../shared/physics';
import { decodeSnapshot, encodeInput, parseText } from '../shared/protocol';
import type { ServerText } from '../shared/protocol';
import { FLAG, KEY } from '../shared/types';
import type { PlayerInfo, PlayerState, SocketLike, Snapshot } from '../shared/types';
import { build, hidden } from '../shared/world';
import { createAnnouncer } from './announce';
import { createAudio, savedMute, toggleMute } from './audio';
import { createBalls } from './balls';
import { createTracer } from './beams';
import { beats, cues, say } from './beats';
import { createBody } from './body';
import { createCombat, sight } from './combat';
import { createEffects } from './effects';
import { flagDraws } from './flag';
import { createFoley } from './foley';
import { mood } from './face';
import { HUD_CSS, createHud } from './hud';
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
  /** The map's key: 'highline' (the default) or 'tranquility'. It has to be the room's. */
  map?: string;
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
 * air for a second jump), C crouches and slides, a direction key pressed twice dashes.
 */
export const tinyFps = (container: HTMLElement, opts: TinyFpsOptions): TinyFps => {
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
  const hud = createHud(screen);

  const listeners: Record<TinyFpsEvent, (() => void)[]> = { roster: [], open: [], close: [] };
  const emit = (ev: TinyFpsEvent) => listeners[ev].forEach(cb => cb());

  const world = build(mapOf(opts.map));
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
  const tracer = createTracer();
  const balls = createBalls(world);
  const combat = createCombat(world, audio, hud, fx, tracer, ctl, balls);
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
  /** The own player's id and team, from the roster. */
  let you = { id: -1, team: 0 };
  /** The latest snapshot, for the flags and the match; the one before it tells what just happened. */
  let match: Snapshot | undefined;
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
  let last = performance.now();
  let acc = 0;
  let raf = 0;
  let dead = false;

  const ws = opts.socket ?? (new WebSocket(opts.url!) as unknown as SocketLike);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => {
    open = true;
    ws.send(JSON.stringify({ t: 'join', name: opts.name }));
    emit('open');
  };
  ws.onclose = () => {
    open = false;
    msg ||= 'Connection closed';
    emit('close');
  };
  ws.onmessage = ({ data }) => {
    if (typeof data != 'string') {
      const s = decodeSnapshot(data);
      if (s) {
        predictor.snapshot(s, performance.now());
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
      you = { id: m.you, team: roster.find(p => p.id == m.you)?.team ?? 0 };
      predictor.you(you.id, you.team);
      // A room on another map than the one built here: say so, the title screen shows it.
      if (m.map !== undefined && m.map !== mapKey(opts.map)) {
        msg = `This room plays ${MAPS[m.map]?.name ?? m.map}`;
      }
      count.textContent = `Players: ${roster.length}`;
      emit('roster');
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
    fx.update(me, ctl.keys, dt, hit, body.phase);
    hud.hurt(fx.hurt);
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
          flag: !!match?.flags.some(f => f.state === FLAG.CARRIED && f.by == you.id),
          lost,
          from,
          got: !!felt && has(me) > has(felt),
          firing,
        }),
      );
    }
    felt = me && { ...me };
    // A saber lock: the gauge of the tug of war, the own presses against the foe's.
    const foe = me?.lock ? who(me.foe ?? -1) : undefined;
    hud.duel(foe ? ((me!.pushes ?? 0) - (foe.pushes ?? 0)) / LOCK_WIN : undefined);
    body.update(me, dt, fx.kick, canvas.clientWidth / (canvas.clientHeight || 1));
    // The steps sound as the drawn feet land: the own body's now, the others' as last drawn.
    foley.me(me, hit, body.steps);
    foley.others(others, id => rd?.steps(id));
    // The camera moves for the eye only: the inputs keep sending the real height and angles. A
    // cut's twist turns the drawn view a little with the body.
    const cam: [number, number, number] = [eye[0], eye[1] + fx.dy, eye[2]];
    const pitch = ctl.pitch + fx.pitch;
    const view = ctl.yaw + body.spun();
    const look = me && sight(world, eye, cam, ctl.yaw, ctl.pitch, pitch);
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
      rd.frame(
        cam,
        view,
        pitch,
        others,
        colors,
        fx,
        [...gather({ eye: cam, yaw: view, pitch, others, t: now / 1000, ctf }), ...tracer.lights()],
        body,
        ctf,
        tracer,
      );
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
      const at = me && !hidden(world, eye, top) ? rd?.project(...top) : undefined;
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
    );
  };
  raf = requestAnimationFrame(frame);

  return {
    on: (ev, cb) => void listeners[ev].push(cb),
    players: () => roster,
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
