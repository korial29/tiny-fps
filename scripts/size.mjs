// Fails when a gzipped browser entry, shared chunks included, grows past its budget.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  { file: 'dist/index.js', max: 264_000 },
  // 40 KB until the bots after UT2004's (the user, 2026-11-13).
  // 44 KB until the bots that fly the orbital station's mission (the user, 2026-11-15).
  // 46 KB until the ninja's parry (the user, 2026-11-16).
  // 47 KB until the xenomorph's walk on a wall, its jump where it looks and its glory kill's dash (the user, 2026-11-16: 48 KB).
  // 48 KB until the bots' navigation mesh (the user, 2026-11-19: 50 KB, then 51 for CI's zlib, 2026-11-20).
  // 51 KB until the bots' fair fights and team play (the user, 2026-11-20: 52 KB).
  // 52 KB + 1024 B until the bot and vehicle simulation speed-ups and the Hunter's weapons (#338, 2026-11-20).
  { file: 'dist/local.js', max: 52 * 1024 + 1024 },
];

// An entry plus every chunk it statically imports, concatenated.
const collect = (file, seen = new Set()) => {
  if (seen.has(file)) {
    return '';
  }
  seen.add(file);
  const src = readFileSync(file, 'utf8');
  const deps = [...src.matchAll(/from\s*["'](\.\/[^"']+)["']|import\s*["'](\.\/[^"']+)["']/g)];
  return src + deps.map(m => collect(join(dirname(file), m[1] ?? m[2]), seen)).join('');
};

let failed = false;
for (const { file, max } of BUDGETS) {
  const raw = collect(file);
  const gz = gzipSync(raw, { level: 9 }).length;
  const ok = gz <= max;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${file}: ${raw.length} B raw, ${gz} B gzip (budget ${max} B)`,
  );
}
process.exit(failed ? 1 : 0);
