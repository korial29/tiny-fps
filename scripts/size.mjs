// Fails when a gzipped browser entry, shared chunks included, grows past its budget.
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGETS = [
  // 76 KB until the detailed hands (the user, 2026-11-09: "peu importe le budget").
  // 92 and 18 KB until the moon's crater, rovers and base (the user, 2026-11-10: weight does not matter).
  // 110 KB until the space trooper's armour (the user, 2026-11-10: weight does not matter).
  // 144 KB until the woman's own helmet, 100 B under it (the user: weight does not matter).
  // 170 KB until the fist combos, the frags, the death falls and the runners' fingers (the user, 2026-11-13).
  // 174 KB until the ninja's belt, buckle, back and gold pads (the user, 2026-11-14).
  // 176 KB until 8 HP and the armour pickups (the user, 2026-11-14).
  // 177 KB until the pieces kept on the GPU (the user, 2026-11-14: a step of that plan at a time).
  // 178 KB until the runners' skin and armour posed by the vertex shader (the same plan).
  // 180 KB until the green armour, the pickups' sounds, the vehicles' changes and the marine's
  // reworked armour (the user, 2026-11-14).
  // 182 KB until the orbit over the moon (the user, 2026-11-14).
  // 183 KB until the stars at infinity and the craters drawn by the shader (the user, 2026-11-14: up to 20 KB more for a better look).
  // 186 KB until the orbital station, its mission and its strike (the user, 2026-11-14).
  // 190 KB until the loading screen (the user, 2026-11-15).
  // 191 KB until the players' spoken taunts and death cries (the user, 2026-11-15).
  // 192 KB until the allies' radio and its screen (the user, 2026-11-15).
  // 193 KB until every class's armour wear (the user, 2026-11-15).
  // 194 KB until the strand hair (the user, 2026-11-15: 3 KB more for it).
  // 197 KB until the xenomorph's class (the user, 2026-11-15: 2 KB more for it).
  // 199 KB until the skin texture and each runner's marks (the user, 2026-11-15).
  // 200 KB until the xenomorph's own body (the user, 2026-11-15).
  // 202 KB until its spine, toes and tendons (the user, 2026-11-15).
  // 203 KB until its rib cage, longer legs, bigger hands and more detail (the user, 2026-11-15: 5 KB more).
  // 209 KB until the xenomorph made cheap to draw: its spine baked in, its pieces made at load (the user, 2026-11-16).
  // 212 KB until the xenomorph on all fours (the user, 2026-11-16).
  // 214 KB until its tail fought as the katana, seen in first person, its blade and its vertebrae (the user, 2026-11-16: 1 KB more).
  // 215 KB until the orbital strike's light and the red halo of any hit (the user, 2026-11-16: 256 B more).
  // 216 KB until the xenomorph's own picture in the menu, no style or gender for it (#291, the user, 2026-11-16: 1 KB more).
  // 216 KB + 256 B until the glory kills, the xenomorph's and the katana's, its vision through walls (the user, 2026-11-16: 217 KB).
  // 217 KB until the xenomorph's view turned over onto a wall and its glory kill from afar (the user, 2026-11-16: 218 KB).
  // 218 KB until the xenomorph's bigger narrower head, its chitin and striated tubes (the user, 2026-11-16: 219 KB).
  // 219 KB until its chitin's plates read from a 3D texture made at load (the user, 2026-11-17: 256 B more).
  // 4 KB more for the glory kills (the user, 2026-11-16 and 17, from 218 to 222 KB before the head above): watched in
  // third person, the xenomorph seizing its prey, his panic and blood, the katana's execution and the floor under
  // the bodies that are down. 512 B more for the two together, which pack less tight than apart
  // (the user, 2026-11-17: 223.5 KB).
  // 223.5 KB until the E prompt under the crosshair and the glory kill's that pulses (the user, 2026-11-17: 224.5 KB).
  // 224.5 KB until the xenomorph's fixes: no vehicles, a glory kill up close that heals it, G held for the tail
  // (the user, 2026-11-17: 225 KB), then 226.5 KB for the fists' glory kill, its bound, its blows and its
  // sounds (the user, 2026-11-17: up to 2 KB more).
  // 226.5 KB until the synth's brief death cries and groans in place of the spoken screams
  // (the user, 2026-11-17: 227 KB).
  // 227 KB until the xenomorph's bladed spine, hips, limbs, feet and hands (the user, 2026-11-17: 2 KB more).
  // 229 KB until the ninja's rework: the cloth hood, the textures, the sash and its blades, the
  // muscled body (the user, 2026-11-18: 233 KB).
  // 233 KB until the more natural gait: the lean into an acceleration, the hips trailing a turn, the
  // steps on the spot (the user, 2026-11-19: 234 KB).
  // 234.5 KB until the scene's shader compiled per part and the moon's globe at half size, for
  // the GPU (the user, 2026-11-19).
  // 235 KB until the ships' predictive targeting, loaded lazily (the user, 2026-11-20: 256 B more).
  // 235 KB + 384 B until the tail's aim and flash, and the fists' weapon slot (the user, 2026-11-20: 128 B more).
  // 235 KB + 384 B until the bot and vehicle simulation speed-ups (the user, 2026-11-20: 384 B more).
  // 235 KB + 2816 B until the Hunter's class, HUD portrait, weapons and vision (#334/#338/#339, 2026-11-20).
  // 243 KB + 2816 B until the Hunter's full 3D model is used in the menu and match (#341, 2026-11-21).
  // 235 KB + 2816 B until the audio engine: levels in dB, sounds placed in 3D (the user, 2026-11-20: 1 KB more).
  // 243 KB + 2816 B until the pistol's burst and the rail gun's ring (the user, 2026-11-23: 256 B more).
  // 146 B for the lazy, animated character previews (the user, 2026-11-23).
  // 1319 B for the scalloped Hunter blades and folding harpoon (the user, 2026-11-23).
  // 2031 B for the Hunter carried by the runner's animated skeleton (the user, 2026-11-23).
  // 2900 B for the Hunter's ribbed harpoon, fitted bracers and sliding wrist blades (the user, 2026-11-23).
  // 223 B for the menu's picture moving on smoothly at its card's size (the user, 2026-11-23).
  // 260,223 B (260,000 B and the menu picture's 223 B) for the Hunter's shoulder cannon, sniper scope, blade guard and harpoon reload (the user, 2026-11-23).
  // 897 B for the Hunter's view hint, flash, heartbeat and radio growl (the user, 2026-11-23).
  // 262,000 B for the Hunter's cannon fired on the click, its post, its lock and three-slot loadout (the user, 2026-11-23).
  // 264,000 B for the Hunter's disc weapon, thermal and alien-scan palettes, cannon ball and disc grip (the user, 2026-11-23).
  // 267,000 B for the Hunter's unmasked HUD face (the user, 2026-11-24).
  // 268,024 B for the ninja's wide pleated sash, quilted tabard and skirt (the user, 2026-11-24: 1 KB more).
  // 268,100 B for his skirt kept narrow at the sides, clear of the hands (the user, 2026-11-24: 76 B more).
  // 268,800 B for the two together with the Hunter's disc throw and harpoon shock, merged meanwhile
  // inside the room the sash was counted in (the user, 2026-11-24: 700 B more).
  // 270,336 B for the polished harpoon (#376, 2026-11-24).
  // 272,896 B: 2,560 B more for the Hunter's dreadlocks, netted sleeves, yoke, necklace, spots,
  // side armour and olive hide (the user, 2026-11-24: raise it, 268,800 to 271,360 before #376).
  // 274,432 B: 1,536 B more for the Hunter's drum-fed shoulder cannon, its jointed arm and its
  // foot moulded to the shoulder plate (the user, 2026-11-24: raise it).
  // 275,456 B: 1,024 B more for the Hunter's wrist computer and wrist blades after the user's
  // references (the user, 2026-11-24: a small raise, the least seen details taken out first).
  // 279,552 B: 4,096 B more for the full-page character screen before a match, its own preview
  // renderer and the classes' strengths and weaknesses (the user, 2026-11-24: raise it).
  // 280,576 B: 1,024 B more for the racks open to both teams, the Hunter's radio calls and
  // mimicry, and his own HUD glyphs (the user, 2026-11-24: raise it).
  // 281,088 B: 512 B more for the menus' 8-bit theme (the user, 2026-11-24: raise it).
  // 281,344 B: 256 B more for the character screen opened from the pause menu (the user, 2026-11-25: raise it).
  // 281,600 B: 256 B more for the Hunter's steadier arms and the long guns' hold in the hand (the user, 2026-11-25: raise it).
  // 282,112 B: 512 B more for the Hunter's strips and tassets hung on hinges, out of his thighs' way (the user, 2026-11-25: raise it).
  // 282,112 B until Landfall, the beach level: its sand, sea, forest and headlands (the user, 2026-11-25: 292,000 B).
  // 292,000 B until its wreck drawn on the map's boxes, its surf and its smoke (the user, 2026-11-25: 298,000 B).
  // 298,000 B until Highline's own music (the user, 2026-11-25: 299,000 B).
  // 299,000 B until Landfall's ship drawn smooth and gloss white on a hollow hull, and the ash under it
  // (the user, 2026-11-25: 5,000 B more, agreed as 303,000 B before the music's 1,000 B landed).
  // 278,400 B: Tranquility's and Landfall's scenery loaded in their own chunks (the user, 2026-11-25: lower it, then 278,400 B after Landfall's reworked ship).
  // 278,528 B: the scene's targets in 11-11-10 bit floats (the user, 2026-11-25).
  // 279,168 B: the map cut into runs that each pass culls (the user, 2026-11-25).
  // 279,296 B: Landfall's see-through canopy, its glass drawn in two blended passes (the user, 2026-11-26).
  // 279,424 B: with the sand's dunes and the water's chop (#414) (the user, 2026-11-26).
  // 279,552 B: the Hunter's disc reaching bodies 0.5 m off its line (the user, 2026-11-26).
  // 280,704 B: Landfall's swimming, its breaststroke and the view under the water (the user, 2026-11-26: raise; 280,400 B before the merged changes of #413 and #414).
  // 280,960 B: the water's splash and swim sounds (the user, 2026-11-26).
  // 281,344 B: Landfall 25 % longer, its lattice laid on the centre line and its blocks of granite (the user, 2026-11-26).
  // 281,728 B: each class's racks and the Hunter's weapons found on them (the user, 2026-11-26).
  // 284,096 B: the Hunter's pistol, its model, its glyph screen and its slot (the user, 2026-11-26).
  // 284,224 B: the Hunter's weapons on him only once found (the user, 2026-11-26).
  // 286,528 B: footprints in the sand and the regolith (the user, 2026-11-26).
  // 287,552 B: the glass and steel mirror the boxes near the eye (the user, 2026-11-26).
  { file: 'dist/index.js', max: 287_552 },
  // 40 KB until the bots after UT2004's (the user, 2026-11-13).
  // 44 KB until the bots that fly the orbital station's mission (the user, 2026-11-15).
  // 46 KB until the ninja's parry (the user, 2026-11-16).
  // 47 KB until the xenomorph's walk on a wall, its jump where it looks and its glory kill's dash (the user, 2026-11-16: 48 KB).
  // 48 KB until the bots' navigation mesh (the user, 2026-11-19: 50 KB, then 51 for CI's zlib, 2026-11-20).
  // 51 KB until the bots' fair fights and team play (the user, 2026-11-20: 52 KB).
  // 52 KB + 1024 B until the bot and vehicle simulation speed-ups and the Hunter's weapons (#338, 2026-11-20).
  // 53 KB until Landfall's map, its relief, wreck and debris (the user, 2026-11-25: 58,000 B).
  // 58,000 B until Landfall's hollow hull and the bots' pull ups through its decks (the user, 2026-11-25: 58,500 B).
  // 58,500 B until that hull rebased on the ws-free room entry (#399) and the fires' damage (#400) (the user, 2026-11-25: 58,700 B).
  // 58,950 B: Landfall's swimming (the user, 2026-11-26).
  // 59,392 B: Landfall 25 % longer, its lattice on the centre line and its blocks of granite (the user, 2026-11-26).
  // 59,520 B: the bots swimming back to shore (the user, 2026-11-26).
  // 59,776 B: the Hunter's pistol in the step and the snapshot (the user, 2026-11-26).
  // 60,800 B: the bots at the wheel of the moon's rovers (the user, 2026-11-26).
  { file: 'dist/local.js', max: 60_800 },
];

// The chunks loaded on demand (import()), by name (the file's, less its hash): each is measured
// with the chunks it imports statically that its entry has not loaded already. A chunk with no
// budget fails, and so does a budget whose chunk is no longer built.
const LAZY = {
  // The announcer's sprite, Ogg Opus then MP3 (audio.ts).
  opus: 41_216,
  mp3: 98_560,
  // The players' voices, the same two ways.
  'cast-opus': 148_992,
  'cast-mp3': 365_824,
  // The character screen's tiles, hand-drawn pixel art (lobby.ts; the user, 2026-11-26).
  'cast-art': 8_192,
  // The ships' predictive targeting (play/match.ts).
  targeting: 1_792,
  // Tranquility's and Landfall's scenery (render/scene.ts decor()), the rounded stones that both draw
  // counted in each (the user, 2026-11-25: watch the chunks' budgets too).
  tranquility: 18_688,
  // 14,464 B: the wreck's cockpit, troop seats and canopy glass (the user, 2026-11-26).
  // 15,616 B: Landfall's headland of granite blocks and the granite's shader, out of the main bundle (the user, 2026-11-26).
  // 15,744 B: the camps' torn tents, wooden poles and battens, the steel containers (the user, 2026-11-26).
  landfall: 15_744,
};

const imports = src => [
  ...src.matchAll(/from\s*["'](\.\/[^"']+)["']|import\s*["'](\.\/[^"']+)["']/g),
];
const dynamic = src => [...src.matchAll(/import\(\s*[`"'](\.\/[^`"']+)[`"']\s*\)/g)];

// A chunk plus every chunk it statically imports that is not in `seen`, concatenated. `lazy`
// gathers the chunks they load on demand.
const collect = (file, seen = new Set(), lazy = new Set()) => {
  if (seen.has(file)) {
    return '';
  }
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  dynamic(src).forEach(m => lazy.add(join(dirname(file), m[1])));
  return (
    src +
    imports(src)
      .map(m => collect(join(dirname(file), m[1] ?? m[2]), seen, lazy))
      .join('')
  );
};

let failed = false;
const report = (file, raw, max) => {
  const gz = gzipSync(raw, { level: 9 }).length;
  const ok = max !== undefined && gz <= max;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${file}: ${raw.length} B raw, ${gz} B gzip (${max === undefined ? 'no budget' : `budget ${max} B`})`,
  );
};
const built = new Set();
for (const { file, max } of BUDGETS) {
  const [seen, lazy] = [new Set(), new Set()];
  report(file, collect(file, seen, lazy), max);
  // A chunk loaded on demand may load others: the entry's static chunks are there already.
  for (const chunk of lazy) {
    const name = basename(chunk).replace(/-[\w-]{8}\.js$/, '');
    built.add(name);
    report(chunk, collect(chunk, new Set(seen), lazy), LAZY[name]);
  }
}
for (const name of Object.keys(LAZY).filter(n => !built.has(n))) {
  failed = true;
  console.log(`FAIL ${name}: budgeted, but no entry loads such a chunk`);
}
process.exit(failed ? 1 : 0);
