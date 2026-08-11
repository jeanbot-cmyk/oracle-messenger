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

## Configuration Google Sign-In critique

Ne pas recréer le projet Firebase, ne pas changer le package Android et ne pas supprimer les clients OAuth existants sans audit. Oracle Messenger utilise :

- Projet Firebase / Google Cloud : `tchingankong`.
- Project number : `734297398479`.
- Package Android officiel : `online.oracle_plus.messenger`.
- Web client ID serveur : `734297398479-rids78si56kck1u3sjrgnivfdtpr7e89.apps.googleusercontent.com`.

Les empreintes suivantes doivent rester enregistrées dans Firebase et dans Google Cloud OAuth Android pour le package `online.oracle_plus.messenger` :

| Usage | SHA-1 | OAuth Android Client ID |
| --- | --- | --- |
| Play App Signing actuelle | `CD:B2:27:20:D6:FB:57:28:A9:0A:33:27:FD:27:6B:28:3D:32:A1:78` | `734297398479-irrshc48k2d7kotc696gofbellvll43i.apps.googleusercontent.com` |
| Upload key | `C7:80:36:3E:B0:30:96:6E:B7:9D:0B:8A:DA:64:62:3E:9A:C1:D2:C8` | `734297398479-49duf58ok258ni2di43aq7df4pn5tp4d.apps.googleusercontent.com` |
| Ancienne cle Play encore vue sur certaines installations | `F2:C2:57:2B:6C:E4:C7:3D:3F:25:7B:71:99:05:75:A9:2A:8B:FB:D1` | `734297398479-f164rp1c083d77vftt76mk7qm32l2u21.apps.googleusercontent.com` |

SHA-256 Play App Signing actuelle :

```text
26:87:0B:9B:48:69:C2:18:B1:DB:B8:96:EA:B9:C7:56:41:A1:7F:F0:36:18:D2:4A:70:71:23:34:46:52:BE:98
```

SHA-256 upload key :

```text
FB:41:8D:3C:C0:5F:48:DF:8E:FB:C3:28:07:EA:58:F7:B7:93:A8:51:01:FC:46:9E:86:49:1D:BF:1E:6F:88:5F
```

Avant chaque nouvelle AAB :

1. Verifier que `frontend/android/app/google-services.json` contient le client Android `online.oracle_plus.messenger`.
2. Verifier que ce client contient les trois SHA-1 ci-dessus.
3. Verifier que le Web client ID reste `734297398479-rids78si56kck1u3sjrgnivfdtpr7e89.apps.googleusercontent.com`.
4. Ne pas remplacer `google-services.json` par un fichier qui ne contient que `com.oracleplus.android` ou un autre package.
5. Si une erreur Google `DEVELOPER_ERROR` / code 10 revient, lire le diagnostic affiche dans l'app, recuperer le SHA-1 exact du build installe, puis l'ajouter a Firebase et Google Cloud OAuth Android sans supprimer les autres empreintes.

## Permissions à justifier

L'application déclare des permissions liées à la messagerie et aux appels :

- Internet : accès au backend et aux conversations.
- Notifications : réception des messages et appels entrants.
- Vibration : alerte d'appel/message.
- Wake lock : maintenir certains flux actifs pendant les appels.
- Micro/caméra : appels audio/vidéo déclenchés par l'utilisateur.
- Full screen intent : écran d'appel entrant, si accepté par Android/Google Play.
- Contacts : retrouver automatiquement les personnes du carnet d'adresses qui utilisent déjà Oracle Messenger.

Google peut demander une justification pour les contacts, les appels entrants et les notifications. La justification doit rester stricte : messagerie, synchronisation de contacts demandée par l'utilisateur, appel audio, appel vidéo, notification d'appel entrant.

Avant la demande système Android pour les contacts, l'application affiche une explication dans l'écran Contacts. Ne pas remplacer ce flux par une lecture silencieuse : Android et Google Play exigent le consentement utilisateur.

## Cible Android

Le projet cible Android API 36 avec `compileSdkVersion = 36` et `targetSdkVersion = 36`, ce qui prépare la soumission Google Play pour Android 16.

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

## Texte Play Store recommandé

Description courte :

```text
Secure messaging with video calls, AI creative tools and Business automation.
```

Description complète :

```text
Oracle Messenger is a modern communication app built for people and businesses who want messaging, calls, creative tools and business automation in one place.

Chat with contacts, create private or group conversations, share photos, videos, voice notes and documents, and make audio or video calls from a simple mobile interface.

Oracle Messenger also includes creative and productivity tools designed for professional users:

- AI image and flyer creation tools
- Business assistant and CRM features
- Client organization and follow-up reminders
- Smart business messages and automation
- Local media gallery for saved creations and shared files
- Contact discovery and group communication
- Notifications for messages and calls

The goal of Oracle Messenger is not only to send messages. It helps users communicate, create content, organize client conversations and manage business follow-up from one mobile app.

Main features:
- Private messaging and group chats
- Audio and video calls
- Photo, video, voice note and document sharing
- Contact search and contact import
- Message and call notifications
- AI creative tools for images, flyers and content
- Business CRM, reminders and automation features
- Simple, fast and modern mobile interface
- Local access to saved media and creations

Oracle Messenger is designed for daily communication, professional exchanges and business growth.
```
