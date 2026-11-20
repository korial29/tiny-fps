# Bots, after Unreal Tournament 2004's

The bots (`src/shared/bot.ts`, `nav.ts`, `Room.fill()`) are players the host plays itself, one
input a tick through the same `step()` as everyone. This page says what UT2004's bots do that is
worth taking, what tiny-fps took, and what is left.

## What UT2004's bots do

- **A character per bot.** Each bot has a skill (Novice 0 to Godlike 7) and a few traits: Accuracy,
  ReactionTime, Jumpiness, StrafingAbility, CombatStyle (charge or keep away), Tactics. Two bots of
  the same skill do not fight alike.
- **Dodging.** They see a rocket or a shock core fired at them and dodge it at once; in a fight they
  strafe, jump and dodge as the traits say.
- **Navigation.** Path nodes joined by reach specs that the editor builds by testing the moves.
  JumpSpots mark what a plain walk cannot reach: a double jump, a dodge jump, a translocator.
- **Squads.** In CTF a team's bots take orders: attack, defend, freelance, escort the carrier.
  DefensePoints are where a defender stands (some are sniping spots), AlternatePaths spread the
  attackers over the routes into a base, weighted.
- **Items.** On the way they weigh the pickups (health, weapons, armour) against the detour.

## What tiny-fps has taken

| UT2004                 | tiny-fps                                                                                                                                                                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Skill and traits       | `personaOf(id, skill)`: the aim's first error, the reaction, the aim's turn rate, its wander, its lead and how fast it reads a change of speed, its warning shots, Jumpiness, how long it strafes one way, its chance of dodging a ball. `Rules.botSkill`, `BOT_SKILL` on the server, 0 to 7, 4 when absent. |
| Dodging projectiles    | `evade()`: an enemy ball that will pass within 1.3 m of the chest in the next half second is weighed once; with the bot's chance it dashes across the ball's way, away from it, where the floor is open. Not on a leg of a route, nor in the air.                                                            |
| Moving in a fight      | `dodge()`: it strafes one way for a while, then the other, never toward a drop; now and then it jumps or dashes aside.                                                                                                                                                                                       |
| Reach specs, JumpSpots | A navigation mesh (`nav.ts`): the brushes' tops and the relief as rectangles, joined by portals a body walks, drops or hops through; `routes.ts`'s legs and the moon's `CROSSINGS` as links (a jump, a dash, a double jump, a wall-run, as the tests fly them). A* then the funnel.                          |
| AlternatePaths         | each bot prefers one of a map's three routes (`ROUTES`), by its id.                                                                                                                                                                                                                                          |
| Squads                 | `squad()`: roles handed out by the team's numbers each tick (below); the carrier runs rather than fights.                                                                                                                                                                                                    |
| Moving about           | `walk()`: round a wall or a drop by the nearest open turn, onto a box low enough to jump, a dash where the way ahead is long, straight and wide, the look turning a little each tick.                                                                                                                        |

Team assignments and pickup choices keep the same distance and id tie-breaks without sorting each tick.

## Fair fights (the user, 2026-11-20: they were too good)

A bot gets no more than a player would: it shoots what it could see, misses as a hand on a mouse
does, and tells a player he is under fire before it hits him. `fight()` in `bot.ts`:

- **Sight.** It notices an enemy within `VIEW` (1.1 rad) of its look, or within `HEAR` (5 m) all
  round; once it fights one it follows him round. Never one behind its back it has not met, and
  never through a wall (`hidden()`).
- **Warning shots.** Its first `warn` shots at a new enemy (1 to 4, fewer the higher the skill)
  pass `PAST` (1.6 m) beside him. An enemy it fought within `MEMORY` (3 s) gets none again.
- **Attack tokens.** At most `TOKENS` (2) bots shoot to hit the same enemy; the others shoot past
  him (`Bot.hunting`, `Sight.hunters`, built by the room from the last tick). Only a bot that
  fires holds a token: not one with an empty gun, still reacting or still turning onto him. The
  lowest ids keep them, so the same bots always shoot to hit; rotating them is left for later. A
  player caught by four bots is not cut down in a tick.
- **A hand, not a turret.** The aim wanders about the target (`shake`), the more as he crosses
  its view and as it moves (`CROSS`, 6 m/s doubles it); it reads his speed late (`track`) and
  leads him by a share of the ball's flight (`lead`); a shot meant to miss leaves the wander out.
- **Slower.** The reaction is longer and the turn rate lower than before, and it dodges a ball less.

On 24 bot-only matches a map, the bots before these rules against the bots with them and with the
team play below: Highline's accuracy 62 % to 29 %, frags 87 to 41 a match; Tranquility's 53 % to
32 %, frags 96 to 34. The bench counts the shots, the hits and the frags.

## Team play (the user, 2026-11-20: to make up for the aim)

`squad()` in `bot.ts` hands out a role to each bot of a team every tick. The room works it out
once per team, before any bot moves, and hands it in (`Sight.squad`), so all of a team's bots go
by the same roles. The nearest bot to a job takes it, the most pressing jobs first:

- **chase**: half the team or more go after the enemy who has our flag. When we also have theirs,
  all but one escort chase him: there is no capture till ours is home.
- **return**: one bot (two in a squad of four or more) sends a lying flag home.
- **escort**: the two nearest go with our carrier.
- **help**: the nearest bot within `HELP` (40 m) goes to a teammate, a person or a bot, who is
  `LOW` (3 hp or less) with an enemy within `NEAR` (12 m) of him.
- **guard**: one bot stays home in a squad of three or more, while our flag is home. It walks a
  round about the flag (`patrol()`): up to `POSTS` (8) points `ROUND` (5 m) off it on the flag's
  own floor, a stop of 1.5 to 3 s at each, clockwise or not by its id. Stood at a point it watches
  the way in nearest its side, its look sweeping `SWEEP` (0.35 rad) either side: the ways in are
  where the ways from the enemy's base, one by route, come within `ENTRY` (12 m) of the flag. On
  Highline they come up the tower's sides, not from the enemy's end.
- **attack**: the rest go for their flag.

A bot that is low goes for a health pack within `MEND` (30 m) first, unless it chases our flag
(`Sight.packs`, the ones there). In a fight it shoots first the one who has our flag, then one on
a teammate who carries theirs or is low, then the nearest.

Against the same bots with the old goals, aim being equal (24 matches a map, sides swapped each
match): 156 captures to 93 on Highline (15 matches won, 9 lost), 321 to 127 on Tranquility (24
won). In bot-only matches against the bots before, captures go 6.7 to 7.8 a match on Highline and
11.6 to 16.3 on Tranquility, and flags are taken more (25 to 30, 32 to 56). Highline's blocks go 34
to 66 a match: mostly a carrier waiting at home for his own flag with his escorts by him, and
chasers walking at the foot of the tower the enemy carrier waits on (a stall of the way to a
player up a tower, left for later).

## What is left, by cost

1. **Defence points** (cheap). Several guards over points chosen per base, with a view of the
   way in, rather than one round about the flag.
2. **Items** (cheap). Ammo packs when low, armour, the other racks (rail gun, rifle, katana) when
   the way passes near.
3. **Weapons** (medium). The katana at close range, the rifle's grenade at a group, aimed at the
   feet; the rail gun at range.
4. **Memory and hearing** (medium). Hunt where an enemy was last seen; turn to a shot heard.
5. **Jumps found by the physics** (dear). Build the mesh's jump and dash links by flying them with
   `move()`, as the UT editor builds its reach specs, instead of writing them by hand: every map
   gets them, one set per class (the ninja's and the xenomorph's jumps, the xenomorph's walls). A
   build per map, cached. Then the vehicles: a mesh of the rover's own, and links to board one.

## How a change is judged

Bot-only matches, headless, 16 minutes each, 8 bots (`npm run botmatch`: `BOTMATCH` matches,
`BOTMATCH_MAP`, `BOTMATCH_OUT` for the numbers, `node_modules/.cache/botmatch.json` by default), with numbers for the captures, the flags
taken, the deaths, the falls, the blocks (5 s without moving), the time stopped on the way and the
abrupt turns of the look, the bots' shots, hits and frags. One match is noise: the same code can give twice the captures from one
match to the next, so a change is judged on 24 matches or more, against master.

Sources: [UT2004 bot internal variables](<https://wiki.beyondunreal.com/UE2:Bot_internal_variables_(UT2004)>),
[UT2003 AI for level designers](https://www.zx.net.nz/mirror/unreal.epicgames.com/ut2ai.htm),
[CTFSquadAI](https://beyondunrealwiki.github.io/pages/ctfsquadai.html),
[AlternatePath](https://wiki.beyondunreal.com:443/Legacy:AlternatePath),
[DefensePoint](https://unrealarchive.org/wikis/unreal-wiki/Legacy:Creating_A_Defense_Point_In_UT200x.html).

## Classes (the user, 2026-11-16)

The bots take the marine, the ninja and the xenomorph in turn by their name (`BOT_ROLES` in `room.ts`), so a room of eight has all three on each map; the moon offers no ninja and makes him an astronaut (`roleOf()`). The room hands each bot its `Kit` (`Sight.kit`):

- A class that takes no gun (`Kit.gear` false, the xenomorph) never walks to the rack, and runs at an enemy it sees within `HUNT` (15 m) and `HUNT_Y` (2 m) of its height: its claws reach an arm's length.
- A class that jumps unlike the marine the routes were flown with (the ninja, the xenomorph, `Kit.jump`) steers every leap in the air to come down on its point, as the moon's `land` legs, still pressing a leg's dash and double jump on their step. Held forward all the way, the xenomorph's jump twice as high overshot the leaps before the enemy tower, caught a wall and fell.
