import { tinyFps } from '../src/client';
import type { TinyFps } from '../src/client';
import { localSocket } from '../src/local';
import { MAPS } from '../src/shared/maps';

/** When this page was built or served (vite.config.ts): tabs of another build do not share a local room. */
declare const __BUILD__: string;

const q = new URLSearchParams(location.search);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('form');
const fields = form.elements as unknown as Record<'name' | 'url' | 'skill', HTMLInputElement> &
  Record<'map' | 'bots' | 'mode', RadioNodeList>;
const status = $('status');
/** Shown while playing; the menu the rest of the time. */
const playing = (on: boolean) => {
  ['game', 'bar'].forEach(id => ($(id).hidden = !on));
  $('menu').hidden = on;
};

/** The last choices, so a return to the page starts where it was left. */
const SAVED = 'tiny-fps-setup';
type Setup = {
  name: string;
  map: string;
  bots: string;
  skill: string;
  mode: string;
  url: string;
};
const load = (): Partial<Setup> => {
  try {
    return JSON.parse(localStorage.getItem(SAVED) ?? '{}') as Partial<Setup>;
  } catch {
    return {};
  }
};
const save = () => {
  try {
    localStorage.setItem(
      SAVED,
      JSON.stringify({
        name: fields.name.value.trim(),
        map: fields.map.value,
        bots: fields.bots.value,
        skill: fields.skill.value,
        mode: fields.mode.value,
        url: fields.url.value,
      } satisfies Setup),
    );
  } catch {
    // No storage (a private window): the page still works, it just forgets.
  }
};

/** The bots' levels, `Rules.botSkill` 0 to 7 (bot.ts's `personaOf()`), and what they mean in a fight. */
const LEVELS = [
  'Novice',
  'Average',
  'Experienced',
  'Skilled',
  'Adept',
  'Masterful',
  'Inhuman',
  'Godlike',
];
const FEEL = [
  'They are slow to react and aim badly.',
  'They react in time and aim fairly.',
  'They are quick and accurate, and often dash out of the way of a shot.',
  'They react at once, aim true and dodge almost every shot.',
];
const BOTS: Record<string, string> = {
  0: 'No bots: the teams are the people who join.',
  4: 'Bots fill each team up to 2 players and make way when people join.',
  8: 'Bots fill each team up to 4 players and make way when people join.',
};

let game: TinyFps | undefined;

/** The hints, the server URL and the summary under Play follow the choices, kept for the next visit. */
const sync = () => {
  save();
  const server = fields.mode.value == 'server';
  $('url').hidden = !server;
  // A server plays its own map (MAP) and fills with its own bots (BOTS, BOT_SKILL): the choices
  // here do nothing.
  ($('maps') as HTMLFieldSetElement).disabled = server;
  ($('bots') as HTMLFieldSetElement).disabled = server;
  const none = fields.bots.value == '0';
  // The level waits with no bots, kept for when some come back.
  $('skill').classList.toggle('off', none);
  fields.skill.disabled = none;
  const level = LEVELS[+fields.skill.value];
  $('skill-name').textContent = level;
  $('bots-hint').textContent = server
    ? 'Set by the server.'
    : none
      ? BOTS[0]
      : `${BOTS[fields.bots.value]} ${FEEL[+fields.skill.value >> 1]}`;
  $('mode-hint').textContent = server
    ? 'Join a tiny-fps server. It picks the map and the bots.'
    : 'Open this page in another tab to join the other team.';
  const bots = none
    ? 'no bots'
    : `${level.toLowerCase()} bots ${fields.bots.value == '4' ? '2 v 2' : '4 v 4'}`;
  $('summary').textContent = server
    ? `Capture the flag · on ${fields.url.value || 'a server'}`
    : `${MAPS[fields.map.value].name} · capture the flag · ${bots}`;
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
  // map (MAP) and its bots (BOTS). In a game, the host picks the next map. The character is the
  // game's title screen's to pick (the user, 2026-11-14); ?body=1 still starts as the woman.
  game = tinyFps($('game'), {
    name,
    map,
    body: q.get('body') == '1' ? 1 : 0,
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

form.addEventListener('input', sync);
form.addEventListener('change', sync);
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

// ?name=…&mode=local|server&map=highline|tranquility&body=0|1&bots=0|4|8&skill=0…7&url=… joins
// right away;
// without it, the choices of the last visit.
const was = load();
const pick = <T extends string>(v: string | null | undefined, ok: T[], or: T): T =>
  ok.includes(v as T) ? (v as T) : or;
fields.name.value =
  q.get('name') ?? (was.name || `Player ${Math.floor(Math.random() * 900) + 100}`);
fields.mode.value = pick(q.get('mode') ?? was.mode, ['local', 'server'], 'local');
fields.map.value = pick(q.get('map') ?? was.map, Object.keys(MAPS), 'highline');
fields.url.value = q.get('url') ?? was.url ?? fields.url.value;
fields.bots.value = pick(q.get('bots') ?? was.bots, ['0', '4', '8'], '0');
fields.skill.value = pick(
  q.get('skill') ?? was.skill,
  ['0', '1', '2', '3', '4', '5', '6', '7'],
  '4',
);
sync();
if (q.has('name')) {
  join();
}
