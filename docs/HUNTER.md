# Hunter

Le modèle 3D du Hunter est considéré comme déjà créé. Ce plan couvre son intégration jouable
dans `tiny-fps`, inspirée d’_Aliens versus Predator_ (1999). Les armes et la vision doivent être
résolues par l’hôte et prédites par le client, comme le reste du combat.

## Étapes PR

Chaque PR ajoute une capacité jouable et se base sur la précédente jusqu’à ce que la série soit
fusionnée.

1. **Socle, menus et portrait** — rôle réseau stable sur toutes les cartes; choix dans le menu;
   portrait pixel-art dans le HUD et la radio. (PR #334)
2. **Lames de poignet** — commencer avec les lames; dessin dédié sur le bras local et les autres
   joueurs, avec les règles partagées de frappe et de prédiction.
3. **Harpon** — projectile résolu par l’hôte, prédit côté client, avec impacts et munitions.
4. **Disque volant** — projectile qui revient au lanceur, avec états réseau et récupération.
5. **Laser d’épaule** — tir avec assistance de visée bornée, validé côté hôte.
6. **Vision** — bascule locale entre vision thermique et détection des Xénomorphes, avec commande
   et indicateur HUD.
7. **Modèle et identité sonore** — raccorder le modèle 3D au roster et aux vues, générer des cris
   originaux et les intégrer à la radio.

## Ordre technique

Les états de combat sont autoritatifs côté hôte et prédits par le client. Chaque nouvelle arme
ajoute des champs réseau seulement si les états existants ne suffisent pas. L’assistance de visée et
les visions ne doivent pas transmettre aux autres clients des informations de cible cachées.

## État

- [x] PR #334 : rôle, menus, disponibilité sur les cartes et portrait pixel-art HUD/radio.
- [x] PR 2 : lames doubles sur le poignet, visibles en première et troisième personne; combat mêlée partagé et prédit.
- [x] PR 3 : harpon, projectile dédié rapide, étroit, synchronisé et dommageable côté hôte, avec son de lancement.
- [ ] PR 4 : disque volant.
- [ ] PR 5 : laser d’épaule.
- [ ] PR 6 : visions.
- [ ] PR 7 : modèle 3D et cris.

Le projet n’a pas encore d’assets audio dédiés au Hunter. Les sons seront générés par le synthétiseur
du jeu, comme les autres effets, à moins qu’un asset original ne soit fourni.
