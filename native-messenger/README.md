# Oracle Messenger Native Android

Base Android native dediee a Oracle Messenger.

Cette base est separee de la PWA `frontend/` et du wrapper Capacitor actuel.

## Identite

- Nom: Oracle Messenger
- Package Android: `online.oracle_plus.messenger`
- Version native de migration: `1.0.20260811.2`
- VersionCode natif de migration: `2026081102`
- Backend production: `https://api-messenger.oracle-plus.online`
- Domaine web conserve: `https://messenger.oracle-plus.online`

## Commandes

```bash
cd native-messenger
npm install --legacy-peer-deps
npm run dev
npm run prebuild:android
npm run android
```

## Validation native

```bash
cd native-messenger
npm run typecheck
npm run lint
npm run verify:android-release-config
npm run android:assemble-debug-arm64
```

Validation complete reproductible:

```bash
cd native-messenger
npm run verify:native
```

L'APK debug local est genere dans `android/app/build/outputs/apk/debug/`. Il ne doit pas etre committe.

## Release Play Store

La release Play Store doit etre generee depuis cette base native, pas depuis le wrapper Capacitor.

Variables de signature requises dans le shell de release:

```bash
ORACLE_MESSENGER_KEYSTORE_FILE
ORACLE_MESSENGER_KEYSTORE_PASSWORD
ORACLE_MESSENGER_KEY_ALIAS
ORACLE_MESSENGER_KEY_PASSWORD
```

Gate strict sans generer d'AAB:

```bash
cd native-messenger
npm run verify:android-production-ready
```

Generation complete de l'AAB signe:

```bash
cd native-messenger
npm run android:production-release
```

L'AAB release attendu est `android/app/build/outputs/bundle/release/app-release.aab`.
Il ne doit pas etre committe.

## Regle de publication

Ne pas envoyer cette base sur Google Play tant que les modules reels ne sont pas migres et testes sur telephone Android physique:

- auth Google native;
- messagerie native;
- socket natif;
- medias locaux;
- appels `react-native-webrtc`;
- notifications natives;
- Paystack;
- IA;
- Business;
- Admin.

## Interdit

- Ne pas ajouter un WebView pour charger `messenger.oracle-plus.online` comme interface principale.
- Ne pas afficher de bannieres PWA.
- Ne pas publier seulement parce que le build compile.
- Ne pas recycler l'application Oracle Plus comme Oracle Messenger.
