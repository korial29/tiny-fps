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
- **Lock and fire.** The host keeps the enemy most in line with the look, within about 10°
  (cos > 0.985), 80 m and in sight, as the target. Held for `HUNTER_LASER_LOCK` (3 s) without a
  change of target, it is locked; then each `HUNTER_LASER_COOL` ticks with fire held, a hit takes
  `HUNTER_LASER_HP` (3) (`Room.shoulder()`). The HUD's brackets track the same rule locally and
  send nothing to the other players.
- **Folds out.** Stowed, it lies back along his left shoulder; taken, it swings out about the top of
  its post (`CANNON_HINGE`) in `CANNON_SWING` (0.35 s) and points along his look. In the own view it
  rises from under the left shoulder into the top left of the view and points at what the look
  meets (`body.ts`). Its shots are seen to leave from its muzzle in both views. With it, his hands
  hold nothing and move as unarmed (`handsFree()`).

## Blades, harpoon and slots (the user, 2026-11-23)

- **Slots.** The wrist blades are on 1 and the harpoon on 2; the cannon stays on 3. Only the client's
  key and wheel order change (`slotted()`, `src/client/input.ts`); the wire's `KEY.BLADE` is the same.
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
