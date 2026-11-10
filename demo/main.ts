import { tinyFps } from '../src/client';
import type { TinyFps } from '../src/client';
import { localSocket } from '../src/local';

const q = new URLSearchParams(location.search);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('form');
const fields = form.elements as unknown as Record<'name' | 'mode' | 'url', HTMLInputElement> & {
  /** The map cards' radios: its value is the checked one's. */
  map: RadioNodeList;
};
const status = $('status');
/** Shown while playing; the menu the rest of the time. */
const playing = (on: boolean) => {
  ['game', 'bar'].forEach(id => ($(id).hidden = !on));
  $('menu').hidden = on;
};

let game: TinyFps | undefined;

const syncMode = () => {
  $('url').hidden = fields.mode.value != 'server';
};

const join = () => {
  const name = fields.name.value.trim();
  const server = fields.mode.value == 'server';
  const url = fields.url.value;
  const map = fields.map.value;
  playing(true);
  // The first map of a new local room; a server has its own (MAP). In a game, the host picks.
  game = tinyFps($('game'), {
    name,
    map,
    ...(server ? { url } : { socket: localSocket('demo', { map }) }),
  });
  status.textContent = server ? `Playing on ${url}` : 'Playing locally';
  game.on('close', () => (status.textContent = 'Disconnected'));
};

const leave = () => {
  game?.destroy();
  game = undefined;
  playing(false);
};

fields.mode.addEventListener('change', syncMode);
form.addEventListener('submit', e => {
  e.preventDefault();
  join();
});
$('leave').addEventListener('click', leave);

// ?name=…&mode=local|server&map=highline|tranquility&url=… joins right away.
fields.name.value = q.get('name') ?? `Player ${Math.floor(Math.random() * 900) + 100}`;
fields.mode.value = q.get('mode') == 'server' ? 'server' : 'local';
fields.map.value = q.get('map') == 'tranquility' ? 'tranquility' : 'highline';
fields.url.value = q.get('url') ?? fields.url.value;
syncMode();
if (q.has('name')) {
  join();
}
