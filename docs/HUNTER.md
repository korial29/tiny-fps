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

- **Always carried.** It is his from the spawn (`rail` and `cap` 0: carried, nothing to spend). It
  never empties, heats or swaps a capsule, and G does not fire the rail gun's ring with it
  (`src/shared/gun.ts`).
- **Fire and lock.** Each click fires, then one shot each `HUNTER_LASER_COOL` ticks while held
  (`p.cool`, predicted in `gun.ts`). A shot goes down the look and the first enemy in its line takes
  `HUNTER_LASER_HP` (3) (`Room.shoulder()`). The lock starts on the enemy most in line with the
  look, within about 10° (cos > 0.985), 80 m and in sight. It keeps him while he stays on the
  screen (`onScreen()`, `SCREEN`, shared by host and client); once he leaves it, it is lost and
  starts over. After `HUNTER_LASER_LOCK` (3 s) it is locked: the shots go at him and the cannon
  turns to follow him. `HUNTER_LASER_COOL` is 15 at most: `cool` is 4 bits on the wire.
- **Its sight.** Three red triangles round the foe, each pointing at him: tracking, they stand far
  out, each drifting on its own beat; they close in over the 3 s and meet on him at the lock
  (`hunterAim()`). The HUD reads the rule locally and sends nothing to the other players. Every
  shot is seen as a red beam from the cannon's muzzle (`Tracer.laser()`), to the locked foe.
- **Folds out.** Stowed, it lies back along his left shoulder; taken, it swings out about the top of
  its post (`CANNON_HINGE`) in `CANNON_SWING` (0.35 s) and points along his look. In the own view it
  rises from under the left shoulder into the top left of the view and points at what the look
  meets (`body.ts`), on its post, which stands on the left shoulder and comes into the view from
  its bottom left corner (`SHOULDER`, `postVertices()`). Its shots are seen to leave from its muzzle in both views. With it, his hands
  hold nothing and move as unarmed (`handsFree()`).

## Blades, harpoon and slots (the user, 2026-11-23)

- **Slots.** The wrist blades are on 1, the harpoon on 2, the cannon on 3 and the disc on 4. He has
  all four from the spawn, the blades in hand, and no fists: key 5 does nothing and the HUD shows four
  slots. `step()` gives him the harpoon whenever he has none (`ammo` -1), so a player who picks the
  class after his spawn has it too: a class changes at the next step, not at a respawn. Only the
  client's key and wheel order change (`slotted()`, `src/client/input.ts`); the wire's `KEY.BLADE`
  is the same.
- **Disc.** It takes the laser rifle's slot (`KEY.RIFLE`, `rifled`, `rifle` and `clip` 0: carried,
  nothing to spend), so the wire is unchanged. FIRE throws it (`STRIKE.DISK`), once each
  `DISK_COOL` ticks; it flies out and comes back to him like a boomerang (`Room.fly()`). G with the
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
- **Thermal.** Shows the humans only (marines, ninjas, astronauts; not xenomorphs nor Hunters). The
  world is blue; a body goes green to yellow, orange and red from cold to hot: a red core and belly,
  orange arms and head, green hands and feet (`tv()`, `hpal()`, the heat in `render.ts`).
- **Alien scan.** Shows the xenomorphs only: an orange world, each xenomorph glowing cyan (`av()`).
- **Music.** Either vision fades the music out; the heartbeat and the static play in its place
  (`Audio.hush()`).
