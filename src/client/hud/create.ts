import {
  GUN_MAG,
  HP_MAX,
  RAIL_CAP,
  RAIL_MAX,
  NADE_MAX,
  RIFLE_CLIP,
  TEAM_COLOR,
  TEAM_NAME,
  VEHICLE,
} from '../../shared/constants';
import { SHIP } from '../../shared/ship';
import { FLAG } from '../../shared/types';
import type { Choice } from '../../shared/types';
import { LEVELS, mix } from '../audio';
import { slotted, WEAPON } from '../input';
import { ROLE } from '../../shared/kit';
import { FH, FW, LOOK, PALETTE, sprite } from '../face';
import { createSignal, scramble } from '../signal';
import {
  BANNER_MS,
  COMM,
  COMM_TAIL,
  FEED_MAX,
  FEED_MS,
  FRAG_MS,
  HIT_MS,
  clock,
  height,
  warning,
} from './format';
import { MARKUP } from './markup';
import { GLORY_ACT, HAIR_NAMES, HEAD_PX, MIXES, PAUSE } from './text';
import type { Hud, Summary } from './types';

/** The beats (radians a second) of the shoulder cannon's three tracking triangles: out of step. */
const AIM_BEAT = [2.3, 3.4, 2.8];
/** What a marker's distance reads after, by its kind. */
const LABEL = { flag: '', base: 'Base ', station: 'Station ', post: 'Command post ' };

/**
 * Appends the HUD to `screen`, whose stylesheet has HUD_CSS. `play` is the title screen's button:
 * the click that starts the game (the panel takes its other clicks, the view round it plays too).
 * `recast`: what the pause menu's Character opens instead of the panel's part (the whole-page screen).
 */
export const createHud = (
  screen: HTMLElement,
  play = () => {},
  quit = () => {},
  recast?: () => void,
): Hud => {
  screen.insertAdjacentHTML('beforeend', MARKUP);
  const one = <T extends HTMLElement>(sel: string) => screen.querySelector<T>(sel)!;
  const [muted, menu] = ['h5', 'aside'].map(t => one(t));
  let lastVitals: Parameters<Hud['vitals']> | undefined;
  let lastHunter = false;
  let mags = [GUN_MAG, RAIL_CAP, RIFLE_CLIP];
  const [name, tag, lore, status] = ['h3', 'address small', 'address>span', 'header strong'].map(
    t => one(`aside ${t}`),
  );
  const all = (sel: string) => [...menu.querySelectorAll<HTMLElement>(sel)];
  const [tabs, panels, groups] = ['[role=tab]', 'article', '[role=radiogroup]'].map(all);
  let activePanel = 0;
  let previewShown = false;
  let previewState: ((active: boolean) => void) | undefined;
  const previewActive = () => {
    const active = !menu.hidden && activePanel === 0 && menu.dataset.v !== 'pause';
    if (active !== previewShown) {
      previewShown = active;
      previewState?.(active);
    }
  };
  /** The one of `list` that is on, by its ARIA state `attr`: it alone is in the Tab order, the arrows go to the others. */
  const turn = (list: HTMLElement[], attr: string, on: number) =>
    list.forEach((el, i) => {
      el.setAttribute(attr, `${i == on}`);
      el.tabIndex = i == on ? 0 : -1;
    });
  /** The arrows over `list` go to the next one or the one before, round, which `go` then takes. */
  const arrows = (list: HTMLElement[], go: (i: number) => void) =>
    list.forEach((el, i) => {
      el.onclick = () => go(i);
      el.onkeydown = e => {
        const d = +/^Arrow(Down|Right)/.test(e.code) - +/^Arrow(Up|Left)/.test(e.code);
        if (d) {
          e.preventDefault();
          const to = (i + d + list.length) % list.length;
          go(to);
          list[to].focus();
        }
      };
    });
  arrows(tabs, i => {
    activePanel = i;
    turn(tabs, 'aria-selected', i);
    panels.forEach((p, k) => (p.hidden = k != i));
    previewActive();
  });
  one('header>:last-child').onclick = play;
  // The pause menu: what it shows (data-v): the menu, or the part of the panel it opened.
  let started = false;
  const view = (v: string) => {
    menu.dataset.v = v;
    tabs[Math.max(0, ['character', 'controls', 'audio'].indexOf(v))].click();
  };
  const paused = one('.pm strong');
  const [resume, controls, character, sound, leave] = [
    ...menu.querySelectorAll<HTMLElement>('.pm button'),
  ];
  resume.onclick = play;
  controls.onclick = () => view('controls');
  character.onclick = recast ?? (() => view('character'));
  sound.onclick = () => view('audio');
  leave.onclick = quit;
  // The Audio panel: each slider sets its bus live; Reset gives back the mix as made.
  const sliders = all('.mx input') as HTMLInputElement[];
  const levels = () =>
    sliders.forEach((el, k) => {
      el.value = `${LEVELS[MIXES[k][1]]}`;
      el.nextElementSibling!.textContent = `${LEVELS[MIXES[k][1]].toFixed(1)} dB`;
    });
  sliders.forEach(
    (el, k) =>
      (el.oninput = () => {
        mix(MIXES[k][1], +el.value);
        levels();
      }),
  );
  one('.mx button').onclick = () => {
    mix();
    levels();
  };
  levels();
  one('.bk').onclick = () => view('pause');
  // The character's choice, in the order of its groups: body, skin, haircut, class.
  const KEYS = ['body', 'tone', 'hair', 'role'] as const;
  let picked: Choice & { body: number } = { body: 0 };
  let chose = (_: Choice & { body: number }) => {};
  const radios = (k: number) => [...groups[k].children] as HTMLButtonElement[];
  /** The woman's haircuts or the man's. */
  const cuts = (body: number) =>
    groups[2].replaceChildren(
      ...HAIR_NAMES[body].map(n => {
        const b = document.createElement('button');
        b.setAttribute('role', 'radio');
        b.innerHTML = `<canvas width="${HEAD_PX}" height="${HEAD_PX}"></canvas>${n}`;
        return b;
      }),
    );
  /** Each group's pick lit and in the Tab order; with none, its first is. */
  const lit = () => {
    KEYS.forEach((k, g) => {
      const on = picked[k] ?? -1;
      turn(radios(g), 'aria-checked', on);
      radios(g)[0].tabIndex = on < 0 ? 0 : radios(g)[0].tabIndex;
    });
    // The xenomorph has no body, skin or haircut to pick (the user, 2026-11-16): one creature.
    const fixedLook = picked.role == ROLE.XENO || picked.role == ROLE.HUNTER;
    [fixedLook, fixedLook, fixedLook || picked.role == ROLE.NINJA].forEach((h, g) => {
      groups[g].hidden = h;
      // The labels over the skin and the haircut go with them.
      if (g) {
        (groups[g].previousElementSibling as HTMLElement).hidden = h;
      }
    });
  };
  const choose = (g: number, i: number) => {
    const b = radios(g)[i];
    if (!b || b.disabled || b.getAttribute('aria-checked') == 'true') {
      return;
    }
    picked = { ...picked, [KEYS[g]]: i };
    if (g == 0) {
      // Another body: its own haircuts, his id's until he picks one.
      delete picked.hair;
      cuts(i);
    }
    lit();
    chose(picked);
  };
  groups.forEach((group, g) => {
    group.onclick = e => {
      const b = (e.target as Element).closest('[role=radio]');
      choose(g, radios(g).indexOf(b as HTMLButtonElement));
    };
    group.onkeydown = e => {
      const d = +/^Arrow(Down|Right)/.test(e.code) - +/^Arrow(Up|Left)/.test(e.code);
      const all = radios(g);
      const at = all.indexOf(e.target as HTMLButtonElement);
      if (d && at >= 0) {
        e.preventDefault();
        // The next one the map offers, round.
        let to = at;
        do {
          to = (to + d + all.length) % all.length;
        } while (all[to].disabled && to != at);
        choose(g, to);
        all[to].focus();
      }
    };
  });
  cuts(0);
  lit();
  const set = (el: HTMLElement, text: string) => el.textContent != text && (el.textContent = text);
  const bar = one('nav');
  const [red, time, blue] = [...bar.querySelectorAll<HTMLElement>('span, time')];
  const [redFlag, blueFlag] = [...bar.querySelectorAll<HTMLElement>('small')];
  const pips = [...one('ul').querySelectorAll('li')];
  const plates = pips.splice(HP_MAX);
  /** As many health pips as `max`, before the armour's. */
  const pipsOf = (max: number) => {
    lastVitals = undefined;
    while (pips.length < max) {
      const li = document.createElement('li');
      plates[0].before(li);
      pips.push(li);
    }
    pips.splice(max).forEach(li => li.remove());
  };
  const [life, ammo, marker, fallen] = [one('ul'), one('dl'), one('s'), one('mark')];
  const [rope, knot] = [one('ins'), one('ins i')];
  const [count, spare, slots] = [one('data'), one('dl span'), one('dl small')];
  let ticker: ReturnType<typeof setTimeout> | undefined;
  const [frame, mug] = [one('figure'), one<HTMLCanvasElement>('figure canvas')];
  let pen: CanvasRenderingContext2D | null | undefined;
  let shown = -1;
  /** The own player's face (LOOK in face.ts): the man's, the woman's, the xenomorph's head. */
  let fem = 0;
  const banner = one('output');
  const [prompt, act, meter, speed] = ['samp', 'samp span', 'cite', 'cite span'].map(t => one(t));
  const vignette = one('u');
  const light = one('sup');
  const rim = one('del');
  const mission = one('var');
  const vision = one('i.hv');
  const visionName = one('i.hv span');
  const aim = one('q');
  const hunterSight = one('i.hl');
  const [panel, warn] = screen.querySelectorAll<HTMLElement>('dfn');
  const bars = screen.querySelectorAll<HTMLElement>('tt');
  const end = one('section');
  const [title, score, next] = ['h6', 'strong', 'span'].map(t =>
    end.querySelector<HTMLElement>(t)!,
  );
  const table = end.querySelector('table')!;
  const pins: HTMLElement[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const [tally, list, notice] = [one('h1'), one('ol'), one('h2')];
  const [victim, award] = [...notice.children] as HTMLElement[];
  let shout: ReturnType<typeof setTimeout> | undefined;
  let radio: ReturnType<typeof setTimeout> | undefined;
  /** The radio screen's frame request. */
  let tuned = 0;
  /** The summary the end screen's table was built from. */
  let built: Summary | undefined;
  const tint = (el: HTMLElement, team: number) => (el.style.color = TEAM_COLOR[team]);
  [red, redFlag].forEach(el => tint(el, 0));
  [blue, blueFlag].forEach(el => tint(el, 1));
  return {
    title(text, map, kind = '', story = '') {
      if (!text && !menu.hidden) {
        // A tab or a card that kept the focus would take the game's Space and Enter.
        menu.querySelector<HTMLElement>(':focus')?.blur();
      }
      if (menu.hidden && text && started) {
        view('pause');
      }
      menu.toggleAttribute('hidden', !text);
      previewActive();
      set(name, map);
      set(tag, kind);
      set(lore, story);
      set(status, text);
    },
    paused(on, fresh = false) {
      if (on != started && !on) {
        view('');
      }
      started = on;
      set(resume, fresh ? 'Play' : PAUSE[0]);
      set(paused, fresh ? 'READY' : 'PAUSED');
    },
    heads: () => [...groups[2].querySelectorAll('canvas')],
    cast(pick, preview) {
      chose = pick;
      previewState = preview;
      previewActive();
      return groups[0].closest('fieldset')!.querySelector('canvas')!;
    },
    previewLoading(loading) {
      one<HTMLElement>('.loader').hidden = !loading;
    },
    magazines(sizes) {
      mags = sizes;
      lastVitals = undefined;
    },
    life: pipsOf,
    mute: on => (muted.hidden = !on),
    match(m, who) {
      bar.toggleAttribute('hidden', false);
      set(red, `${TEAM_NAME[0].toUpperCase()} ${m.score[0]}`);
      set(blue, `${m.score[1]} ${TEAM_NAME[1].toUpperCase()}`);
      set(time, m.over ? 'END' : clock(m.clock));
      m.flags.forEach((f, k) => {
        const state =
          f.state === FLAG.CARRIED
            ? `taken by ${who(f.by)}`
            : f.state === FLAG.DROPPED
              ? `dropped ${f.left}s`
              : 'home';
        set(k ? blueFlag : redFlag, `${TEAM_NAME[k]} flag: ${state}`);
      });
    },
    marks(list) {
      while (pins.length < list.length) {
        const el = document.createElement('em');
        el.innerHTML = '<span></span><small></small>';
        pins.push(el);
        screen.append(el);
      }
      pins.splice(list.length).forEach(el => el.remove());
      list.forEach((m, i) => {
        const el = pins[i];
        el.style.left = `${m.x * 100}%`;
        el.style.top = `${m.y * 100}%`;
        el.style.color = m.team < 0 ? '#ffb347' : TEAM_COLOR[m.team];
        const [arrow, text] = [el.children[0] as HTMLElement, el.children[1] as HTMLElement];
        // Over its target a mark points down at it; at the edge it points the way to turn.
        arrow.style.transform = m.arrow === undefined ? '' : `rotate(${m.arrow}rad)`;
        set(arrow, m.arrow === undefined ? '▼' : '▲');
        set(text, `${LABEL[m.kind]}${m.text}`);
      });
    },
    mission(text = '', hot = false) {
      mission.toggleAttribute('hidden', !text);
      mission.classList.toggle('hot', hot);
      set(mission, text);
    },
    hunterVision(text = '', scoped = false, hint = false) {
      screen.classList.toggle('scoped', scoped);
      vision.toggleAttribute('hidden', !text && !hint);
      vision.classList.toggle('idle', !text);
      set(visionName, text || 'VISION');
    },
    visor: on => {
      rim.hidden = !on;
      // Under a space helmet no haircut shows: no pictures of them.
      menu.classList.toggle('hm', on);
    },
    hurt(level) {
      const v = level < 0.01 ? '' : `${Math.min(1, level)}`;
      if (vignette.style.opacity != v) {
        vignette.style.opacity = v;
      }
    },
    glare(level) {
      const k = Math.min(1, level);
      const v = k < 0.01 ? '' : `${Math.min(1, 2 * k)}`;
      if (light.style.opacity != v) {
        light.style.opacity = v;
        light.style.setProperty('--w', v && `${(100 * k).toFixed(1)}%`);
      }
    },
    vitals(...values) {
      const hunter = picked.role === ROLE.HUNTER;
      if (
        hunter === lastHunter &&
        lastVitals?.length === values.length &&
        values.every((v, i) => v === lastVitals![i])
      ) {
        return;
      }
      lastVitals = values;
      lastHunter = hunter;
      const [
        hp,
        rounds,
        blade = false,
        wield = false,
        rail = -1,
        railed = false,
        loaded,
        swapping = false,
        rifle = -1,
        rifled = false,
        nades = 0,
        armor = 0,
        fists = false,
        sided = false,
        other = -1,
      ] = values;
      pips.forEach((li, i) => li.classList.toggle('e', i >= hp));
      plates.forEach((li, i) => li.classList.toggle('e', i >= armor));
      life.classList.toggle('low', hp <= 1);
      const have = [rounds >= 0, blade, rail >= 0, rifle >= 0];
      const k = !fists && !railed && !rifled && blade && (wield || !have[0]);
      const n = rifled ? rifle : railed ? rail : rounds;
      ammo.hidden = !have.some(Boolean) && !fists;
      ammo.classList.toggle('b', fists);
      ammo.classList.toggle('k', k);
      ammo.classList.toggle('r', railed);
      ammo.classList.toggle('f', rifled && !hunter);
      const m = Math.max(loaded ?? n, 0);
      // The Hunter's shoulder cannon and disc spend nothing: no count, never empty.
      const cannon = hunter && (railed || rifled);
      ammo.classList.toggle('e', !k && !m && !cannon);
      ammo.classList.toggle('w', swapping);
      // The Hunter's glyph, by his slot: the blades, the harpoon, the cannon, the disc.
      const glyph = k ? 0 : railed ? 2 : rifled ? 3 : 1;
      // His pistol counts as the marine's gun, with the gun's glyph.
      ammo.classList.toggle('h', hunter && !sided);
      for (let i = 0; i < 4; i++) {
        ammo.classList.toggle(`h${i}`, hunter && glyph == i);
      }
      set(count, cannon ? '∞' : `${m}`);
      // The rest as the magazines it makes, full ones and an open one for a part, over its count.
      const rest = cannon ? 0 : Math.max(n - m, 0);
      const size = rifled
        ? mags[2]
        : railed
          ? (mags[1] * 99) / RAIL_MAX
          : sided
            ? GUN_MAG
            : mags[0];
      const dots = rifled
        ? `  ${'●'.repeat(nades)}${'○'.repeat(Math.max(NADE_MAX - nades, 0))}`
        : '';
      set(
        spare,
        cannon ? '' : `${'▮'.repeat(rest / size)}${rest % size ? '▯' : ''}\n${rest}${dots}`,
      );
      const names = hunter
        ? ['1 blades', '2 pistol', '3 harpoon', '4 cannon', '5 disc']
        : ['1 fists', '2 katana', '3 gun', '4 rifle', '5 rail'];
      // The keys in slot order; each shows the weapon in that slot (the Hunter's blades are first).
      const held = fists ? 4 : sided ? 5 : k ? 1 : rifled ? 3 : railed ? 2 : 0;
      [...slots.children].forEach((kbd, i) => {
        const w = slotted(i, hunter);
        kbd.textContent = names[i];
        (kbd as HTMLElement).title = names[i];
        // The Hunter shows the weapons he has found and no others, and has no fists (the user,
        // 2026-11-26). His pistol and his harpoon share `rounds`: the one out of hand is `other`.
        const got = hunter
          ? w == WEAPON.SIDE
            ? (sided ? rounds : other) >= 0
            : w == WEAPON.GUN
              ? (sided ? other : rounds) >= 0
              : have[w]
          : w > 3 || have[w];
        (kbd as HTMLElement).hidden = !got;
        kbd.classList.toggle('a', w == held);
      });
    },
    wear(body, c = {}, roles) {
      if (+!!body != picked.body) {
        cuts(+!!body);
      }
      picked = { ...c, body: +!!body };
      radios(3).forEach((b, i) => (b.hidden = b.disabled = !!roles && !roles.includes(i)));
      lit();
      // The face's look: the man's, the woman's, the xenomorph's or the Hunter's head (face.ts).
      const look =
        c.role === ROLE.XENO ? LOOK.XENO : c.role === ROLE.HUNTER ? LOOK.HUNTER : +!!body;
      if (look != fem) {
        [fem, shown] = [look, -1];
      }
    },
    face(n) {
      frame.toggleAttribute('hidden', n < 0);
      if (n < 0 || n == shown) {
        return;
      }
      shown = n;
      pen ??= mug.getContext('2d');
      if (pen) {
        const img = pen.createImageData(FW, FH);
        const px = new Uint32Array(img.data.buffer);
        sprite(n, fem).forEach((c, i) => (px[i] = PALETTE[c]));
        pen.putImageData(img, 0, 0);
      }
    },
    hit() {
      marker.hidden = false;
      clearTimeout(ticker);
      ticker = setTimeout(() => (marker.hidden = true), HIT_MS);
    },
    duel(lead) {
      rope.toggleAttribute('hidden', lead === undefined);
      knot.style.left = `${50 + 50 * Math.max(-1, Math.min(1, lead ?? 0))}%`;
    },
    down(level, left, what = 'DOWN') {
      fallen.toggleAttribute('hidden', level < 0.02);
      fallen.style.opacity = `${Math.min(level, 1)}`;
      set(fallen, fallen.hidden ? '' : `${what}\nBack in ${left.toFixed(1)}`);
    },
    banner(text, team) {
      banner.hidden = false;
      // Each banner pops in again.
      banner.style.animation = 'none';
      void banner.offsetWidth;
      banner.style.animation = '';
      set(banner, text);
      banner.style.color = team === undefined ? '#fff' : TEAM_COLOR[team];
      clearTimeout(timer);
      timer = setTimeout(() => (banner.hidden = true), BANNER_MS);
    },
    frags(n) {
      tally.hidden = false;
      set(tally.lastElementChild as HTMLElement, `${n}`);
    },
    fragged(text, prize = '') {
      notice.hidden = false;
      notice.style.animation = 'none';
      void notice.offsetWidth;
      notice.style.animation = '';
      set(victim, text);
      set(award, prize);
      clearTimeout(shout);
      shout = setTimeout(() => (notice.hidden = true), FRAG_MS);
    },
    comm(who, team, secs, face) {
      const box = one('label');
      box.hidden = false;
      // Each line flickers it open again.
      box.style.animation = 'none';
      void box.offsetWidth;
      box.style.animation = '';
      tint(box, team);
      set(one('label span'), who);
      clearTimeout(radio);
      radio = setTimeout(() => (box.hidden = true), (secs + COMM_TAIL) * 1000);
      cancelAnimationFrame(tuned);
      const c = one<HTMLCanvasElement>('label canvas');
      const g = c.getContext('2d');
      if (!g) {
        return;
      }
      g.clearRect(0, 0, COMM, COMM);
      if (face) {
        g.drawImage(face, 0, 0, COMM, COMM);
      }
      const src = g.getImageData(0, 0, COMM, COMM).data;
      const img = g.createImageData(COMM, COMM);
      const loss = createSignal(secs, COMM_TAIL);
      let last = performance.now();
      const tune = (now: number) => {
        if (!box.hidden) {
          scramble(src, img.data, COMM, COMM, loss(Math.min((now - last) / 1000, 0.1)));
          g.putImageData(img, 0, 0);
          last = now;
          tuned = requestAnimationFrame(tune);
        }
      };
      // At once: the screen opens on static, not on a clear face.
      tune(last);
    },
    feed([a, at], [b, bt]) {
      const li = document.createElement('li');
      const name = (n: string, t: number) => {
        const el = document.createElement('span');
        el.textContent = n;
        tint(el, t);
        return el;
      };
      const verb = document.createElement('em');
      verb.textContent = 'killed';
      li.append(name(a, at), verb, name(b, bt));
      list.append(li);
      while (list.children.length > FEED_MAX) {
        list.firstElementChild!.remove();
      }
      setTimeout(() => li.remove(), FEED_MS);
    },
    aim(at) {
      aim.toggleAttribute('hidden', !at);
      if (at) {
        aim.style.left = `${at[0] * 100}%`;
        aim.style.top = `${at[1] * 100}%`;
      }
    },
    hunterAim(at, progress = 0, now = 0) {
      hunterSight.toggleAttribute('hidden', !at);
      if (at) {
        hunterSight.style.left = `${at[0] * 100}%`;
        hunterSight.style.top = `${at[1] * 100}%`;
        // Tracking, the three sides of the triangle stand far out round the foe, each drifting
        // and tilting on its own beat; they close in over the lock's 3 s and join into the
        // triangle when it is locked, which then turns, 180 degrees a second (the user,
        // 2026-11-23).
        const off = 1 - Math.max(0, Math.min(1, progress));
        const t = now / 1000;
        const spin = progress >= 1 ? (t * 180) % 360 : 0;
        hunterSight.querySelectorAll('b').forEach((side, i) => {
          const r = 44 * off * (0.75 + 0.25 * Math.sin(t * AIM_BEAT[i] + 2.1 * i));
          const a = spin + 120 * i + 35 * off * Math.sin(t * AIM_BEAT[2 - i] * 0.8 + 1.3 + i);
          (side as HTMLElement).style.transform = `rotate(${a}deg) translateY(${-r}px)`;
        });
        hunterSight.classList.toggle('locked', progress >= 1);
        hunterSight.querySelector('small')!.textContent = progress >= 1 ? 'LOCK' : 'TRACKING';
      }
    },
    ship(s) {
      panel.toggleAttribute('hidden', !s);
      const w = s ? warning(s.up, s.out) : '';
      warn.toggleAttribute('hidden', !w);
      set(warn, w);
      if (s) {
        set(panel, `MISSILES ${s.nades}/${SHIP.MISSILES}  ·  ALT ${height(s.alt)}`);
      }
    },
    hull(own, near) {
      [own, near?.hp].forEach((hp, i) => {
        const bar = bars[i];
        bar.toggleAttribute('hidden', hp === undefined);
        if (hp !== undefined) {
          // Green, amber from 6 down, red from 3.
          bar.style.setProperty('--a', `${Math.max(0, Math.min(1, hp / VEHICLE.HP)) * 100}%`);
          bar.style.setProperty('--c', hp > 6 ? '#5fd28a' : hp > 3 ? '#f0b429' : '#e5484d');
        }
      });
      if (near) {
        bars[1].style.left = `${near.at[0] * 100}%`;
        bars[1].style.top = `${near.at[1] * 100}%`;
      }
    },
    rover(what, v) {
      prompt.toggleAttribute('hidden', !what);
      prompt.classList.toggle('g', what == GLORY_ACT);
      set(act, what);
      meter.toggleAttribute('hidden', v === undefined);
      set(speed, `${v ?? 0}`);
      screen.classList.toggle('v', v !== undefined);
    },
    outside(on) {
      screen.classList.toggle('o', on);
    },
    end(sum, left) {
      end.toggleAttribute('hidden', !sum);
      if (!sum) {
        built = undefined;
        return;
      }
      if (built !== sum) {
        built = sum;
        const [r, b] = sum.score;
        const win = r > b ? 0 : b > r ? 1 : -1;
        set(title, win < 0 ? 'DRAW' : `${TEAM_NAME[win].toUpperCase()} WINS`);
        title.style.color = win < 0 ? '#fff' : TEAM_COLOR[win];
        set(score, `${r} – ${b}`);
        // The most captures first, then frags, then returns.
        const rows = [...sum.players].sort(
          (x, y) => y.caps - x.caps || y.frags - x.frags || y.returns - x.returns || x.id - y.id,
        );
        table.replaceChildren();
        table.insertAdjacentHTML(
          'beforeend',
          '<tr><th>Player<th>Captures<th>Frags<th>Returns</tr>',
        );
        for (const p of rows) {
          const tr = table.insertRow();
          [p.name, p.caps, p.frags, p.returns].forEach(v => (tr.insertCell().textContent = `${v}`));
          tr.style.color = TEAM_COLOR[p.team];
        }
      }
      set(next, `Next match in ${left}`);
    },
  };
};
