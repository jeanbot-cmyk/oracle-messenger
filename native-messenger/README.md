# Oracle Messenger Native Android

Base Android native dediee a Oracle Messenger.

Cette base est separee de la PWA `frontend/` et du wrapper Capacitor actuel.

## Identite

- Nom: Oracle Messenger
- Package Android: `online.oracle_plus.messenger`
- Version native de migration: `1.0.20260810.2`
- VersionCode natif de migration: `2026081002`
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
