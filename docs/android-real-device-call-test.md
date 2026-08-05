# Oracle Messenger Android Call Test Plan

Tester avec deux vrais téléphones Android connectés à deux comptes différents.

## Prérequis

- Installer le `.aab` via Google Play internal testing, ou installer un APK de test généré depuis le même code.
- Activer notifications, micro, caméra et contacts.
- Vérifier que chaque téléphone peut ouvrir `https://messenger.oracle-plus.online/chat`.
- Utiliser deux réseaux disponibles : Wi-Fi et 4G/5G.

## Matrice obligatoire

Tester dans les deux sens :

- Utilisateur A vers utilisateur B.
- Utilisateur B vers utilisateur A.

Scénarios :

- Application ouverte.
- Application en arrière-plan.
- Téléphone verrouillé.
- Wi-Fi rapide.
- Wi-Fi faible.
- Données mobiles 4G/5G.
- Passage Wi-Fi vers données mobiles pendant l'appel.
- Refus d'appel.
- Annulation avant réponse.
- Raccrochage après acceptation.

## Audio individuel

- Sonnerie côté destinataire.
- Bouton accepter.
- Bouton refuser.
- Micro mute/unmute.
- Durée enregistrée seulement après acceptation.
- Appel manqué sans fausse durée.

## Vidéo individuelle

- Caméra avant.
- Caméra arrière.
- Désactivation caméra.
- Réactivation caméra.
- Synchronisation audio/vidéo.
- Rotation écran.

## Appels de groupe

- 3 participants minimum.
- Un participant refuse : les autres ne doivent pas être coupés.
- Un participant quitte : les autres doivent rester en appel.
- Un nouveau participant accepte : les flux doivent apparaître chez les participants déjà connectés.

## Résultat attendu

Chaque anomalie doit être notée avec :

- téléphone et version Android ;
- réseau utilisé ;
- compte émetteur ;
- compte récepteur ;
- état application ;
- heure du test ;
- résultat observé ;
- capture écran ou vidéo si possible ;
- logs serveur et logs Android si disponibles.
