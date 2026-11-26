import type { Result } from '../../shared/protocol';
import type { Choice, Snapshot } from '../../shared/types';
import type { Mark } from '../marks';

/** What the end screen shows: the final captures and what each player did. */
export interface Summary {
  score: [number, number];
  players: Result[];
}

export interface Hud {
  /**
   * The title screen with `status` on its button, "Click to play" or why not; '' hides it. `name`,
   * `tag` and `lore` are the map's (WorldDef).
   */
  title(status: string, name: string, tag?: string, lore?: string): void;
  /**
   * Whether the player has been in the game: then the title screen opens on the pause menu (PAUSE)
   * rather than the whole panel, until he plays again. `fresh`: he has not played yet (he comes from
   * the character screen), its first button reads Play.
   */
  paused(on: boolean, fresh?: boolean): void;
  /**
   * The character on the title screen: `pick` is told the whole choice (the body, the skin, the
   * haircut, the class) each time the player changes a part of it. Returns the canvas of his live
   * picture (SHOT pixels).
   */
  cast(
    pick: (c: Choice & { body: number }) => void,
    preview?: (active: boolean) => void,
  ): HTMLCanvasElement;
  /** Shows the loader over the character portrait while its deferred render is pending. */
  previewLoading(loading: boolean): void;
  /** The pictures of the haircuts on offer, in their order (HEAD_PX square): the own head with each. */
  heads(): HTMLCanvasElement[];
  /** The own player's magazines, as his class holds them (Kit's mag, cap, clip): the spare ones counted by them. */
  magazines(sizes: number[]): void;
  /** Shows or hides the muted mark. */
  mute(on: boolean): void;
  /**
   * The score and the clock at the top, and under them the state of both flags: at home, taken by
   * a player (`who` gives his name) or dropped with the seconds left. Over, the clock reads END.
   */
  match(m: Pick<Snapshot, 'score' | 'clock' | 'over' | 'flags'>, who: (id: number) => string): void;
  /** The markers of this frame (see marks.ts), in the order given; the ones before are removed. */
  marks(list: Mark[]): void;
  /** The orbital station's mission line (mission.ts), `hot` when urgent; none hides it. */
  mission(text?: string, hot?: boolean): void;
  /**
   * The Hunter's current local vision mode, `text` empty for the plain view; with `hint`, the V key
   * is shown with it, blinking in the plain view.
   */
  hunterVision(text?: string, scoped?: boolean, hint?: boolean): void;
  /** The Predator-style shoulder-laser sight, at a screen point and progressing to a lock. */
  hunterAim(at?: [number, number], progress?: number, now?: number): void;
  /** The dark rim of a space helmet's visor around the screen: on while the own player wears one, off otherwise. */
  visor(on: boolean): void;
  /** The red vignette of a tackle, 0 (none) to 1 (full). */
  hurt(level: number): void;
  /** The orbital strike's light over the view, 0 (none) to 1 (all white), over the down screen. */
  glare(level: number): void;
  /**
   * The health as pips out of HP_MAX, and the weapon in hand: the ammo counter with the gun glyph,
   * the katana glyph when `wield` (or when it is all there is), or the rail gun's lightning left
   * (charge(), 99 full) with the gun glyph in violet when `railed`. -1 ammo is no gun, `blade` is a
   * katana carried, `rail` the rail gun's lightning (-1 none); two or more carried show their slots (1 gun, 2 katana, 3 rail gun)
   * over the glyph, none hides it. `loaded` is what the battery or the capsule of the gun in hand
   * holds, in the same count: big, with the rest after it as the magazines it makes (an open one for
   * a part) over its count; faded while `swapping` it. `rifle` is the
   * laser rifle's rounds (-1 none), shown with the glyph in red when `rifled` (slot 4), with the
   * `nades` left in its launcher as dots after the count, hollow for the ones spent. `armor` shows
   * as gold pips after the health's, only the ones he has.
   */
  vitals(
    hp: number,
    ammo: number,
    blade?: boolean,
    wield?: boolean,
    rail?: number,
    railed?: boolean,
    loaded?: number,
    swapping?: boolean,
    rifle?: number,
    rifled?: boolean,
    nades?: number,
    armor?: number,
    fists?: boolean,
    /** The Hunter's pistol is in hand: `ammo` and `loaded` are its own. */
    sided?: boolean,
    /**
     * The Hunter's other gun, out of hand: his harpoon's bolts when `sided`, else his pistol's
     * shots; -1 when he has not found it.
     */
    other?: number,
  ): void;
  /** The health the own player's class has at most (Kit.hp): as many pips. */
  life(max: number): void;
  /** A hit marker on the crosshair for a moment: a ball or a cut of the own player hit. */
  hit(): void;
  /** The face over the health, frame `n` of face.ts (-1 hides it). */
  face(n: number): void;
  /**
   * The own player's character (BODY): the face is hers when she is the woman. `c` is what the
   * roster says he picked, shown chosen on the title screen, and `roles` the classes the map offers
   * (ROLE): the others are hidden.
   */
  wear(body: number, c?: Choice, roles?: number[]): void;
  /**
   * A saber lock: the gauge of the tug of war under the crosshair, with `lead` the own side's, -1
   * (the foe wins) to 1 (he wins); undefined hides it.
   */
  duel(lead: number | undefined): void;
  /** The state of being down: `level` 0 (up) to 1 hides or greys the screen, `left` seconds till the respawn. */
  down(level: number, left: number, what?: string): void;
  /** A line in the middle of the top of the screen in `team`'s colour, for a few seconds; a newer one replaces it. */
  banner(text: string, team?: number): void;
  /** The own frags this match, top left. */
  frags(n: number): void;
  /**
   * Under the banner for FRAG_MS: `text` ("Bob killed!", '' for none) and the announcer's `award`
   * in gold under it; a newer one replaces both.
   */
  fragged(text: string, award?: string): void;
  /**
   * A line of the kill feed, top right: `by` put `who` down, each [name, team] in his team's
   * colour. The newest at the bottom, FEED_MAX at most, each gone after FEED_MS.
   */
  feed(by: [string, number], who: [string, number]): void;
  /**
   * An ally on the radio: the small screen with `name` in `team`'s colour opens for `s` seconds
   * (and COMM_TAIL more), a newer one taking its place, and shows his `face` (COMM pixels square)
   * as a scrambled transmission with bad reception (signal.ts), static alone without one.
   */
  comm(name: string, team: number, s: number, face?: CanvasImageSource): void;
  /**
   * The rover: `act` is what E does now ('drive', 'ride', 'get out', GLORY_ACT which pulses; '' hides the prompt), and
   * `speed` the km/h shown at the wheel, where the gun and the crosshair then hide; undefined off it.
   */
  rover(act: string, speed?: number): void;
  /** The camera out of the head for a glory kill (killcam.ts): the crosshair, the gun and the visor's rim go. */
  outside(on: boolean): void;
  /** The rover's reticle, where its lasers cross: `at` on screen in [0, 1] from the top left; undefined hides it. */
  aim(at?: [number, number]): void;
  /** The ship flown: its missiles and height, and how near its limits are (limits(), ship.ts); undefined hides it. */
  ship(s?: ShipPanel): void;
  /**
   * A vehicle's health, of VEHICLE.HP: `own` in pips for who is seated in it (undefined on foot),
   * and `near` as a small bar over a vehicle close by, `at` on screen in [0, 1] from the top left.
   */
  hull(own?: number, near?: { hp: number; at: [number, number] }): void;
  /** The end screen with the result and each player's captures, frags and returns, `next` seconds before the next match; undefined hides it. */
  end(sum: Summary | undefined, next: number): void;
}

/** What the ship's panel shows. */
export interface ShipPanel {
  nades: number;
  /** Metres over the crater's floor. */
  alt: number;
  /** limits(): the ceiling's and the edge's nearness, 1 at the limit. */
  up: number;
  out: number;
}
