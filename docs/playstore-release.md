# Oracle Messenger - publication Play Store

Cette procédure prépare l'application Android Capacitor pour Google Play tout en gardant la PWA actuelle disponible sur `https://messenger.oracle-plus.online`.

## Impact sur la PWA

La publication Android ne remplace pas la PWA.

- La PWA continue d'utiliser `manifest.json`, le Service Worker, `/install` et le cache web.
- L'application Android utilise le package `online.oracle_plus.messenger`.
- Les deux clients utilisent le même backend et les mêmes comptes.
- Les liens `https://messenger.oracle-plus.online/...` peuvent ouvrir le navigateur ou l'app Android selon ce qui est installé.

## Artefacts générés

Le workflow GitHub Actions `Build Android APK and AAB` génère :

- `oracle-messenger-debug-apk` : APK de test installable manuellement.
- `oracle-messenger-release-apk` : APK release, signé si les secrets existent.
- `oracle-messenger-playstore-aab` : fichier `.aab` à envoyer dans Google Play Console.

Pour Play Store, utiliser le fichier `.aab`, pas l'APK debug.

## Secrets GitHub nécessaires pour signer

Configurer ces secrets dans GitHub :

- `ORACLE_MESSENGER_KEYSTORE_BASE64`
- `ORACLE_MESSENGER_KEYSTORE_PASSWORD`
- `ORACLE_MESSENGER_KEY_ALIAS`
- `ORACLE_MESSENGER_KEY_PASSWORD`

Sans ces secrets, le workflow produit des builds de test, mais le fichier final n'est pas prêt pour publication Play Store.

## Créer une clé upload Android

Créer la clé une seule fois, puis la conserver hors du dépôt :

```bash
keytool -genkeypair \
  -v \
  -keystore oracle-messenger-upload.jks \
  -alias oracle-messenger \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Convertir le fichier en base64 pour GitHub Secret :

```bash
base64 -w 0 oracle-messenger-upload.jks
```

Mettre le résultat dans `ORACLE_MESSENGER_KEYSTORE_BASE64`.

## Version Android

Le workflow règle automatiquement :

- `versionCode` avec le numéro d'exécution GitHub Actions ;
- `versionName` avec `1.0.<run_number>`.

Cela évite les refus Play Store liés à un `versionCode` déjà utilisé.

## Points à préparer dans Google Play Console

- Nom : Oracle Messenger.
- Package : `online.oracle_plus.messenger`.
- Politique de confidentialité : `https://messenger.oracle-plus.online/privacy`.
- Catégorie : Communication.
- Type : Application.
- Captures d'écran téléphone.
- Icône haute résolution 512 x 512.
- Bannière graphique si demandée.
- Description courte et longue.
- Coordonnées développeur.
- Questionnaire sécurité des données.
- Justification des permissions sensibles.

## Permissions à justifier

L'application déclare des permissions liées à la messagerie et aux appels :

- Internet : accès au backend et aux conversations.
- Notifications : réception des messages et appels entrants.
- Vibration : alerte d'appel/message.
- Wake lock : maintenir certains flux actifs pendant les appels.
- Micro/caméra en foreground service : appels audio/vidéo.
- Full screen intent : écran d'appel entrant, si accepté par Android/Google Play.
- Contacts : retrouver automatiquement les personnes du carnet d'adresses qui utilisent déjà Oracle Messenger.

Google peut demander une justification pour les contacts, les appels entrants et les notifications. La justification doit rester stricte : messagerie, synchronisation de contacts demandée par l'utilisateur, appel audio, appel vidéo, notification d'appel entrant.

Avant la demande système Android pour les contacts, l'application affiche une explication dans l'écran Contacts. Ne pas remplacer ce flux par une lecture silencieuse : Android et Google Play exigent le consentement utilisateur.

## Cible Android

Le projet cible actuellement Android API 35. Pour une soumission après la limite Google Play du 31 août 2026, prévoir le passage à API 36 avec Android Gradle Plugin/SDK compatibles.

## Validation avant publication

Tester avant envoi production :

1. Installer l'APK debug sur au moins deux téléphones Android.
2. Connexion Google.
3. Ouverture de `/chat`.
4. Envoi texte, photo, vidéo, vocal et document.
5. Réception côté autre utilisateur.
6. Appel audio et appel vidéo.
7. Notification téléphone actif.
8. Notification téléphone verrouillé.
9. Ouverture d'un lien d'invitation.
10. Désinstallation puis réinstallation.
11. Import contacts Android : accepter l'autorisation, vérifier que seuls les contacts du téléphone inscrits apparaissent.
12. Import contacts refusé : vérifier que l'ajout manuel et les invitations restent disponibles.
13. Médias sur réseau lent : envoyer une photo > 8 Mo et vérifier que la compression réduit le temps d'envoi.
14. Médias hors ligne : ouvrir une image/vidéo reçue après fermeture puis réouverture de l'application.
15. Appels : vérifier que l'historique ne compte une durée qu'après acceptation réelle.

## Matrice minimale de test réel

Avant production, tester au minimum :

- 2 comptes Google différents.
- 2 téléphones Android physiques.
- 1 Samsung récent.
- 1 téléphone Android milieu/bas de gamme si possible.
- Chrome/PWA installée et APK Capacitor.
- Wi-Fi stable, données mobiles, réseau lent simulé.
- Application ouverte, arrière-plan, écran verrouillé.

Points qui ne peuvent pas être validés uniquement par build :

- sonnerie fiable écran verrouillé ;
- vibration réelle ;
- permissions contacts Android ;
- comportement batterie/économie d'énergie constructeur ;
- stabilité WebRTC selon NAT/opérateur ;
- qualité audio/vidéo réelle.

## Limite importante

L'application Android actuelle reste principalement un wrapper Capacitor de la PWA en ligne. Cela améliore la distribution Android et prépare les permissions natives, mais une sonnerie d'appel fiable téléphone verrouillé nécessite encore une implémentation native complète côté notifications/appels entrants.
