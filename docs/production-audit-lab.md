# Oracle Messenger Production Audit Lab

Ce laboratoire sert à observer un parcours A -> backend -> B et B -> backend -> A avec deux identités de test, des timestamps et une trace JSONL.

Il ne remplace pas les tests Android physiques. Il couvre le niveau intégration/E2E réseau applicatif : HTTP, Socket.IO, présence, accusés, messages hors ligne récupérés par historique et signaling d'appel. Les preuves audio réel, caméra réelle, notification Android affichée, verrouillage écran et changements Wi-Fi/4G nécessitent deux appareils Android.

## Préconditions

- Backend Oracle Messenger lancé et joignable.
- Base PostgreSQL de test avec migrations appliquées.
- `DATABASE_URL` et `JWT_SECRET` disponibles pour créer deux utilisateurs de test automatiquement, ou bien deux jetons existants fournis par variables d'environnement.
- Dépendances installées dans `backend/` et `native-messenger/`.

## Lancement local avec seed automatique

```bash
cd backend
DATABASE_URL="postgresql://..." \
JWT_SECRET="..." \
BACKEND_URL="http://localhost:3001" \
npm run audit:ab-lab
```

Le script crée ou réutilise :

- `Oracle Audit A`
- `Oracle Audit B`
- une conversation directe A/B
- deux contacts réciproques
- deux JWT de test signés avec `JWT_SECRET`

## Lancement avec utilisateurs existants

```bash
cd backend
BACKEND_URL="https://api.example.test" \
ORACLE_A_TOKEN="..." \
ORACLE_B_TOKEN="..." \
ORACLE_AB_CONVERSATION_ID="..." \
ORACLE_A_USER_ID="..." \
ORACLE_B_USER_ID="..." \
npm run audit:ab-lab
```

Les jetons ne sont jamais écrits en clair dans les artefacts.

## Artefacts

Par défaut, les résultats sont écrits dans :

```text
audit-artifacts/oracle-ab-lab-<timestamp>/
```

Fichiers générés :

- `events.jsonl` : chronologie complète avec `seq`, `at`, `elapsedMs`, `actor`, `event`, `data`.
- `summary.json` : résumé machine-readable, nombre d'événements, échecs, identifiants A/B.
- `README.md` : résumé humain du run.

## Scénarios couverts

| Niveau | Scénario | Vérification |
|---|---|---|
| Auth/API | `/health`, `/users/me` via jetons de test | backend joignable et jetons utilisables |
| Présence | A/B active, B background, B active | événements `user:offline` puis `user:online` |
| Message A -> B | `message:send` -> `message:new` -> `message:delivered` -> `message:read` | `sent`, `delivered`, `read` proviennent d'événements serveur/client |
| Message B -> A | même parcours inverse | symétrie B -> A |
| Hors ligne | B déconnecté, A envoie, B reconnecte, B lit l'historique | message persistant récupérable et passage `read` |
| Appel audio | `call:start`, `call:incoming`, `call:answer`, offer/answer/ICE, `call:end` | signaling complet, sans preuve audio physique |
| Appel vidéo | même protocole en type `video` | signaling complet, sans preuve caméra physique |

## Ce que ce labo ne prouve pas

- Google Sign-In réel dans l'UI Android.
- FCM réellement affiché par Android.
- Sonnerie sur écran verrouillé.
- Audio bidirectionnel réel.
- Caméra bidirectionnelle réelle.
- AudioFocus sur appareil.
- Comportement batterie/Doze/OEM.
- Wi-Fi -> 4G/5G et mode avion.
- FPS, CPU, mémoire et batterie Android.

Ces points doivent être validés avec deux téléphones physiques et `adb logcat`.

## Commandes Android physiques complémentaires

```bash
adb devices
adb logcat -c
adb logcat | grep -iE "Oracle|Exception|FATAL|MediaPlayer|Audio|Camera|WebRTC|LiveKit|FCM|Notification"
```

Scénarios obligatoires sur appareils :

- A envoie texte/image/vidéo/fichier/vocal vers B, puis B vers A.
- B arrière-plan, écran verrouillé, app tuée : message puis appel entrant.
- Appel audio réel A <-> B : les deux côtés doivent s'entendre.
- Appel vidéo réel A <-> B : les deux caméras doivent être visibles.
- Changement réseau pendant appel et pendant envoi média.
- Conversation 100, 500, 1000 messages avec dernier message visible immédiatement.
