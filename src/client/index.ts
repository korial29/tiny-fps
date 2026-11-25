import {
  BOLT,
  EXEC,
  HP_MAX,
  INTERP_DELAY,
  NADE,
  LOCK_WIN,
  PLAYER_H,
  TICK_HZ,
  VEHICLE,
} from '../shared/constants';
import { onScreen, sabering } from '../shared/gun';
import { basis, dot } from './mesh';
import type { Vec3 } from './mesh';
import { mapKey, mapOf } from '../shared/maps';
import { bruise, eyeHeight } from '../shared/physics';
import { FRAG, decodeSnapshot, encodeInput, parseText } from '../shared/protocol';
import type { ClientText, ServerText } from '../shared/protocol';
import { EV, FLAG, KEY, MODE } from '../shared/types';
import type { Choice, PlayerInfo, PlayerState, SocketLike, Snapshot } from '../shared/types';
import { ROLE, buildOf, kitOf, roleOf, rolesOf } from '../shared/kit';
import { glory } from '../shared/tackle';
import { TONES, toneOf } from './features';
import { styleOf } from './hair';
import { shaved } from './skin';
import { AIRS, SONGS, SOUND } from './sfx';
import { gap2 } from '../shared/rover';
import { SHIP, altitude, limits } from '../shared/ship';
import { PHASE, inside } from '../shared/station';
import { build, hidden } from '../shared/world';
import { createAnnouncer } from './announce';
import { TAUNT_LATE, createTaunts, speakerOf } from './taunt';
import { LINE, SAID } from './voice/clips';
import { createAudio, db, savedMute, toggleMute } from './audio';
import { createBalls, onBody } from './balls';
import { createTracer } from './beams';
import { beats, cues, say } from './beats';
import { createBody } from './body';
import { createCrawl } from './crawl';
import { chasePitch, createChase } from './chase';
import { createGloryFx } from './gloryfx';
import { KILLCAM, createKillCam, sees } from './killcam';
import { createCombat, sight, voiceOf } from './combat';
import { createDoors } from './doors';
import { createEffects } from './effects';
import { flagDraws } from './flag';
import { createFoley } from './foley';
import { GLOW, LOOK, PALETTE, FW, FH, mood, sprite } from './face';
import { dashing, felled, strain } from './expression';
import { COMM, GLORY_ACT, HUD_CSS, OUT_HINT, boarding, createHud, kmh } from './hud';
import type { Summary } from './hud';
import { createWatch } from './watch';
import { createInput, WEAPON } from './input';
import { createPredictor } from './predict';
import { gather } from './lights';
import { marks } from './marks';
import { createPacing } from './pacing';
import { brief, goal } from './mission';
import { lamps } from './lamps';
import { packsOf } from './props';
import { BARE, FACE, HEAD, PORTRAIT, createRenderer, decor, warmSteps } from './render';
import type { Decor } from './render';
import { stepwise } from './tasks';
import { STEPS, createLoader } from './loading';
import { createLobby } from './lobby';
import type { Lobby } from './lobby';
import { createWrecks } from './wreck';
import type { createTargeting } from './targeting';
import { targetingPhysics } from './targeting-physics';
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
  /**
   * Opens on the character screen (lobby.ts): the room is joined and the map loads only once its
   * Start is pressed, with the character picked there. Without it, the room is joined at once.
   */
  cast?: boolean;
  /**
   * false: no spoken voice, neither the announcer's nor the players' (taunts, cries, radio). Their
   * sprites (about 190 KB of Opus, or 465 KB of MP3) are then never downloaded. The synth's sounds,
   * the music and the announcer's words on screen stay.
   */
  voices?: boolean;
}

/**
 * quit: the player left from the pause menu (Escape, then Quit); the page decides where he goes.
 * start: the character screen's Start (TinyFpsOptions.cast), the map loading from then on.
 */
export type TinyFpsEvent = 'roster' | 'open' | 'close' | 'quit' | 'start';

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
/** The Hunter's harpoon scope: the view's field of view change in degrees (70 to 18, about 4×) and its ease-in time (s). */
const [SCOPE_FOV, SCOPE_IN] = [-52, 0.18];
/** Metres within which a vehicle shows its health over it: a rover, a ship. */
const NEAR_HULL = [14, 24];
/** Ms after a hard landing during which a loss of health is the fall's, not a foe's: the snapshot's lag. */
const FELL = 500;
/** Frames a second of the menu's character picture: each is a frame of the scene of its own. */
const PREVIEW_HZ = 30;

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
    start: [],
  };
  const emit = (ev: TinyFpsEvent) => listeners[ev].forEach(cb => cb());
  const ws = opts.socket ?? (new WebSocket(opts.url!) as unknown as SocketLike);
  ws.binaryType = 'arraybuffer';
  let map = mapKey(opts.map);
  let roster: PlayerInfo[] = [];
  /** The connection is open, and the last roster as it came: a new scene gets both. */
  let up = false;
  let told: string | undefined;
  let port: SocketLike | undefined;
  let scene: { destroy(): void } | undefined;
  let dead = false;
  /** What the player plays, told in the join: none yet while the character screen shows. */
  let picked: (Choice & { body: number }) | undefined = opts.cast
    ? undefined
    : { body: opts.body ?? 0 };
  const join = () =>
    ws.send(
      JSON.stringify({
        t: 'join',
        name: opts.name,
        ...(picked!.body || Object.keys(picked!).length > 1 ? picked : {}),
      } satisfies ClientText),
    );
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
    const key = map;
    const loader = createLoader(container, mapOf(key));
    let live: { destroy(): void } | undefined;
    /** What the scene is told before it starts: the last roster, then all that comes meanwhile. */
    const early: { data: string | ArrayBuffer }[] = told ? [{ data: told }] : [];
    p.onmessage = ev => early.push(ev);
    // The scene starts once the loading screen is painted: building the map holds the main thread
    // a while. A tab in the background has no frames, and starts after a wait.
    // The map's own scenery comes in its chunk meanwhile, and the renderer's builds run a task at a
    // time: a scene asked for before both are done starts when they are, with the refresh period
    // sampled meanwhile. The city's scenery, or a map's played before, is there at once.
    let look: Decor | undefined;
    /** The renderer's builds are done (warmSteps()), one task each: the tab answers meanwhile. */
    let warm = false;
    let asked: [number | undefined] | undefined;
    const ready = () => {
      if (asked && look && warm) {
        start(...asked);
      }
    };
    const got = (d: Decor) => {
      look = d;
      ready();
    };
    const came = decor(mapOf(key));
    if (came instanceof Promise) {
      void came.then(got, () => got(BARE));
    } else {
      look = came;
    }
    stepwise(
      warmSteps(buildOf(picked ?? {}, mapOf(key))),
      () => {
        warm = true;
        ready();
      },
      () => !live,
    );
    const start = (period?: number) => {
      if (live) {
        return;
      }
      if (!look || !warm) {
        asked = [period ?? asked?.[0]];
        return;
      }
      live = play(
        container,
        key,
        p,
        () => emit('quit'),
        loader.step,
        period,
        !!opts.cast,
        opts.voices !== false,
        look,
      );
      // The game first in its container, the loading screen over it.
      container.append(loader.el);
      if (up) {
        p.onopen?.();
      }
      early.forEach(ev => p.onmessage?.(ev));
    };
    const timers = [setTimeout(start, 250), 0];
    let raf = requestAnimationFrame(first => {
      // Sample a refresh while only the loader is drawing, before WebGL can miss a vsync.
      raf = requestAnimationFrame(next => (timers[1] = setTimeout(() => start(next - first))));
    });
    scene = {
      destroy() {
        cancelAnimationFrame(raf);
        timers.forEach(clearTimeout);
        live?.destroy();
        live = { destroy() {} };
        loader.destroy();
      },
    };
  };
  ws.onopen = () => {
    up = true;
    if (picked) {
      join();
    }
    port?.onopen?.();
    emit('open');
  };
  ws.onclose = () => {
    up = false;
    port?.onclose?.();
    emit('close');
  };
  ws.onmessage = ev => {
    const m = typeof ev.data == 'string' ? parseText<ServerText>(ev.data) : null;
    if (m?.t == 'roster') {
      [told, roster] = [ev.data as string, m.players];
      if (mapKey(m.map) != map) {
        map = mapKey(m.map);
        scene?.destroy();
        mount();
        emit('roster');
        return;
      }
    }
    port?.onmessage?.(ev);
    if (m?.t == 'roster') {
      emit('roster');
    }
  };
  const lobby = opts.cast
    ? createLobby(container, mapOf(map), c => {
        picked = c;
        // Start goes straight into the game, not to the pause menu: its click (or Enter) is the
        // gesture a pointer lock needs, and the game's canvas does not exist yet. The container
        // holds the lock meanwhile; play() moves it to the canvas, which needs no new gesture.
        Promise.resolve(container.requestPointerLock?.()).catch(() => {});
        if (up) {
          join();
        }
        mount();
        emit('start');
      })
    : (mount(), undefined);
  return {
    on: (ev, cb) => void listeners[ev].push(cb),
    players: () => roster,
    destroy() {
      if (dead) {
        return;
      }
      dead = true;
      lobby?.destroy();
      scene?.destroy();
      ws.onopen = ws.onclose = ws.onmessage = null;
      ws.close();
    },
  };
};

/**
 * The game on one map, talking through `ws`: the scene, the HUD, the input, the sound. `progress`
 * hears each step of STEPS (loading.ts) as it starts, then STEPS.length once the first frame is drawn.
 */
const play = (
  container: HTMLElement,
  key: string,
  ws: SocketLike,
  quit = () => {},
  progress: (step: number) => void = () => {},
  period?: number,
  cast = false,
  voices = true,
  look = BARE,
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
    // After the character screen, the pause menu's Character opens that screen again (the user,
    // 2026-11-25), over the paused game, on what the player wears.
    cast
      ? () => {
          recast?.destroy();
          recast = createLobby(screen, world.def, pick, worn);
        }
      : undefined,
  );
  /** The character screen while it is open in the match. */
  let recast: Lobby | undefined;
  /**
   * The player has been in the game: Escape then opens the pause menu. Coming from the character
   * screen he has picked already: the title screen is the pause menu, its first button Play.
   */
  let started = cast;
  let played = false;

  const world = build(mapOf(key));
  let targeting: ReturnType<typeof createTargeting> | undefined;
  if (world.def.rovers?.length || world.def.ships?.length) {
    import('./targeting')
      .then(({ createTargeting }) => (targeting = createTargeting(screen, world, targetingPhysics)))
      .catch(() => {});
  }
  const predictor = createPredictor(world);
  const audio = createAudio(
    undefined,
    voices ? undefined : [],
    SONGS[key],
    voices ? undefined : [],
    undefined,
    AIRS[key],
  );
  audio.mute(savedMute());
  hud.mute(audio.muted);
  hud.frags(0);
  hud.visor(!!world.def.helmets);
  let defaultWeapon: number = WEAPON.GUN;
  const ctl = createInput(canvas, () => hud.mute(toggleMute(audio)));
  // Any gesture lets the sound start: a click or a key in the menu starts its theme, and so does
  // the click that takes the pointer lock.
  for (const e of ['pointerdown', 'keydown', 'click']) {
    wrap.addEventListener(e, () => audio.unlock());
  }
  // The lock taken on Start (tinyFps()) passes to the canvas: the game starts without the menu.
  // The sound too, on the page's activation by that click (where the browser accepts it).
  if (document.pointerLockElement == container) {
    Promise.resolve(canvas.requestPointerLock()).catch(() => {});
    audio.unlock();
  }
  const fx = createEffects();
  const announcer = createAnnouncer();
  /** Whether a player of the roster is a xenomorph: its own sounds (foley, combat, taunts). */
  const beast = (id: number) => roleOf(roster.find(p => p.id == id)?.role, world.def) == ROLE.XENO;
  /** Whether a player fires the Hunter's harpoon. */
  const hunter = (id: number) =>
    roleOf(roster.find(p => p.id == id)?.role, world.def) == ROLE.HUNTER;
  const foley = createFoley(audio, beast);
  /** A player's voice: his body's, a ninja's in Japanese. */
  const speaker = (id: number) => {
    const p = roster.find(q => q.id == id);
    return speakerOf(id, p?.body, roleOf(p?.role, world.def) == ROLE.NINJA);
  };
  const body = createBody(world);
  const crawl = createCrawl();
  const chase = createChase(world);
  const killcam = createKillCam(world);
  /** The own last glory kill's victim, and until when (performance.now()) the kill camera stays on him. */
  let kill = { who: -1, until: 0 };
  /** The killers of executions seen under way, and whether with the fists (no katana in hand): its kill is heard so. */
  const fisted = new Map<number, boolean>();
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
    id => roster.find(p => p.id == id)?.body,
    beast,
    hunter,
  );
  const taunts = createTaunts(
    audio,
    speaker,
    id => roster.find(p => p.id == id)?.team,
    beast,
    hunter,
  );
  const gloryfx = createGloryFx(
    (id, at, gain, rate) => audio.play(id, at, db(gain), rate),
    id => voiceOf(id, roster.find(p => p.id == id)?.body),
    beast,
  );
  /** Each face on the radio, drawn once for his look and colour (a portrait costs two frames). */
  const faces = new Map<string, HTMLCanvasElement>();
  const wrecks = createWrecks(world, { tracer, audio, fx });
  let rd: Renderer | undefined;
  try {
    rd = createRenderer(canvas, world, look);
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
  /** What he wears, the parts he never picked as his id gives them: what the character screen opens on. */
  let worn: Choice & { body: number } = picked;
  /** The own class's health at most (Kit.hp), for the face. */
  let hpMax = HP_MAX;
  let previewActive = false;
  let previewJobs: (() => void)[] = [];
  let previewNext = 0;
  let headKey = '';
  /**
   * The menu's pictures waiting to be drawn, one per frame. frame() draws each before the view,
   * which then takes the canvas back: a picture drawn in a callback of its own after the frame
   * would be what the screen shows, the runner blinking over the game behind the menu.
   */
  const queuePreview = (draw: () => void) => {
    previewJobs.push(draw);
  };
  const pick = (c: Choice & { body: number }) => {
    picked = c;
    ws.send(JSON.stringify({ t: 'body', ...c } satisfies ClientText));
  };
  const avatar = hud.cast(pick, active => {
    previewActive = active;
    if (active) {
      previewNext = 0;
      hud.previewLoading(!!rd);
    }
  });
  /** What the live picture shows: the own id, colour and choice. */
  let drawn = '';
  /** The own player's id and team, from the roster. */
  let you = { id: -1, team: 0 };
  /** The latest snapshot, for the flags and the match; the one before it tells what just happened. */
  let match: Snapshot | undefined;
  /** The balls of the last snapshot, by shooter and id. */
  let seen = new Set<number>();
  /** The result of the match that has just ended, while its end screen shows. */
  let ended: Summary | undefined;
  let colors = new Map<number, string>();
  let names = new Map<number, string>();
  let teams = new Map<number, number>();
  /** Tags above the others, by player id. */
  const tags = new Map<number, HTMLElement>();
  const label = (id: number, el: HTMLElement) => {
    el.textContent = names.get(id) ?? '';
    el.style.color = colors.get(id) ?? '';
  };
  const team = (id: number) => teams.get(id);
  /** The bot view (watch.ts): B looks through a bot's eyes, the next one, then the own again. */
  const botcam = createWatch(screen);
  const onKey = (e: KeyboardEvent) => {
    if (e.code == 'KeyB' && !e.repeat && open) {
      const id = botcam.next(roster.filter(p => p.bot).map(p => p.id));
      ws.send(JSON.stringify({ t: 'watch', id } satisfies ClientText));
    }
  };
  document.addEventListener('keydown', onKey);
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
  const pacing = createPacing(period);
  let last: number | undefined;
  let hunterLock: { id: number; since: number } | undefined;
  /** Where the locked foe's chest is, while the shoulder cannon is locked on: it points there. */
  let lockedAt: [number, number, number] | undefined;
  let hunterLockTone = -1;
  /** The shoulder cannon tracks a foe, not locked yet, this frame: its hum (HUNTER_SEEK) sounds. */
  let tracking = false;
  let rendered: number | undefined;
  /** The harpoon scope's zoom, 0 out to 1 in. */
  let scope = 0;
  /**
   * The Hunter's view of the last frame, for the flash of a switch; and, under a special view, the
   * heart and the failing radio (the user, 2026-11-23).
   */
  let viewed = 0;
  const [heart, hiss] = [audio.loop(SOUND.HEARTBEAT), audio.loop(SOUND.STATIC)];
  /** The shoulder cannon's hum while it tracks a foe, before the lock. */
  const seek = audio.loop(SOUND.HUNTER_SEEK);
  let displayed: number | undefined;
  let acc = 0;
  let raf = 0;
  let dead = false;
  /** The loading step under way (STEPS): the map is built, the room is being joined. */
  let step = 1;
  progress(step);

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
        // little off the pitch of the last so that a salvo does not drone. A new ball of a player
        // with the katana in hand, who fires none, is one his blade sent back: it rings.
        const flying = new Set<number>();
        for (const b of s.balls ?? []) {
          const key = (b.by << 8) | b.id;
          flying.add(key);
          if (seen.has(key) || b.burst) {
            continue;
          }
          const p = s.players.find(q => q.id === b.by);
          const at: [number, number, number] | undefined =
            b.by === you.id ? undefined : [b.x, b.y, b.z];
          if (p?.wield && p.mode !== MODE.RIDE && !b.arc && b.power !== NADE) {
            audio.play(SOUND.SHING, at, -1.9, 1.6);
            audio.play(SOUND.ZAP, at, -8, 1.3);
            rd?.parried(b.by, at ? INTERP_DELAY / 1000 : 0);
            if (!at) {
              body.parried();
            }
          } else if (b.power === BOLT) {
            audio.play(SOUND.BLASTER, [b.x, b.y, b.z], -4.4, 0.92 + 0.16 * ((b.id * 0.618) % 1));
          }
        }
        seen = flying;
        balls.snapshot(s.balls ?? [], you.id, performance.now());
        // An enemy's ball, round or bolt that burst on the own body reddens the view at once, even
        // when the host keeps its point for the next hit.
        const self = s.players.find(p => p.id == you.id);
        if (
          self &&
          !self.down &&
          s.balls?.some(b => roster.find(q => q.id == b.by)?.team != you.team && onBody(b, self))
        ) {
          fx.hurt = 1;
        }
        // A door that starts to open or to shut is heard where it is.
        for (const c of doors.snapshot(s.doors)) {
          audio.play(c.id, c.at, -0.9);
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
            audio.play(c.id, c.at, db(c.gain ?? 1), c.rate);
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
          } else if (beat.kind == 'strike') {
            // The station's lasers come down on every one of the other team.
            for (const p of s.players) {
              if (roster.find(q => q.id == p.id)?.team != beat.team) {
                tracer.strike([p.x, p.y, p.z], world.def.station?.gun);
                tracer.burst([p.x, p.y + 1, p.z], true);
                if (p.id == you.id) {
                  fx.jolt();
                  fx.blind();
                }
              }
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
        for (const q of s.players) {
          if (q.exec === EXEC.KILLER && q.lock) {
            fisted.set(q.id, !q.wield);
          }
        }
      }
      return;
    }
    const m = parseText<ServerText>(data);
    if (m?.t == 'roster') {
      roster = m.players;
      colors = new Map(roster.map(p => [p.id, p.color]));
      names = new Map(roster.map(p => [p.id, p.name]));
      teams = new Map(roster.map(p => [p.id, p.team]));
      tags.forEach((el, id) => label(id, el));
      rd?.wear(
        new Map(roster.map(p => [p.id, buildOf(p, world.def)])),
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
        own ? buildOf(own, world.def) : 0,
        own?.tone === undefined ? undefined : TONES[own.tone],
        roleOf(own?.role, world.def) == ROLE.NINJA,
        roleOf(own?.role, world.def) == ROLE.XENO,
        roleOf(own?.role, world.def) == ROLE.HUNTER,
      );
      // The title screen shows what his id gives where he has picked nothing: his skin and cut as drawn.
      worn = {
        body: build,
        tone: own?.tone ?? TONES.indexOf(toneOf(m.you)),
        hair: own?.hair ?? (build ? styleOf(m.you) : shaved(m.you) ? 0 : undefined),
        role: roleOf(own?.role, world.def),
      };
      hud.wear(build, worn, rolesOf(world.def));
      predictor.you(you.id, you.team, own?.role);
      const kit = kitOf(own?.role, world.def);
      const weapon = kit.katana ? WEAPON.BLADE : WEAPON.GUN;
      if (weapon !== defaultWeapon) {
        ctl.weapon = defaultWeapon = weapon;
      }
      hud.magazines([kit.mag, kit.cap, kit.clip]);
      hud.life(kit.hp);
      [hpMax, ctl.beast] = [kit.hp, kit.xeno];
      ctl.hunter = !!kit.hunter;
      if (!ctl.hunter) {
        ctl.vision = 0;
      }
      // The xenomorph breathes no air: no helmet, so no visor round its view (the user, 2026-11-16).
      hud.visor(!!world.def.helmets && !kit.xeno);
      // No map to pick in the game's menu (the user, 2026-11-13): it is the join page's choice.
      count.textContent = `Players: ${roster.length}`;
    } else if (m?.t == 'frag') {
      const who = (id: number): [string, number] => [
        names.get(id) ?? 'Someone',
        roster.find(p => p.id == id)?.team ?? 0,
      ];
      hud.feed(who(m.by), who(m.who));
      // A glory kill: heard where the victim lies (the user, 2026-11-16).
      if (m.how == FRAG.GLORY) {
        const v = match?.players.find(q => q.id == m.who);
        const at: [number, number, number] | undefined =
          v && m.who != you.id ? [v.x, v.y + 1.6, v.z] : undefined;
        // The xenomorph's bite, or the katana's stroke through the neck; the fists' punch that
        // bursts the head (no katana in the killer's hand) is gloryfx.ts's.
        if (beast(m.by)) {
          audio.play(SOUND.TACKLE, at, 0, 0.6);
          audio.play(SOUND.XENO_PAIN, at, -3.1, 0.5);
        } else if (!fisted.get(m.by)) {
          audio.play(SOUND.SHING, at, 0, 0.6);
          audio.play(SOUND.ZAP, at, -3.1, 0.5);
        }
        if (m.by == you.id) {
          fx.punch();
          kill = { who: m.who, until: performance.now() + KILLCAM.HOLD * 1000 };
        }
      }
      if (m.by == you.id) {
        hud.frags(m.n);
        const line = announcer.frag(m, you, performance.now() / 1000);
        hud.fragged(
          m.how == FRAG.GLORY ? `${who(m.who)[0]}: glory kill!` : `${who(m.who)[0]} killed!`,
          line === undefined ? '' : SAID[line],
        );
        if (line !== undefined) {
          audio.say(line);
        }
        taunts.frag(
          m,
          you.id,
          performance.now() / 1000,
          line === undefined ? undefined : TAUNT_LATE,
        );
      } else {
        taunts.frag(m, you.id, performance.now() / 1000);
      }
    } else if (m?.t == 'end') {
      ended = { score: m.score, players: m.players };
      audio.say(announcer.end(m.score, you.team));
    } else if (m?.t == 'full') {
      msg = 'Room is full';
    } else if (m?.t == 'bot') {
      botcam.take(m);
    }
  };

  const tag = (id: number) => {
    let el = tags.get(id);
    if (!el) {
      tags.set(id, (el = document.createElement('b')));
      label(id, el);
      screen.append(el);
    }
    return el;
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    acc = Math.min(acc + (now - (last ?? now)) / 1000, MAX_STEPS * STEP);
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
      ctl.pilot = predictor.piloting();
      const input = predictor.step(
        { keys: ctl.take(), yaw: ctl.yaw, pitch: ctl.pitch },
        now,
        displayed,
      );
      const next = predictor.me(1);
      combat.step(was, next);
      ctl.track(was, next);
      if (open) {
        ws.send(encodeInput(input));
      }
    }

    if (!pacing.draw(now, !!rd && step === STEPS.length && ctl.locked() && !msg)) {
      return;
    }
    const dt = Math.min((now - (rendered ?? now)) / 1000, 0.1);
    rendered = now;
    // Read the canvas box before the HUD writes invalidate layout.
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    ctl.pilot = predictor.piloting();
    const me = predictor.view(acc / STEP, { keys: ctl.peek(), yaw: ctl.yaw, pitch: ctl.pitch });
    const others = predictor.others(now);
    // The station's strike disintegrated the other team: who of it lies down is not drawn.
    const st = match?.station;
    const struck = st?.phase === PHASE.STRUCK;
    const gone = (id: number) => struck && team(id) != st.team;
    const visible = struck ? others.filter(p => !(p.down && gone(p.id))) : others;
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
    // An ally's taunt, and the one of the enemy who fragged the own player, come over the radio,
    // the speaker's face on its screen; drawn before the frame, which then takes the canvas back.
    for (const { by, s } of taunts.frame(now / 1000, id => {
      const p = others.find(o => o.id == id);
      return p && [p.x, p.y, p.z];
    })) {
      const info = roster.find(p => p.id == by);
      const p = others.find(o => o.id == by);
      const color = colors.get(by);
      let face: HTMLCanvasElement | undefined;
      if (info && p && color && rd) {
        const look = { tone: info.tone, hair: info.hair, role: roleOf(info.role, world.def) };
        const key = `${by}${color}${info.body}${JSON.stringify(look)}`;
        face = faces.get(key);
        if (!face) {
          face = document.createElement('canvas');
          face.width = face.height = COMM;
          if (roleOf(info.role, world.def) == ROLE.HUNTER) {
            face.width = FW;
            face.height = FH;
            const g = face.getContext('2d');
            if (g) {
              const image = g.createImageData(FW, FH);
              const pixels = new Uint32Array(image.data.buffer);
              sprite(GLOW, LOOK.HUNTER).forEach((c, i) => (pixels[i] = PALETTE[c]));
              g.putImageData(image, 0, 0);
              faces.set(key, face);
            }
          } else if (rd.portrait(face, p, info.body ?? 0, color, look, FACE)) {
            faces.set(key, face);
          }
        }
      }
      hud.comm(names.get(by) ?? '', info?.team ?? 0, s, face);
    }
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
    hud.glare(fx.glare);
    const carrying = !!match?.flags.some(f => f.state === FLAG.CARRIED && f.by == you.id);
    const car = driving ? rovers[wheel] : undefined;
    // Anyone but the xenomorph sees the foes weak enough for an execution flash, the katana's or
    // the fists' (the user, 2026-11-17).
    rd?.edge(!!me && !ctl.beast && !me.down);
    // E on a foe close and ahead (weak enough for an execution): the host tries the glory kill before a seat.
    const prey =
      me && !seat && !me.lock
        ? glory(
            me,
            others.filter(p => team(p.id) !== you.team),
            ctl.beast ? world : undefined,
          )
        : undefined;
    hud.rover(
      prey
        ? GLORY_ACT
        : seat
          ? now - since < OUT_HINT * 1000
            ? 'get out'
            : ''
          : ctl.beast
            ? ''
            : boarding(me, rovers, carrying),
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
      let from: number | undefined;
      if (lost && now - thud > FELL) {
        let near = Infinity;
        const [s, c] = [Math.sin(ctl.yaw), Math.cos(ctl.yaw)];
        for (const p of others) {
          if (!p.down && team(p.id) !== you.team) {
            const [dx, dz] = [p.x - me.x, p.z - me.z];
            const d = dx * dx + dz * dz;
            if (d < near) {
              [from, near] = [Math.atan2(dx * c - dz * s, -dx * s - dz * c), d];
            }
          }
        }
      }
      const has = (q?: PlayerState) =>
        q ? +(q.ammo >= 0) + +!!q.blade + +((q.rail ?? -1) >= 0) + +((q.rifle ?? -1) >= 0) : 0;
      firing = ctl.keys & KEY.FIRE && !me.down ? firing + dt : 0;
      hud.face(
        feel(dt, {
          hp: me.hp,
          max: hpMax,
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
    // Not a glory kill's: nobody pushes there.
    const foe = me && sabering(me) && me.wield ? who(me.foe ?? -1) : undefined;
    hud.duel(foe ? ((me!.pushes ?? 0) - (foe.pushes ?? 0)) / LOCK_WIN : undefined);
    body.update(me, dt, fx.kick, width / (height || 1));
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
    // Its breath in a helmet: never the xenomorph's, who wears none.
    if (world.def.helmets && !ctl.beast) {
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
    // A glory kill of the own player's is watched from outside (killcam.ts): the xenomorph's lock
    // on its prey, then the kill a moment longer, the katana's too (the user, 2026-11-16).
    const victim =
      me && !driving
        ? others.find(p =>
            (ctl.beast && me.lock && !me.wield) || (me.lock && me.exec === EXEC.KILLER)
              ? p.id == me.foe
              : p.id == kill.who && now < kill.until,
          )
        : undefined;
    const watch = killcam.frame(
      me && victim
        ? [
            [me.x, me.y, me.z],
            [victim.x, victim.y, victim.z],
          ]
        : undefined,
      ctl.yaw,
      cam,
      dt,
    );
    const k = Math.max(shot.k, watch.k);
    hud.outside(watch.k > 0);
    rd?.vision(sees(ctl.beast, watch.k));
    const hunterMode = ctl.hunter ? ctl.vision : 0;
    const hunterTargets = others.filter(
      p =>
        team(p.id) !== you.team &&
        !p.down &&
        // Thermal shows the humans (marines, ninjas, astronauts), the alien scan the xenomorphs
        // (the user, 2026-11-23); neither shows another Hunter.
        (hunterMode === 1 ? !beast(p.id) && !hunter(p.id) : hunterMode === 2 && beast(p.id)),
    );
    // The thermal view shows the xenomorphs cold, all in blue (the user, 2026-11-23).
    const cold =
      hunterMode === 1 ? others.filter(p => team(p.id) !== you.team && !p.down && beast(p.id)) : [];
    rd?.hunterVision(hunterMode, hunterTargets, cold);
    // Watching a bot (B), the view is its eyes', and the own player is drawn as one of the others.
    const spy = botcam.id === undefined ? undefined : others.find(p => p.id == botcam.id);
    const third = k > 0 || !!spy;
    ctl.canScope =
      !!me &&
      ctl.hunter &&
      ctl.weapon === WEAPON.GUN &&
      !third &&
      !driving &&
      !me.down &&
      !me.lock &&
      !me.wield &&
      !me.rifled &&
      !me.railed &&
      !me.fists &&
      me.ammo >= 0;
    if (!ctl.canScope) {
      ctl.scoped = false;
    }
    // The harpoon's scope eases in over SCOPE_IN s and out twice as fast; its overlay and the slower
    // look come with the zoom's second half.
    scope = Math.max(0, Math.min(1, scope + (ctl.scoped ? dt / SCOPE_IN : (-2 * dt) / SCOPE_IN)));
    const scoped = scope > 0.5;
    const alive = !!me && !me.down;
    hud.hunterVision(['', 'THERMAL', 'ALIEN SCAN'][hunterMode], scoped, ctl.hunter && alive);
    if (hunterMode != viewed && alive) {
      audio.play(SOUND.HUNTER_FLASH, undefined, -2);
    }
    viewed = hunterMode;
    const special = hunterMode > 0 && alive && !third;
    heart.set(special ? 1 : 0, 1);
    seek.set(tracking ? 0.6 : 0, 1);
    hiss.set(special ? 0.32 : 0, 1);
    // The music gives way to the visions' bed, the heartbeat and the static (the user, 2026-11-23).
    audio.hush(special);
    const pov: [number, number, number] = spy
      ? [spy.x, spy.y + eyeHeight(spy), spy.z]
      : watch.k
        ? watch.at
        : shot.at;
    // On a wall the xenomorph's view turns over onto it, its floor (crawl.ts).
    crawl.update(me, dt);
    const [turned, tilted, roll] = crawl.view(
      ctl.yaw + body.spun() * (1 - k),
      shot.pitch,
      fx.roll * (1 - k),
    );
    // The shortest way round from the eye's look to the kill camera's.
    const swing = Math.atan2(Math.sin(watch.yaw - turned), Math.cos(watch.yaw - turned));
    const view = spy ? spy.yaw : turned + swing * watch.k;
    const pitch = spy ? spy.pitch : tilted + (watch.pitch - tilted) * watch.k;
    const lens = spy
      ? fx
      : third
        ? { ...fx, roll, fov: fx.fov * (1 - k) + shot.fov }
        : { ...fx, roll, fov: fx.fov + (SCOPE_FOV - fx.fov) * scope * scope * (3 - 2 * scope) };
    // The driver is unarmed and his body is the renderer's to draw whole: no sight, no muzzle.
    const look = me && !third ? sight(world, eye, cam, ctl.yaw, ctl.pitch, pitch) : undefined;
    if (look) {
      // Locked on, the shoulder cannon points at the foe (at the last frame's place of him).
      const [r, u, f] = basis(ctl.yaw, pitch);
      const d = lockedAt?.map((v, i) => v - cam[i]);
      body.aim(d ? [dot(d as Vec3, r), dot(d as Vec3, u), dot(d as Vec3, f)] : look.local);
    }
    // The glory kills' sounds, on their locks' ticks (gloryfx.ts).
    gloryfx.frame(me ? [me, ...others] : others);
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
    if (me?.down && gone(you.id)) {
      hud.down(fx.lie, st!.left, 'DISINTEGRATED');
    }
    // The vehicles as drawn: their damage arcs, blows up and falls apart on the way (wreck.ts).
    // After the tracer's update of this frame: a bolt it adds is drawn at least once at any rate.
    const shown = wrecks.frame(rovers, dt, eye);
    // A message for the title screen (no WebGL, a closed connection, a full room) ends the loading.
    if (msg && step < STEPS.length) {
      progress((step = STEPS.length));
    }
    // Loading: the portraits in a frame, the world in the next, each frame a step of the bar. The
    // first ones build the armour, seconds of it; the bar goes on on the compositor meanwhile.
    if (me && rd && step == 1 && colors.has(you.id)) {
      progress((step = 2));
      return;
    }
    if (me && rd) {
      // A new look's first picture and the haircut samples render one at a time between frames;
      // the selectors stay responsive while they warm up. Then the picture moves on in the frame.
      const mine = !ctl.locked() && `${you.id}${colors.get(you.id)}${JSON.stringify(picked)}`;
      /** Whether this frame drew the picture again: then no other picture waits its turn in it. */
      let posed = false;
      if (mine && previewActive && colors.has(you.id) && drawn === mine && now >= previewNext) {
        // Drawn: the renderer moves his runner on each frame (render.ts, posed), before this
        // frame takes the canvas back. At most PREVIEW_HZ: the menu's picture is small.
        // From the time it was due, not the frame's: at 60 frames a second every second one.
        previewNext = Math.max(previewNext, now - 1000 / PREVIEW_HZ) + 1000 / PREVIEW_HZ;
        const look = { ...picked, role: roleOf(picked.role, world.def) };
        posed = rd.portrait(avatar, me, picked.body, colors.get(you.id)!, look, PORTRAIT);
      } else if (
        mine &&
        previewActive &&
        colors.has(you.id) &&
        drawn !== mine &&
        !previewJobs.length
      ) {
        const color = colors.get(you.id)!;
        const look = { ...picked, role: roleOf(picked.role, world.def) };
        hud.previewLoading(true);
        queuePreview(() => {
          const current =
            !ctl.locked() && `${you.id}${colors.get(you.id)}${JSON.stringify(picked)}`;
          if (!previewActive || current !== mine) {
            return;
          }
          if (rd!.portrait(avatar, me, picked.body, color, look, PORTRAIT)) {
            drawn = mine;
            hud.previewLoading(false);
          }
        });
      }
      if (mine && drawn === mine && previewActive && !world.def.helmets) {
        const color = colors.get(you.id)!;
        const look = { ...picked, role: roleOf(picked.role, world.def) };
        const hairKey = mine;
        if (
          hairKey !== headKey &&
          look.role !== ROLE.XENO &&
          look.role !== ROLE.HUNTER &&
          look.role !== ROLE.NINJA
        ) {
          headKey = hairKey;
          hud.heads().forEach((picture, hair) =>
            queuePreview(() => {
              const current =
                !ctl.locked() && `${you.id}${colors.get(you.id)}${JSON.stringify(picked)}`;
              if (previewActive && current === mine) {
                rd!.portrait(picture, me, picked.body, color, { ...look, hair }, HEAD);
              }
            }),
          );
        }
      }
      if (previewActive && !posed) {
        previewJobs.shift()?.();
      }
      // The character screen open in the match: its picture by this renderer, before the view too.
      recast?.paint(now, (into, c, shot) =>
        rd!.portrait(into, me, buildOf(c, world.def), colors.get(you.id) ?? '', c, shot),
      );
      if (step == 2) {
        progress((step = 3));
        return;
      }
      const painted = rd.frame(
        pov,
        view,
        pitch,
        spy ? visible.filter(p => p !== spy) : visible,
        colors,
        lens,
        [
          ...gather({ eye: pov, yaw: view, pitch, others: visible, t: now / 1000, ctf }),
          ...(world.def.station
            ? lamps(world.def.station, pov, st?.phase === PHASE.ARMED, now / 1000)
            : []),
          ...tracer.lights(),
        ],
        third || scoped ? undefined : body,
        ctf,
        tracer,
        shown,
        // Not while the camera is still in the head: it would see the inside of it.
        k > 0.2 || spy ? me : undefined,
        v => {
          doors.draw(v, pov, dt);
          wrecks.draw(v);
        },
        { width, height, now },
      );
      if (painted) {
        displayed = predictor.viewTick(now);
      }
      if (step < STEPS.length) {
        progress((step = STEPS.length));
      }
      hud.aim(
        targeting?.frame(
          car?.ship && (car.wreck || me.down || spy || match?.over) ? undefined : car,
          ctl,
          pov,
          canvas.width / canvas.height,
          rd.project,
          rovers,
          others,
          you.team,
          team,
        ),
      );
      tracking = false;
      const laserSelected =
        ctl.hunter && ctl.weapon === WEAPON.RAIL && !third && !me.down && !driving;
      const chest = (p: PlayerState): [number, number, number] => [
        p.x,
        p.y + eyeHeight(p) * 0.65,
        p.z,
      ];
      // The lock keeps its foe while he is on the screen, as the host's does (onScreen()); once he
      // leaves it, it is lost (the user, 2026-11-23).
      let target = laserSelected ? others.find(p => p.id === hunterLock?.id) : undefined;
      if (
        target &&
        (target.down ||
          Math.hypot(...chest(target).map((v, i) => v - pov[i])) >= 80 ||
          !onScreen(pov, view, pitch, chest(target)))
      ) {
        target = undefined;
      }
      if (!target) {
        hunterLock = undefined;
        hunterLockTone = -1;
      }
      if (laserSelected && !target) {
        const cp = Math.cos(pitch);
        const look: [number, number, number] = [
          -Math.sin(view) * cp,
          Math.sin(pitch),
          -Math.cos(view) * cp,
        ];
        let best = 0.985;
        for (const foe of others) {
          if (foe.down || team(foe.id) === you.team) {
            continue;
          }
          const point = chest(foe);
          const delta = point.map((v, i) => v - pov[i]);
          const distance = Math.hypot(...delta);
          const alignment = distance
            ? delta.reduce((sum, v, i) => sum + (v / distance) * look[i], 0)
            : 1;
          if (distance < 80 && alignment > best && !hidden(world, pov, point)) {
            best = alignment;
            target = foe;
          }
        }
        if (target) {
          hunterLock = { id: target.id, since: now };
          audio.play(SOUND.HUNTER_TRACK, undefined, -2, 1);
        }
      }
      const targetPoint = target ? rd.project(...chest(target)) : undefined;
      lockedAt = undefined;
      if (!target || !hunterLock || !targetPoint) {
        hud.hunterAim(laserSelected ? [0.5, 0.5] : undefined, 0, now);
      } else {
        const progress = Math.min(1, (now - hunterLock.since) / 3000);
        // Tracking, the cannon hums (HUNTER_SEEK, below) as the triangles close in; locked, its tone
        // (the user, 2026-11-23).
        tracking = progress < 1;
        if (progress >= 1 && hunterLockTone !== target.id) {
          audio.play(SOUND.HUNTER_LOCK, undefined, 1, 1);
          hunterLockTone = target.id;
        }
        // Locked, the cannon turns to follow him and its shots go at him.
        lockedAt = progress >= 1 ? chest(target) : undefined;
        hud.hunterAim(targetPoint, progress, now);
      }
      combat.lock(lockedAt);
      botcam.draw(rd.project, id => names.get(id) ?? '?');
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
    // The orbital mission: to a pilot, to who is in the station, to everyone while a strike is armed.
    const def = world.def.station;
    const aim =
      me && def ? brief(st, you.team, !!car?.ship, inside(def, me.x, me.y, me.z)) : undefined;
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
              goal: aim?.to && { kind: aim.to, at: goal(world.def.station!, aim.to) },
            })
          : [],
      );
      hud.mission(aim?.text, aim?.hot);
      // A match that is over shows its result until the next one; its text arrives with the snapshot that says so.
      hud.end(match.over ? ended : undefined, match.clock);
    }
    const seen = new Set<number>();
    for (const p of others) {
      const top: [number, number, number] = [p.x, p.y + PLAYER_H + 0.3, p.z];
      // Behind a wall the tag would give the player away.
      // Nor is the tag of one disintegrated shown.
      const at =
        me && !(p.down && gone(p.id)) && !hidden(world, pov, top) ? rd?.project(...top) : undefined;
      const el = tag(p.id);
      seen.add(p.id);
      el.toggleAttribute('hidden', !at);
      if (at) {
        el.style.left = at[0] * 100 + '%';
        el.style.top = at[1] * 100 + '%';
      }
    }
    for (const [id, el] of tags) {
      if (!seen.has(id)) {
        el.remove();
        tags.delete(id);
      }
    }

    played ||= ctl.locked();
    started ||= played;
    // The menus' theme while the menu shows, the map's music in the game.
    audio.menu(!ctl.locked());
    hud.paused(started, !played);
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
      previewJobs = [];
      document.removeEventListener('keydown', onKey);
      botcam.destroy();
      recast?.destroy();
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
