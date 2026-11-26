import type { PlayerInfo, SocketLike } from '../../shared/types';

export type { PlayerInfo, SocketLike } from '../../shared/types';

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
