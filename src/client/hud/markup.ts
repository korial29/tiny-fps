import { ARMOR_MAX, HP_MAX } from '../../shared/constants';
import { TONES } from '../features';
import { FH, FW } from '../face';
import { COMM } from './format';
import { CAST, CONTROLS, GOAL, MIXES, PAUSE, ROLES, SHOT, TABS, swatch } from './text';

/** The HUD's elements, as createHud() appends them to the screen. */
export const MARKUP =
  `<aside hidden><span class="pm"><strong>PAUSED</strong>${PAUSE.map(t => `<button>${t}</button>`).join('')}</span>` +
  `<main><header><h6>TINY FPS</h6>` +
  TABS.map(
    (t, i) => `<button role="tab" aria-selected="${!i}" tabindex="${i && -1}">${t}</button>`,
  ).join('') +
  `<button class="bk">← Back</button><button><strong></strong></button></header>` +
  `<article role="tabpanel"><fieldset><h4>Character</h4><canvas width="${SHOT[0]}" height="${SHOT[1]}"></canvas><span class="loader">Loading</span><span class="op">` +
  `<span role="radiogroup" aria-label="Body">${CAST.map(c => `<button role="radio">${c}</button>`).join('')}</span>` +
  `<small>Skin</small><span role="radiogroup" aria-label="Skin" class="sw">${TONES.map(
    (t, i) =>
      `<button role="radio" aria-label="Skin ${i + 1}" style="background:${swatch(t)}"></button>`,
  ).join('')}</span>` +
  `<small>Hair</small><span role="radiogroup" aria-label="Hair" class="hc"></span></span>` +
  `<h4>Class</h4><span role="radiogroup" aria-label="Class" class="cl">${ROLES.map(
    ([n, pros, cons, where]) =>
      `<button role="radio"><strong>${n}</strong><span class="p">${pros}</span><span class="c">${cons}</span><span class="w">${where}</span></button>`,
  ).join('')}</span>` +
  `</fieldset><blockquote><h4>Game mode</h4><abbr>CTF</abbr><strong>Capture the flag</strong>${GOAL.map(l => `<span>${l}</span>`).join('')}</blockquote>` +
  `<address><h4>Map</h4><h3></h3><small></small><span></span></address></article>` +
  `<article role="tabpanel" hidden>${CONTROLS.map(
    ([group, rows]) =>
      `<table><caption>${group}</caption>${rows
        .map(
          ([keys, does]) =>
            `<tr><td>${keys
              .split('|')
              .map(k => (/^(\+|\/|or|twice)$/.test(k) ? k : `<kbd>${k}</kbd>`))
              .join(' ')}<td>${does}`,
        )
        .join('')}</table>`,
  ).join('')}</article>` +
  `<article role="tabpanel" class="mx" hidden><h4>Volume</h4>${MIXES.map(
    ([n]) => `<div>${n}<input type="range" min="-40" max="6" step="0.5"><span></span></div>`,
  ).join('')}<button>Reset</button></article></main></aside>` +
  `<del hidden></del><u></u><h5 hidden>Muted (M)</h5>` +
  `<ul>${'<li></li>'.repeat(HP_MAX)}${'<li class=a></li>'.repeat(ARMOR_MAX)}</ul><figure hidden><canvas width="${FW}" height="${FH}"></canvas></figure>` +
  `<dl hidden><svg viewBox="0 0 38 22"><path d="M1 7c3-5 13-7 22-4l7 3 3 1v4l-6 1-4 2-1 1-3 6h-5l2-7-5-1c-6-1-12-3-10-6z"/></svg>` +
  `<svg viewBox="0 0 38 22"><path d="M12 14.4C19 11.6 29 6.4 37 1c-3.6 7-14.4 13.4-24.4 16zM1 20.2l7-6.6 1.6 1.8-7 6.6zM7.6 12.4l3.2-1.4 2 4.6-3.2 1.4z"/></svg>` +
  `<svg class=h viewBox="0 0 38 22"><path d="M1 8h9v7H1zM10 9.4 36 2l-4.6 4.3 2.6-.2L12 12zM10 13.6 36 17l-4.8 1.6 2.4.9L12 15.4z"/><path d="M1 8l7-1v7l-5 2-2-2zM8 7h19v6H8zM12 13h4l-1 6h-4zM27 9h6v2h-6zM33 6.5l5 3.5-5 3.5 1-3.5z"/><path d="M2 21v-4h9l3-5h5v-2h12l3 1.2v3.6L31 16H20l-2 3-4 2zM29 2.6a1.4 1.4 0 1 0 .01 0zM25.2 7.8a1.4 1.4 0 1 0 .01 0zM32.8 7.8a1.4 1.4 0 1 0 .01 0z"/><path d="M19 .5l3.5 4.2 3.9-1.1-.5 5.5 3.6 1.9-4.2 3.5 1.1 3.9-5.5-.5L19 21.5l-3.5-4.2-3.9 1.1.5-5.5L8.5 11l4.2-3.5-1.1-3.9 5.5.5zM19 8a3 3 0 1 0 .01 0z"/></svg><data></data><span></span><small><kbd>1 gun</kbd><kbd>2 katana</kbd><kbd>3 rail</kbd><kbd>4 rifle</kbd><kbd>5 fists</kbd></small></dl>` +
  `<s hidden></s><mark hidden></mark><sup></sup><ins hidden><i></i></ins>` +
  `<nav hidden><span></span><time></time><span></span><small></small><small></small></nav><var hidden></var><i class="hv" hidden><kbd>V</kbd><span></span></i>` +
  `<h1 hidden>FRAGS<span>0</span></h1><label hidden><canvas width="${COMM}" height="${COMM}"></canvas><span></span><i>${'<b></b>'.repeat(5)}</i></label><ol></ol><h2 hidden><span></span><small></small></h2>` +
  `<output hidden></output><samp hidden><var>E</var><span></span></samp><cite hidden><span></span><small>km/h</small></cite><q hidden></q><i class="hl" hidden><b></b><b></b><b></b><small>TRACKING</small></i><dfn hidden></dfn><dfn hidden></dfn><tt hidden></tt><tt hidden></tt>` +
  `<section hidden><h6></h6><strong></strong><table></table><span></span></section>`;
