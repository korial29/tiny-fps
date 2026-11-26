import { mapKey, mapOf } from '../../shared/maps';
import { parseText } from '../../shared/protocol';
import type { ClientText, ServerText } from '../../shared/protocol';
import type { Choice, PlayerInfo, SocketLike } from '../../shared/types';
import { buildOf } from '../../shared/kit';
import { BARE, decor, warmSteps } from '../render';
import type { Decor } from '../render';
import { stepwise } from '../tasks';
import { createLoader } from '../loading';
import { createLobby } from '../lobby';
import { play } from './match';
import type { TinyFps, TinyFpsEvent, TinyFpsOptions } from './types';

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
