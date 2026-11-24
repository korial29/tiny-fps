# Hunter

Le modèle 3D du Hunter est considéré comme déjà créé. Ce plan couvre son intégration jouable
dans `tiny-fps`, inspirée d’_Aliens versus Predator_ (1999). Les armes et la vision doivent être
résolues par l’hôte et prédites par le client, comme le reste du combat.

## Étapes PR

1. **Socle, menus et portrait** — rôle réseau stable sur toutes les cartes; choix dans le menu;
   portrait pixel-art dans le HUD et la radio. (PR #334)
2. **Armes** — lames de poignet, harpon, disque volant qui revient au lanceur et laser d’épaule
   avec assistance de visée bornée, tous validés par l’hôte. (PR #338)
3. **Vision** — bascule locale entre vision thermique et détection des Xénomorphes, avec commande
   et indicateur HUD. (PR séparée)
4. **Cris** — générer des cris originaux pour le Hunter et les intégrer à la radio. (PR séparée)

## Ordre technique

Les états de combat sont autoritatifs côté hôte et prédits par le client. Chaque nouvelle arme
ajoute des champs réseau seulement si les états existants ne suffisent pas. L’assistance de visée et
les visions ne doivent pas transmettre aux autres clients des informations de cible cachées.

## État

- [x] PR #334 : rôle, menus, disponibilité sur les cartes et portrait pixel-art HUD/radio.
- [x] PR #338 : lames doubles en vue première et troisième personne; harpon rapide; disque renvoyé
      vers son porteur et récupéré au contact; laser d’épaule avec acquisition hôte dans un cône limité.
- [x] PR #339 : touche V pour alterner vision normale, thermique et détection locale des Xénomorphes.
- [x] PR #340 : douleur et mort avec une voix originale; appel de frag synthétisé transmis sur la radio alliée.
- [x] Canon d’épaule : arme innée sur la touche 3, dépliée et visible en vue première personne (voir ci-dessous).

Les cris et appels Hunter sont synthétisés par le moteur audio du jeu; ils n’utilisent aucun extrait
enregistré.

## Shoulder cannon

The Hunter's third weapon, on key 3 (the user, 2026-11-23). He takes no other weapon: the rail gun
and rifle racks give him nothing, and the gun rack only refills his harpoon bolts.

- **Always carried.** It is his from the spawn. It never heats or swaps a capsule, and G does not
  fire the rail gun's ring with it (`src/shared/gun.ts`).
- **Battery.** It holds `HUNTER_CELLS` (15) shots in `cap`. Each shot spends one, and it does not
  fire empty. Each `HUNTER_CELL_TICKS` (1.5 s) without firing brings one back, counted down in
  `rail` (both u8 on the wire). A shot starts the count over. He gets a full battery at the spawn
  and when he takes the class after it (with his harpoon, `ammo` -1). What is left of a marine's
  rail gun is cut to the battery's. The HUD shows the shots left (`combat.ts`).
- **Fire and lock.** Each click fires, then one shot each `HUNTER_LASER_COOL` ticks while held
  (`p.cool`, predicted in `gun.ts`). A shot goes down the look and the first enemy in its line takes
  `HUNTER_LASER_HP` (3) (`Room.shoulder()`). The lock starts on the enemy most in line with the
  look, within about 10° (cos > 0.985), 80 m and in sight. It keeps him while he stays on the
  screen (`onScreen()`, `SCREEN`, shared by host and client); once he leaves it, it is lost and
  starts over. After `HUNTER_LASER_LOCK` (3 s) it is locked: the shots go at him and the cannon
  turns to follow him. `HUNTER_LASER_COOL` is 15 at most: `cool` is 4 bits on the wire.
- **Its sight.** The three red sides of a triangle round the foe: tracking, they stand far out, each
  drifting and tilting on its own beat; they close in over the 3 s and join into the triangle at
  the lock, which then turns at 180° a second (`hunterAim()`). The HUD reads the rule locally and sends nothing to the other players. Every
  shot is seen as a red beam from the cannon's muzzle (`Tracer.laser()`), to the locked foe.
- **Folds out.** Stowed, it lies back along his left shoulder; taken, it swings out about the top of
  its post (`CANNON_HINGE`) in `CANNON_SWING` (0.35 s) and points along his look. In the own view it
  rises from under the left shoulder into the top left of the view and points at what the look
  meets (`body.ts`), on its post, which stands on the left shoulder and comes into the view from
  its bottom left corner (`SHOULDER`, `postVertices()`). Its shots are seen to leave from its muzzle in both views. With it, his hands
  hold nothing (`handsFree()`).
- **Tracking sound.** After the first 5 s of a Predator target-lock clip: on a new target three dry
  clicks round 700 Hz 75 ms apart and a breath of noise (`SOUND.HUNTER_TRACK`), then a looped
  electronic hum at 1.5 kHz over 1.2 kHz, each buzzing at 65 Hz, until the lock
  (`SOUND.HUNTER_SEEK`). The lock keeps its tone (`SOUND.HUNTER_LOCK`).
- **Wrist computer.** A bronze housing on the back of his left bracer, its lid open, with three
  square cells of red Yautja-like glyphs (`computer.ts`). Each glyph has `PER_GLYPH` (5) lit
  segments, one per shot left. They go out from the right glyph to the left. With the cannon out,
  in the own view (the user, 2026-11-24, after a reference shot), the left arm bends in low on the
  left of the view, the computer facing up (`COMPUTER`). The right forearm comes in from the right,
  bent nearly level, the hand straight on its line, the index on the computer (`POKE`). It presses
  at each shot (`cool`). The view above stays clear.

## Blades, harpoon and slots (the user, 2026-11-23)

- **Slots.** The wrist blades are on 1, the harpoon on 2, the cannon on 3 and the disc on 4. He has
  all four from the spawn, the blades in hand, and no fists: key 5 does nothing and the HUD shows four
  slots. `step()` gives him the harpoon whenever he has none (`ammo` -1), so a player who picks the
  class after his spawn has it too: a class changes at the next step, not at a respawn. Only the
  client's key and wheel order change (`slotted()`, `src/client/input.ts`); the wire's `KEY.BLADE`
  is the same.
- **Disc.** It takes the laser rifle's slot (`KEY.RIFLE`, `rifled`, `rifle` 0: carried, nothing
  to spend), so the wire is unchanged. FIRE throws it (`STRIKE.DISK`) only while it is in his hand:
  it flies out and comes back to him like a boomerang (`Room.fly()`). His `clip` counts the ticks
  before a thrown disc is in his hand again, `DISK_LOST` (2 s) at the throw; the room sets it to 0
  as he catches it, and a disc still out when it runs down (stuck) is gone and back in the hand.
  `clip` is sent in the snapshot, so the client predicts the next throw exactly; the old cooldown
  in `cool` had only 4 bits on the wire and let the client throw at will. In the own view the arm
  throws it flat, backhand, and the hand stays empty while it is out (`throwOf()`, `body.ts`); the
  others see the hand and the hip empty too. The throw sounds like a blade cutting the air, the
  catch like a clap with a short metal ring, and the shoulder cannon reloads in silence. G with the
  blades no longer throws it. In hand it is the hip's disc (`discVertices()`, `src/client/hunter.ts`),
  and the hip's is hidden. In the own view the hand lies on the disc, both nearly flat, the fingers ahead (`DISC_TILT`), the
  palm flat on its hub and the fingers and the thumb fanned out
  over it, flat on its hub, bent to grip it over their three joints, most at the middle one (`DISC_SPREAD`, `DISC_HOOK`, `HOOK`,
  `Grip.spread`, `Grip.hook`, `THUMB_WIDE`)
  (`DISC_HOLD`, `DISC_CURL`, `DISC_RAISE`, `DISC_TILT`). The disc in hand and in flight is
  `DISC_SCALE` (1.5) times the hip's; its hit radius is still `DISK_R`; in flight it is the same mesh, spinning
  nearly flat, with a blue trail (`Tracer.solids()` and `draw()`, `src/client/beams.ts`).
- **Blades' shape.** Narrower (`WRIST_SLIM`), smooth (`SMOOTH`), more curved (`WRIST_CURVE`) and
  closing evenly onto the point (`WRIST_TAPER`); their heels sit inside the lower housing
  (`WRIST_SINK`, `src/client/katana.ts`).
- **No thrust.** The blades slash where the katana would thrust: FORWARD with FIRE gives `CUT.SLASH`,
  and its special the leap, never the lunge (`cutOf(keys, false)`, `src/shared/blade.ts`).
- **The blades in the own view.** The right hand is a clenched fist, the blades rolled well over to
  the right (`CLAW_ROLL`). The left arm comes up into a guard, its hand open (`GUARD`). In a cut it
  reaches out ahead through the wind-up and snaps in to the belly on the strike (`counter()`).
- **Scope.** The harpoon's special is a sniper scope: held on the right button or G, the view eases
  to an 18° field (about 4×) and the look slows; the left button fires. The host's step gives the
  harpoon no G burst.
- **Reload.** The gun stays in aim. The fired bolt is drawn leaving the tube; from 35 % of the 1.3 s
  reload the next bolt slides in from behind and seats by 85 %, with its own synthesised sound
  (`SOUND.HARPOON_RELOAD`: a servo whine, the slide, the lock home).

## Cannon shot, visions and music (the user, 2026-11-23)

- **Cannon shot.** Each shot is seen as a red ball the pistol's size flying from the muzzle at
  `PLASMA_SPEED`, bursting where it ends (`Tracer.laser()`). The host has already dealt the hit.
- **Thermal.** Shows the humans (marines, ninjas, astronauts) warm: the world is blue; a body goes
  green to yellow, orange and red from cold to hot: a red core and belly, an orange chest, the top
  of the head yellow, the arms yellow above and green at the hands, the legs yellow to green
  (`tv()`, `hpal()`, the heat in `render.ts`). The xenomorphs show cold, all in blue
  (`hunterVision()`'s `cold`); Hunters do not show.
- **Alien scan.** Shows the xenomorphs only: an orange world, each xenomorph glowing cyan (`av()`).
- **Music.** Either vision fades the music out; the heartbeat and the static play in its place
  (`Audio.hush()`).

## Look (the user, 2026-11-24, after a reference picture)

All in `src/client/hunter.ts`; nothing here is on the wire.

- **Dreadlocks.** Eight separate locks a side (`DREADS`, part `Dreads`), rooted under the shell's rim
  from the temple round to the nape, each of its own length with bronze rings. The first three of
  each side fall in front of the shoulder plates onto the chest. They are tubes swept along a curve
  (`sweep()`) and turn with the head as one piece, so they pass through the chest when it turns far.
  The left ones stay inside the shoulder cannon's post. The far level leaves them out.
- **Helmet.** Narrower (`HELM_WIDTH`). The shell's lower edge dips to the bridge of the nose
  (`brow()`), the eyes are two glossy black slots close to it (`aperture()`, set back under the brow),
  and the two brow bands meet in a V on the bridge and climb to the temples, nearly twice as tall.
- **Body.** The armpit is cut about 9 cm higher (`PIT`, `PIT_ARM`), the upper arm and the shoulders
  are leaner, the chest thinner from the side (`CHEST_THIN`) and the flanks straighter.
- **Hide.** Olive (`HIDE`), lightened to a green beige over the pecs and the abs (`HIDE_LIGHT`), with
  dark green spots gathered on the flanks, the back and the limbs (`HIDE_SPOT`). Painted per vertex.
  The hands (`HUNTER_HAND`, `body.ts`) take the same olive in both views.
- **Net.** The chest's net and the new sleeves (`Arm net`, down to the bracers) follow the skin's
  bones and bends (`BENDY`), so they no longer sink into it as the trunk twists.
- **Yoke.** Black leather as the belt's strips over the base of the neck and the collarbones, from
  one shoulder plate to the other (`yoke()`, above `yokeLine()`); the net ends under it.
- **Necklace.** A cord from the neck to the breastbone with four rodent skulls, six fangs and a
  bronze ring round a red stone, laid on the chest's triangles (`front()`), following the skin.
- **Wrist blades.** They and their housing stand off the back of the hand and sit up the forearm
  (`WRIST_LIFT`, `WRIST_UP`); the cut trail (`hunterWristEnds()`) moves with them.
