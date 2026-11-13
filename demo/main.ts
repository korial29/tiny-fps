import { tinyFps } from '../src/client';
import type { TinyFps } from '../src/client';
import { localSocket } from '../src/local';
import { MAPS } from '../src/shared/maps';

/** When this page was built or served (vite.config.ts): tabs of another build do not share a local room. */
declare const __BUILD__: string;

const q = new URLSearchParams(location.search);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('form');
const fields = form.elements as unknown as Record<
  'name' | 'mode' | 'url' | 'body' | 'bots' | 'skill',
  HTMLInputElement
> & {
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
  // A server's bots have its own BOT_SKILL: the level is a local room's.
  $('skill').hidden = fields.mode.value == 'server' || fields.bots.value == '0';
};

const join = () => {
  const name = fields.name.value.trim();
  const server = fields.mode.value == 'server';
  const url = fields.url.value;
  const map = fields.map.value;
  const bots = +fields.bots.value;
  const botSkill = +fields.skill.value;
  playing(true);
  // A local room per map picked and per build of the page: a tab left open on another map, or on
  // an older build, hosted the one room there was, and its map and its rules won over the choice
  // made here (the user, 2026-11-11: always Tranquility whatever I pick). A server has its own
  // map (MAP) and its bots (BOTS). In a game, the host picks the next map.
  game = tinyFps($('game'), {
    name,
    map,
    body: +fields.body.value,
    ...(server
      ? { url }
      : {
          socket: localSocket(`demo-${map}-${bots}-${botSkill}-${__BUILD__}`, {
            map,
            bots,
            botSkill,
          }),
        }),
  });
  status.textContent = server ? `Playing on ${url}` : 'Playing locally';
  game.on('close', () => (status.textContent = 'Disconnected'));
  // Quit, from the game's pause menu: back to this page's menu.
  game.on('quit', leave);
};

const leave = () => {
  game?.destroy();
  game = undefined;
  playing(false);
};

fields.mode.addEventListener('change', syncMode);
fields.bots.addEventListener('change', syncMode);
form.addEventListener('submit', e => {
  e.preventDefault();
  join();
});
$('leave').addEventListener('click', leave);

// A map card's words are the map's own: the game's title screen tells the same.
for (const card of document.querySelectorAll('.map')) {
  const def = MAPS[card.querySelector('input')!.value];
  [def.tag, def.name, def.lore].forEach(
    (text, i) => (card.querySelectorAll('em, strong, p')[i].textContent = text ?? ''),
  );
}

// ?name=…&mode=local|server&map=highline|tranquility&body=0|1&bots=0|4|8&skill=0…7&url=… joins right away.
fields.name.value = q.get('name') ?? `Player ${Math.floor(Math.random() * 900) + 100}`;
fields.mode.value = q.get('mode') == 'server' ? 'server' : 'local';
fields.map.value = q.get('map') == 'tranquility' ? 'tranquility' : 'highline';
fields.url.value = q.get('url') ?? fields.url.value;
fields.body.value = q.get('body') == '1' ? '1' : '0';
fields.bots.value = ['4', '8'].includes(q.get('bots') ?? '') ? q.get('bots')! : '0';
fields.skill.value = /^[0-7]$/.test(q.get('skill') ?? '') ? q.get('skill')! : '4';
syncMode();
if (q.has('name')) {
  join();
}
