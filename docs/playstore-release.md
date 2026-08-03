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

Google peut demander une justification pour les appels entrants et les notifications. La justification doit rester stricte : messagerie, appel audio, appel vidéo, notification d'appel entrant.

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

## Limite importante

L'application Android actuelle reste principalement un wrapper Capacitor de la PWA en ligne. Cela améliore la distribution Android et prépare les permissions natives, mais une sonnerie d'appel fiable téléphone verrouillé nécessite encore une implémentation native complète côté notifications/appels entrants.
