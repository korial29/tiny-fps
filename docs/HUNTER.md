# Hunter

Le modèle 3D du Hunter est considéré comme déjà créé. Ce plan couvre son intégration jouable
dans `tiny-fps`, inspirée d’*Aliens versus Predator* (1999). Les armes et la vision doivent être
résolues par l’hôte et prédites par le client, comme le reste du combat.

## Étapes

Chaque étape doit rester jouable et être livrée séparément.

1. **Socle de classe et présentation**
   - Réserver un rôle réseau stable au Hunter, le proposer sur les cartes compatibles et le rendre
     sélectionnable dans l’écran titre et le menu pause.
   - Relier son modèle 3D existant à l’apparence du roster, du joueur local et des spectateurs.
   - Ajouter un portrait pixel-art de sa tête au HUD et à l’écran radio.
   - Définir ses stats de déplacement, santé et équipement sans modifier celles des autres classes.
2. **Armes du Hunter**
   - Lame de poignet : réutiliser les animations et règles de mêlée déjà présentes, avec un profil
     propre au Hunter.
   - Harpon : tir à projectile résolu côté hôte, prédiction, impacts, munitions et son.
   - Disque volant : projectile qui revient à son lanceur, avec états réseau et récupération.
   - Laser d’épaule : tir à distance avec acquisition assistée, limitée et lisible pour les autres
     joueurs; la validation du tir reste côté hôte.
3. **Vision et commandes**
   - Ajouter une commande pour basculer entre vision thermique et détection des Xénomorphes.
   - Garder le mode choisi côté client; appliquer les filtres au rendu, sans révéler les cibles aux
     autres classes ni modifier leur vision.
   - Afficher le mode actif et documenter son contrôle dans l’écran des commandes.
4. **Voix, radio et finition**
   - Créer des cris synthétiques originaux évoquant le Predator, sans reprendre d’enregistrement
     ou de réplique du film.
   - Jouer les sons de douleur, de mort et les cris/taunts du Hunter; les taunts d’équipe passent
     par la radio et affichent son portrait.
   - Vérifier menus, roster, HUD, spectateur, reconnexion et échanges réseau avec plusieurs rôles.

## Ordre technique

L’étape 1 précède toutes les autres. L’étape 2 ajoute des champs au protocole seulement si les
états d’arme existants ne suffisent pas; toute modification doit rester compatible avec le client
et l’hôte de la même version. L’étape 3 ne doit pas envoyer aux clients des informations de cible
qu’ils ne sont pas autorisés à voir. L’étape 4 termine l’identité sonore et les portraits.

## État

- [x] Plan et périmètre rédigés.
- [x] Rôle réseau, présence dans les menus, choix de classe sur toutes les cartes, portrait pixel-art HUD/radio.
- [ ] Relier le modèle 3D existant et finaliser l’équipement du Hunter.
- [ ] Quatre armes jouables et équilibrées.
- [ ] Deux modes de vision et commande.
- [ ] Cris, radio et intégration finale.

Le projet n’a pas encore d’assets audio dédiés au Hunter. Les sons seront générés par le synthétiseur
du jeu, comme les autres effets, à moins qu’un asset original ne soit fourni.
