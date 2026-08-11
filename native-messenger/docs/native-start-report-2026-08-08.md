# Rapport de demarrage - Android natif Oracle Messenger

Date: 2026-08-08

## Perimetre respecte

Travail effectue uniquement dans le depot Oracle Messenger:

- `/workspaces/oracle-messenger/native-messenger`

Aucun changement applique dans `spirit-app-front`.

## Ce qui a ete cree

- Base Expo / React Native dediee a Oracle Messenger.
- Package Android: `online.oracle_plus.messenger`.
- Version native cible: `1.0.20260809.1`.
- VersionCode cible: `2026080901`.
- Backend production branche: `https://api-messenger.oracle-plus.online`.
- Assets Oracle Messenger sans badge bleu.
- Sons premium existants copies dans la base native.
- Ecran natif de controle production.
- Healthcheck API natif.
- Demande de permission notifications native.
- Documentation de migration Android native.

## Ce qui est volontairement non fait

- Aucune publication Play Store.
- Aucun remplacement du build Play Store actuel.
- Aucun WebView pour charger `messenger.oracle-plus.online`.
- Aucun recyclage de l'application Oracle Plus.
- Aucun bouton simule indiquant qu'une fonctionnalite complete est disponible.

## Validation effectuee

- JSON `package.json`, `app.json`, `package-lock.json`: OK.
- Resolution npm `--package-lock-only`: OK.
- Identite Android: OK.
- Absence de `server.url` dans la base native: OK.
- Backend cible configure: OK.

## Limite environnement

L'environnement de travail est presque plein:

- disque monte a environ 99-100%;
- une installation complete `node_modules` native et un build Android complet peuvent echouer pour cause d'espace disque, pas forcement a cause du code.

Le dossier `spirit-app-front/node_modules` occupe plusieurs Go mais n'a pas ete supprime car le perimetre demande est Oracle Messenger uniquement.

## Prochaine etape technique

1. Installer les dependances natives dans `native-messenger/`.
2. Generer le projet Android natif avec `npm run prebuild:android`.
3. Integrer Google Sign-In natif.
4. Brancher `/auth/google` et SecureStore.
5. Migrer conversations et Socket.IO.
6. Migrer appels avec `react-native-webrtc`.
7. Tester sur telephone Android physique.
8. Generer APK de test.
9. Seulement apres validation, produire un AAB Play Store.
