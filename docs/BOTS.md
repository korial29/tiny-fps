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

| UT2004                 | tiny-fps                                                                                                                                                                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Skill and traits       | `personaOf(id, skill)`: the aim's first error, the reaction, the aim's turn rate, Jumpiness, how long it strafes one way, its chance of dodging a ball. `Rules.botSkill`, `BOT_SKILL` on the server, 0 to 7, 4 when absent.                       |
| Dodging projectiles    | `evade()`: an enemy ball that will pass within 1.3 m of the chest in the next half second is weighed once; with the bot's chance it dashes across the ball's way, away from it, where the floor is open. Not on a leg of a route, nor in the air. |
| Moving in a fight      | `dodge()`: it strafes one way for a while, then the other, never toward a drop; now and then it jumps or dashes aside.                                                                                                                            |
| Reach specs, JumpSpots | `routes.ts`'s legs (a jump, a dash, a double jump, a wall-run, as the tests fly them), the moon's `CROSSINGS`, joined by straight walks (`walkable()`).                                                                                           |
| AlternatePaths         | each bot prefers one of a map's three routes (`ROUTES`), by its id.                                                                                                                                                                               |
| Squads                 | one bot in eight guards its base; the others attack, chase the enemy carrier, return a lying flag; the carrier runs rather than fights.                                                                                                           |
| Moving about           | `walk()`: round a wall or a drop by the nearest open turn, onto a box low enough to jump, a dash where the way ahead is long, straight and wide, the look turning a little each tick.                                                             |

## What is left, by cost

1. **Squad roles and defence points** (cheap). Attack, defend and freelance by the team's numbers
   rather than by id; defenders spread over a few points per base with a view of the flag, not all
   on it; an escort for the carrier.
2. **Items** (cheap). Health packs when hurt, ammo packs when low, the other racks (rail gun,
   rifle, katana) when the way passes near.
3. **Weapons** (medium). The katana at close range, the rifle's grenade at a group, aimed at the
   feet; the rail gun at range.
4. **Memory and hearing** (medium). Hunt where an enemy was last seen; turn to a shot heard.
5. **Jumps found by the physics** (dear). Build the graph's jump and dash edges by flying them with
   `move()`, as the UT editor builds its reach specs, instead of writing them by hand: every map
   gets them, the moon's craters and boulders included. A build per map, cached.

## How a change is judged

Bot-only matches, headless, 16 minutes each, 8 bots, with numbers for the captures, the flags
taken, the deaths, the falls, the blocks (5 s without moving), the time stopped on the way and the
abrupt turns of the look. One match is noise: the same code can give twice the captures from one
match to the next, so a change is judged on 24 matches or more, against master.

Sources: [UT2004 bot internal variables](<https://wiki.beyondunreal.com/UE2:Bot_internal_variables_(UT2004)>),
[UT2003 AI for level designers](https://www.zx.net.nz/mirror/unreal.epicgames.com/ut2ai.htm),
[CTFSquadAI](https://beyondunrealwiki.github.io/pages/ctfsquadai.html),
[AlternatePath](https://wiki.beyondunreal.com:443/Legacy:AlternatePath),
[DefensePoint](https://unrealarchive.org/wikis/unreal-wiki/Legacy:Creating_A_Defense_Point_In_UT200x.html).
