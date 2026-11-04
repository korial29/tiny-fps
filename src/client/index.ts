import { EYE, INTERP_DELAY, MAX_PITCH, PLAYER_H, TICK_HZ } from '../shared/constants';
import { blocked, compile } from '../shared/level';
import { HALL } from '../shared/map';
import { decodeSnapshot, encodeInput, parseText } from '../shared/protocol';
import type { ServerText } from '../shared/protocol';
import type { PlayerInfo, Shot, SocketLike } from '../shared/types';
import { createEffects } from './effects';
import { createInput } from './input';
import { createPredictor } from './predict';
import { createRenderer } from './render';
import type { Renderer } from './render';

export type { PlayerInfo, SocketLike } from '../shared/types';

export interface TinyFpsOptions {
  name: string;
  /** WebSocket URL, e.g. ws://localhost:8787/demo (the path picks the room). */
  url?: string;
  /** Any WebSocket-like socket, e.g. localSocket('room') from '@korial29/tiny-fps/local'. */
  socket?: SocketLike;
}

export type TinyFpsEvent = 'roster' | 'open' | 'close';

export interface TinyFps {
  on(ev: TinyFpsEvent, cb: () => void): void;
  /** Everyone in the room, the own player included. */
  players(): PlayerInfo[];
  /** Closes the socket, stops the loop and removes the canvas. */
  destroy(): void;
}

const lvl = compile(HALL);
const STEP = 1 / TICK_HZ;
/** Steps run in one frame at most: a background tab catches up by this much, not by minutes. */
const MAX_STEPS = 5;

/**
 * Mounts the game in a Shadow DOM inside container: one WebGL2 canvas filling it, a click locks the
 * pointer, the mouse looks, WASD (ZQSD on AZERTY) moves, Space jumps.
 */
export const tinyFps = (container: HTMLElement, opts: TinyFpsOptions): TinyFps => {
  const wrap = document.createElement('div');
  const root = wrap.attachShadow({ mode: 'open' });
  root.innerHTML =
    `<style>:host{display:block;width:100%;height:100%}div{position:relative;width:100%;height:100%;overflow:hidden;background:#000;font:600 14px system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000}` +
    `canvas{display:block;width:100%;height:100%;cursor:pointer}` +
    `i,p,b,em{position:absolute;pointer-events:none;user-select:none;margin:0}` +
    `i{left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px #0008}` +
    `p{top:8px;left:12px}em{left:50%;top:60%;transform:translateX(-50%);font-size:18px;font-style:normal}` +
    `b{transform:translate(-50%,-100%);font-size:12px;white-space:nowrap}[hidden]{display:none}</style>` +
    `<div><canvas></canvas><i></i><p></p><em></em></div>`;
  container.append(wrap);
  const canvas = root.querySelector('canvas')!;
  const count = root.querySelector('p')!;
  const hint = root.querySelector('em')!;
  const screen = root.querySelector('div')!;

  const listeners: Record<TinyFpsEvent, (() => void)[]> = { roster: [], open: [], close: [] };
  const emit = (ev: TinyFpsEvent) => listeners[ev].forEach(cb => cb());

  const predictor = createPredictor(lvl);
  const ctl = createInput(canvas);
  const fx = createEffects();
  /** Others' shots wait INTERP_DELAY: they are drawn that far in the past, and fire with it. */
  const late: { t: number; s: Shot }[] = [];
  let you = -1;
  let rd: Renderer | undefined;
  try {
    rd = createRenderer(canvas, lvl);
  } catch {
    // No WebGL2: stay connected, say so in the hint.
  }
  let roster: PlayerInfo[] = [];
  let colors = new Map<number, string>();
  let names = new Map<number, string>();
  /** Tags above the others, by player id. */
  const tags = new Map<number, HTMLElement>();
  let open = false;
  /** Shown instead of the hint: a closed connection, a full room, no WebGL. */
  let msg = rd ? '' : 'WebGL2 is not available';
  /** The own player is known, and the look angles start from where the host spawned it. */
  let ready = false;
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
        const now = performance.now();
        predictor.snapshot(s, now);
        late.push(...s.shots.filter(sh => sh.id != you).map(sh => ({ t: now, s: sh })));
      }
      return;
    }
    const m = parseText<ServerText>(data);
    if (m?.t == 'roster') {
      roster = m.players;
      colors = new Map(roster.map(p => [p.id, p.color]));
      names = new Map(roster.map(p => [p.id, p.name]));
      predictor.you((you = m.you));
      count.textContent = `Players: ${roster.length}`;
      emit('roster');
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
      const input = predictor.step({ keys: ctl.keys, yaw: ctl.yaw, pitch: ctl.pitch }, now);
      if (open) {
        ws.send(encodeInput(input));
      }
      const shot = predictor.shot();
      const p = shot && predictor.me(1);
      if (shot && p) {
        fx.shot(shot, [p.x, p.y + EYE, p.z], true);
      }
    }

    const me = predictor.me(acc / STEP);
    const others = predictor.others(now);
    const eye: [number, number, number] = me ? [me.x, me.y + EYE, me.z] : [0, 0, 0];
    for (; late.length && late[0].t + INTERP_DELAY <= now; late.shift()) {
      const p = others.find(o => o.id == late[0].s.id);
      if (p) {
        fx.shot(late[0].s, [p.x, p.y + EYE, p.z], false);
      }
    }
    fx.update(me, ctl.keys, Math.min((now - before) / 1000, 0.1));
    if (me && rd) {
      // Bob and shake are for the eye only: the inputs keep sending the real angles.
      const pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, ctl.pitch + fx.shakePitch));
      rd.frame([eye[0], eye[1] + fx.bob, eye[2]], ctl.yaw + fx.shakeYaw, pitch, others, colors, fx);
    }
    const seen = new Set<number>();
    for (const p of others) {
      const top: [number, number, number] = [p.x, p.y + PLAYER_H + 0.3, p.z];
      // Behind a wall the tag would give the player away.
      const at = me && !blocked(lvl, eye, top) ? rd?.project(...top) : undefined;
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
    }
    for (const [id, el] of tags) {
      if (!seen.has(id)) {
        el.remove();
        tags.delete(id);
      }
    }

    const text =
      msg || (!open ? 'Connecting…' : !ready ? 'Joining…' : ctl.locked() ? '' : 'Click to play');
    if (hint.textContent != text) {
      hint.textContent = text;
    }
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
      rd?.destroy();
      ws.onopen = ws.onclose = ws.onmessage = null;
      ws.close();
      document.exitPointerLock();
      wrap.remove();
    },
  };
};
