# Oracle Messenger Android Native Baseline

Statut: chantier prioritaire, non publiable tant que les tests reels Android ne sont pas valides.

## Decision

La version Android de reference ne doit plus etre le wrapper Capacitor qui charge `https://messenger.oracle-plus.online` via `server.url`.

La base native dediee est `native-messenger/`.

- Package Android: `online.oracle_plus.messenger`
- Version cible initiale: `1.0.20260809.1`
- VersionCode cible initial: `2026080901`
- Backend production: `https://api-messenger.oracle-plus.online`
- Domaine web/PWA conserve: `https://messenger.oracle-plus.online`

## Regles

1. Ne pas utiliser WebView comme interface principale.
2. Ne pas afficher de panneau PWA ou "Installer l'application" dans Android natif.
3. Ne pas publier sur Google Play uniquement parce que le build compile.
4. Ne pas presenter une fonctionnalite comme disponible si elle n'appelle pas le backend reel.
5. Tester le build Android sur telephone physique avant publication.
6. Garder la PWA fonctionnelle, mais elle n'est plus la reference produit.

## Ordre de migration

### Phase 1 - Socle natif

- Navigation native.
- Splash court.
- Logo sans badge bleu.
- Healthcheck API production.
- Gestion erreurs en francais.
- Stockage token dans SecureStore.
- Notifications natives.
- Permissions Android natives.

### Phase 2 - Authentification

- Google Sign-In natif.
- Envoi `idToken` vers `POST /auth/google`.
- Stockage `backendToken`.
- Reprise session apres fermeture/reouverture.
- Reset propre apres desinstallation/reinstallation.

### Phase 3 - Messagerie

- Liste conversations native.
- Conversation native.
- Socket.IO natif.
- Envoi/reception texte.
- Medias avec copie locale fiable.
- Groupes.
- Contacts natifs.

### Phase 4 - Appels

- `react-native-webrtc`.
- TURN prive production.
- LiveKit/SFU si groupes.
- Permissions camera/micro avant appel.
- Camera avant/arriere.
- Micro on/off.
- Audio Android: ecouteur, haut-parleur, Bluetooth.
- Notifications d'appel entrant.
- Sonnerie premium.
- Comportement ecran verrouille.

### Phase 5 - Business / IA / Paiements

- Business CRM natif.
- Auto IA native.
- Paystack via API backend.
- Flyer IA / Video IA avec quotas reels.
- Admin natif ou dashboard admin mobile stabilise.

## Check-list obligatoire avant Play Store

- Installation depuis APK/AAB.
- Connexion Google.
- Profil.
- Chat texte.
- Medias.
- Groupe.
- Appel audio.
- Appel video.
- Camera avant/arriere.
- Micro.
- Haut-parleur/ecouteur/Bluetooth.
- Notifications message.
- Notifications appel.
- Paiement Paystack.
- IA auto-reponse.
- Flyer IA.
- Video IA.
- Business.
- Admin.
- Fermeture/reouverture.
- Reseau faible.
- Mode hors connexion pour contenus deja charges.

## Etat actuel

La base `native-messenger/` est un socle natif initial. Elle permet de verifier:

- identite Android;
- absence de WebView principale;
- connexion au backend production;
- demande de permission notification;
- structure pour migrer les modules critiques.

Elle ne remplace pas encore l'application Play Store tant que les phases 2 a 5 ne sont pas livrees et testees sur telephone Android reel.
