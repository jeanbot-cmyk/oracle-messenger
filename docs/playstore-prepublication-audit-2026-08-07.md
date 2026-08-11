# Audit pre-publication Google Play - Oracle Messenger

Date: 2026-08-07

## Decision

Statut: pas encore pret pour production publique.

L'application peut avancer vers une piste de test interne Play Store, mais il reste des points a corriger ou justifier avant une publication publique:

- 6 vulnerabilites backend moderees liees a `firebase-admin` et dependances Google.
- AAB release genere, mais la signature release n'est pas configuree dans cet environnement.
- Permissions Android sensibles a justifier dans Play Console.
- Tests physiques multi-telephones non executes dans cet audit.
- Controle haut-parleur Web/PWA limite par implementation actuelle.
- Rappels Business pas encore fiables app fermee sauf via notification/push native.

## Validations realisees

### Backend

- `npm run build`: OK.
- `npm run lint`: OK.
- `npm audit --audit-level=moderate`: 6 vulnerabilites moderees restantes.
- Prisma schema: OK avec `DATABASE_URL` factice de validation.
- API production `https://api-messenger.oracle-plus.online/health`: OK.

### Frontend

- `npm audit fix`: applique pour corriger `js-yaml`.
- `npm audit --audit-level=moderate`: OK, 0 vulnerabilite.
- `npm run build`: OK.
- `npm run lint`: OK.
- Pages production verifiees:
  - `/privacy`: 200.
  - `/terms`: 200.
  - `/install`: 200.

### PWA

- Manifest servi en HTTPS: OK.
- Service Worker servi en HTTPS: OK.
- Headers securite presents: HSTS, CSP, Referrer-Policy, X-Content-Type-Options.
- Cache PWA encore versionne `v194` cote frontend production, alors que backend est `v198`.

### Android / Capacitor

- `npx cap sync android`: OK.
- Avertissement connu: `webDir out` absent car `server.url` pointe vers `https://messenger.oracle-plus.online`.
- `./gradlew app:lintRelease`: OK.
- `./gradlew app:bundleRelease`: OK.
- AAB genere: `frontend/android/app/build/outputs/bundle/release/app-release.aab`.
- Rapport signature: release `Config: null` dans cet environnement. Il faut fournir les variables de signature release avant upload Play Store.

## Correction appliquee pendant l'audit

- Frontend: mise a jour de `js-yaml` de `4.3.0` vers `4.3.1` via `npm audit fix`.
- Fichier modifie: `frontend/package-lock.json`.

## Securite et secrets

Scan realise hors dossiers `node_modules`, `.next`, `dist`, `.git`, `build`, `.android-sdk`, `.secrets`.

Resultat:

- Pas de secret serveur reel trouve dans le code source applicatif.
- `frontend/android/app/google-services.json` contient une cle Firebase Android publique.
- Cette cle doit etre restreinte dans Google Cloud par package name et empreintes SHA autorisees.
- Les secrets release sont lus via variables d'environnement, ce qui est correct.

## Permissions Android a justifier

Permissions detectees:

- `INTERNET`
- `ACCESS_NETWORK_STATE`
- `CAMERA`
- `RECORD_AUDIO`
- `MODIFY_AUDIO_SETTINGS`
- `BLUETOOTH` / `BLUETOOTH_CONNECT`
- `READ_CONTACTS`
- `POST_NOTIFICATIONS`
- `VIBRATE`
- `WAKE_LOCK`
- `USE_FULL_SCREEN_INTENT`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_CAMERA`
- `FOREGROUND_SERVICE_MICROPHONE`

Justification Play Console a preparer:

- Camera/micro: appels audio/video, messages multimedia.
- Contacts: detection des contacts deja presents sur Oracle Messenger.
- Notifications/full screen intent/wake lock/vibration: appels entrants et messages importants.
- Bluetooth/audio settings: routage audio casque, Bluetooth, haut-parleur.

Attention: `USE_FULL_SCREEN_INTENT` est sensible et doit etre justifie par les appels entrants.

## Risques fonctionnels restants

### Appels

- Le bouton haut-parleur Web/PWA appelle `setSinkId` avec `default` dans les deux etats; il ne garantit pas une vraie bascule ecouteur/haut-parleur.
- Les appels verrouilles/arriere-plan dependent fortement des limites Android/PWA et doivent etre valides sur appareils reels.

### IA

- Gemini peut refuser certains contenus independamment de l'application.
- Les quotas Gemini restent un point de saturation.
- IA Video utilise des fragments et FFmpeg, mais le VPS n'a pas de swap et dispose de ressources limitees pour plusieurs generations simultanees.

### Business / CRM

- L'abonnement et le mode apercu existent.
- Les rappels Business sont surtout fiables quand l'application/page est active.
- Pour une fiabilite type alarme, il faut une logique serveur/push/native plus robuste.

### Stockage local

- Les medias conversations ont une confirmation locale avant nettoyage serveur.
- Les galeries IA utilisent encore des data URLs/localStorage pour certains contenus, ce qui peut saturer sur Android. Migration recommandee vers IndexedDB/OPFS.

## Tests non realises dans cet audit

- Tests physiques sur plusieurs telephones Android.
- Tests ecran verrouille reels.
- Tests Play Store piste interne.
- Pentest externe complet.
- Test de charge multi-utilisateurs.
- Test paiement Paystack bout en bout avec transaction reelle.

## Actions recommandees avant production publique

1. Configurer et verifier la signature release AAB:
   - `ORACLE_MESSENGER_KEYSTORE_FILE`
   - `ORACLE_MESSENGER_KEYSTORE_PASSWORD`
   - `ORACLE_MESSENGER_KEY_ALIAS`
   - `ORACLE_MESSENGER_KEY_PASSWORD`

2. Restreindre la cle Firebase Android dans Google Cloud:
   - package `online.oracle_plus.messenger`
   - empreinte SHA-256 release
   - APIs strictement necessaires.

3. Traiter les vulnerabilites backend:
   - tester une strategie de mise a jour `firebase-admin` compatible;
   - eviter `npm audit fix --force` sans validation, car il propose un changement majeur risquant de casser les notifications.

4. Tester une release interne Play Store sur vrais appareils:
   - Android 11, 12, 13, 14, 15/16 si disponible;
   - Samsung, Xiaomi, Oppo/Tecno/Infinix si possible;
   - petit ecran, grand ecran, tablette.

5. Valider les flux critiques:
   - connexion Google;
   - inscription telephone;
   - contacts;
   - messages texte;
   - medias;
   - appels audio/video;
   - notifications app fermee/ecran verrouille;
   - paiement Paystack;
   - IA Auto, Flyer IA, IA Video;
   - Business/CRM.

6. Preparer les declarations Play Console:
   - donnees collectees;
   - permissions sensibles;
   - politique de confidentialite;
   - IA / contenu genere par IA;
   - paiements et conditions d'utilisation.

## Conclusion

Oracle Messenger est techniquement buildable et peut etre envoye en test interne apres signature release correcte.

Publication publique recommandee seulement apres:

- signature release verifiee;
- correction ou acceptation documentee des vulnerabilites backend moderees;
- restriction de la cle Firebase Android;
- tests reels Android;
- validation des permissions Play Console.
