# Oracle Messenger - checklist test interne Google Play

## Pre requis

- Publier le `.aab` sur une piste Test interne Google Play.
- Ajouter au moins deux testeurs avec deux comptes differents.
- Installer depuis le lien Google Play, pas seulement depuis un APK local.
- Tester sur deux telephones Android physiques.

## Telephones minimum

- Telephone A : Android recent, Wi-Fi + 4G/5G.
- Telephone B : Android different, idealement milieu ou bas de gamme.

## Installation

- L'application s'installe depuis Google Play Test interne.
- L'icone et le nom affiches sont corrects.
- L'ouverture ne plante pas.
- Les demandes d'autorisation sont comprehensibles.
- Refuser contacts/notifications ne bloque pas l'application.

## Authentification

- Creation/connexion compte A.
- Creation/connexion compte B.
- Deconnexion puis reconnexion.
- Reouverture apres fermeture complete.

## Contacts

- Autoriser les contacts sur A.
- Verifier que seuls les contacts presents dans le telephone et inscrits apparaissent.
- Refuser les contacts sur B.
- Verifier que B ne voit pas tous les utilisateurs de la base.

## Messagerie

- A envoie un texte a B.
- B recoit le message app ouverte.
- B recoit le message app en arriere-plan.
- B recoit le message telephone verrouille.
- Tester image, video, document et audio.
- Tester reponse, transfert, copie, suppression et reactions.
- Verifier les statuts : envoye, distribue, lu.
- Verifier "en train d'ecrire".

## Notifications

- Message entrant avec app ouverte.
- Message entrant avec app en arriere-plan.
- Message entrant telephone verrouille.
- Appui notification ouvre la bonne conversation.
- Badge/son/vibration selon les reglages Android.

## Appels

- A appelle B en audio, app ouverte.
- A appelle B en audio, B en arriere-plan.
- A appelle B en audio, B verrouille.
- B appelle A dans les memes conditions.
- Tester appel video dans les deux sens.
- Tester refus, annulation avant reponse, raccrochage.
- Verifier historique : entrant, sortant, manque, duree.

## Reseau

- Wi-Fi stable.
- 4G/5G.
- Reseau lent.
- Passage Wi-Fi vers donnees mobiles pendant un appel.
- Mode avion puis reconnexion.

## Resultat a noter pour chaque bug

- Telephone et version Android.
- Compte emetteur et recepteur.
- Reseau.
- Etat application : ouverte, arriere-plan, verrouillee.
- Heure du test.
- Description du probleme.
- Capture ou video si possible.
- Logs serveur si disponibles.
