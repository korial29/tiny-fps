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

Les cris et appels Hunter sont synthétisés par le moteur audio du jeu; ils n’utilisent aucun extrait
enregistré.
