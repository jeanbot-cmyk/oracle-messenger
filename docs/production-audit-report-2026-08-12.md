# Oracle Messenger - Production Audit Report - 2026-08-12

## Verdict

CONDITIONAL GO.

The backend, realtime Socket.IO flows, presence rules, delivery/read states, offline replay, call signaling state machine, voice-message transport, long-conversation pagination, native static checks, and Android debug APK generation were tested successfully in the local audit environment.

The app is not a full GO for Google Play production because the environment did not provide physical Android devices, adb/logcat, real FCM delivery validation, real microphone/speaker/camera validation, or release signing environment variables for a final signed AAB.

## Evidence

- A/B lab final run: `audit-artifacts/oracle-ab-lab-2026-08-12T14-51-13-075Z/`
- Lab summary: 4435 events, 0 failures.
- Lab actors:
  - A: `9fb03ced-1701-4aed-9566-975a846ddcba`
  - B: `480c725a-75af-4716-a8c4-9b74fa7edccb`
  - Conversation: `bb55da12-a10d-4c18-a9a4-3ff019ee00f9`
- Backend URL under test: `http://localhost:3001`
- Test database: isolated local Postgres container on `127.0.0.1:5433`
- Android debug APK verified before cleanup: `native-messenger/android/app/build/outputs/apk/debug/app-debug.apk`
- APK size before cleanup: 82748720 bytes.
- The debug APK and Gradle/native build intermediates were removed during final cleanup as temporary build artifacts. Regenerate with `cd native-messenger && npm run android:assemble-debug-arm64`.

## A. Tests realised

| Area | Status | Result |
| --- | --- | --- |
| Backend build | TESTE | PASS |
| Backend lint | TESTE | PASS |
| Frontend lint | TESTE | PASS |
| Native TypeScript typecheck | TESTE | PASS |
| Native lint | TESTE | PASS |
| Kotlin debug compilation | TESTE | PASS |
| Android debug APK arm64 build | TESTE | PASS, `BUILD SUCCESSFUL in 17m 5s` |
| Debug APK binary metadata | TESTE | PASS: `online.oracle_plus.messenger`, versionCode `2026081215`, versionName `1.0.20260812.15`, targetSdk `36`, arm64 native code |
| Debug APK signature | TESTE | PASS: Android debug certificate accepted by `apksigner verify` |
| Release config preflight | TESTE | PASS with warning: signing env missing |
| Release signing strict check | TESTE | FAIL as expected: signing env missing |
| Production-ready check | TESTE | FAIL as expected: signing env missing, worktree not committed, new lab files untracked |
| Physical Android A/B | BLOQUE PAR L'ENVIRONNEMENT | `adb` not available in this environment |
| Real FCM notification display | BLOQUE PAR L'ENVIRONNEMENT | no physical device / Firebase delivery path available |
| Real microphone/speaker/camera media | BLOQUE PAR L'ENVIRONNEMENT | no physical Android A/B available |
| Voice-message transport/cache path | SIMULE | PASS in A/B lab |
| Audio/video media transmission | SIMULE | signaling tested; real media not validated |

## B. A/B lab scenarios passed

- Invalid socket token rejected.
- A and B sessions are distinct.
- A and B sockets are distinct.
- Presence active/background flows.
- Presence heartbeat timeout.
- B multi-socket handling: B remains online while one valid socket remains active.
- A to B message.
- B to A message.
- 10-message and 100-message rapid bursts.
- Offline replay: 10 messages A to B, then B reconnects.
- Offline replay: 10 messages B to A, then A reconnects.
- Delivery and read acknowledgements tied to events.
- Invalid FCM path exercised.
- Voice-message metadata/transport/cache acknowledgement in both directions.
- Long conversation: 1000 messages.
- Audio call signaling: accept, reject, cancel, no-answer timeout, accept/cancel race, double-call guard.
- Video call signaling: same state-machine coverage.

## C. Tests failed or blocked

| ID | Area | Status | Cause |
| --- | --- | --- | --- |
| BLK-ANDROID-001 | Physical Android A/B | BLOQUE PAR L'ENVIRONNEMENT | `adb` command not installed; no connected phones visible from the environment. |
| BLK-FCM-001 | Notification display on Android | BLOQUE PAR L'ENVIRONNEMENT | FCM server acceptance and Android display cannot be proven without real device/token path. |
| BLK-MEDIA-001 | Real voice playback/audio/video | BLOQUE PAR L'ENVIRONNEMENT | No real speaker/microphone/camera devices available. |
| BLK-RELEASE-001 | Release APK/AAB signing | BLOQUE PAR L'ENVIRONNEMENT | `ORACLE_MESSENGER_KEYSTORE_FILE`, `ORACLE_MESSENGER_KEYSTORE_PASSWORD`, `ORACLE_MESSENGER_KEY_ALIAS`, `ORACLE_MESSENGER_KEY_PASSWORD` are missing in the shell. |
| BLK-PROD-READY-001 | Production-ready script | TESTE, FAIL | Correctly fails while changes are uncommitted/untracked and release signing is not configured. |

## D. Bugs found and root causes

| ID | Severity | Feature | Root cause | Correction |
| --- | --- | --- | --- | --- |
| BUG-CRIT-001 | CRITIQUE | Socket auth | Invalid Socket.IO token could briefly reach connection handling because auth rejection happened too late in the lifecycle. | Added Socket.IO middleware authentication in `ChatGateway.afterInit`. |
| BUG-MAJ-002 | MAJEUR | Call lifecycle | A new call right after `call:ended` could be rejected because `activeCalls` was cleared after async logging/publishing. | Clear active call state before async logging/publishing. |
| BUG-MAJ-003 | MAJEUR | Call race | Double-call rapid scenario had no participant busy guard. | Added active participant guard and deterministic busy rejection. |
| BUG-MAJ-004 | MAJEUR | Presence | Online state could become stale without reliable heartbeat/background/multi-socket state. | Added heartbeat state tracking, cleanup, active/background distinction, and native heartbeat emission. |
| BUG-MAJ-005 | MAJEUR | Voice playback | Native audio could fail silently due to MediaPlayer/AudioFocus lifecycle and weak error propagation. | Hardened `OracleAudioPlayerView.kt` lifecycle, AudioFocus, progress, one-active-player policy, and visible errors. |
| BUG-MOY-006 | MOYEN | Conversation opening | Long chat could visually reposition after opening instead of showing the latest message immediately. | Reworked `NativeMessageList` with inverted list behavior and non-animated first positioning. |
| BUG-MOY-007 | MOYEN | Session restore | Native session restore trusted local token/UI state too much. | Validate `/users/me` on restore; clear invalid token. |
| BUG-MOY-008 | MOYEN | Native onboarding | Artificial delay made native UI feel like a web loading screen. | Removed artificial delay. |
| BUG-MOY-009 | MOYEN | Media sync lifecycle | Resume timer was not fully tracked/cleaned. | Track and clear resume/startup timers. |
| BUG-MIN-010 | MINEUR | UI wording | Some native screens still exposed legacy Capacitor/Web wording. | Removed visible Capacitor wording and renamed internal style identifiers. |

## E. Corrections performed

- `backend/scripts/oracle-ab-lab.js`: added reproducible HTTP + Socket.IO A/B lab with JSONL event logs and summary output.
- `backend/package.json`: added `audit:ab-lab`.
- `.gitignore`: ignored generated `audit-artifacts/`.
- `backend/src/gateway/chat.gateway.ts`: added auth middleware, presence cleanup, heartbeat support, call race fixes, call busy guard, configurable no-answer timeout.
- `backend/src/gateway/socket-state.service.ts`: added socket presence state and heartbeat tracking.
- `backend/src/notifications/notifications.service.ts`: tightened push failure reporting path.
- `native-messenger/src/screens/home/useNativeRealtimeEvents.ts`: added native heartbeat emission and AppState-aware presence updates.
- `native-messenger/src/screens/home/NativeMessageList.tsx`: improved initial latest-message positioning for long conversations.
- `native-messenger/android/app/src/main/java/online/oracle_plus/messenger/OracleAudioPlayerView.kt`: hardened native audio playback lifecycle.
- `native-messenger/src/screens/home/NativeHomeShell.tsx`: added Android back behavior.
- `native-messenger/src/screens/home/NativeChatPanel.tsx`: removed web-like keyboard offset logic in favor of Android resize behavior.
- `native-messenger/src/screens/home/NativeOnboarding.tsx`: removed artificial loading delay.
- `native-messenger/src/screens/home/useNativeSessionLifecycle.ts`: validates restored sessions server-side.
- `native-messenger/src/screens/home/useNativeMediaSyncLifecycle.ts`: fixes timer cleanup.
- `native-messenger/src/hooks/useNativeCallPeerConnections.ts`, `useNativeCallSocketEvents.ts`, `useNativeLiveKitCall.ts`: lifecycle and disconnect cleanup guards.
- `native-messenger/src/screens/home/NativeChatComposer.tsx`, `useNativeComposerController.ts`, `useNativeVoiceRecorder.ts`, `useNativeHomeShellProps.ts`: voice preview/send stability improvements.
- `native-messenger/src/screens/features/AdminPage.tsx`, `SpiritualityPage.tsx`, `WebPage.tsx`, `ToolsPage.tsx`: removed visible legacy web/native wrapper wording.
- `docs/production-audit-lab.md`: documented the lab.

## F. Web/PWA residual audit

Static native result:

- `native-messenger/src` and `native-messenger/android/app/src/main` have no application use of `WebView`, `window`, `document`, `localStorage`, `sessionStorage`, `navigator.serviceWorker`, or DOM APIs.
- Remaining native timers are tied to call timeout, call route retry, heartbeat, typing timeout, media sync, voice recording tick, API request timeout, and native incoming-call timeout.
- Legacy WebView/Capacitor code still exists under `frontend/android`. This is a legacy PWA wrapper and must not be used as the Play Store native release path.

Decision:

- `native-messenger`: CONSERVER/ADAPTER only native APIs; no WebView UI path found.
- `frontend/android`: CONSERVER only as legacy historical wrapper if still needed outside the native release; otherwise plan a separate removal/deprecation task.

## G. Binary verification

Debug APK:

- File: `native-messenger/android/app/build/outputs/apk/debug/app-debug.apk`
- Size: 82748720 bytes before cleanup.
- Application ID: `online.oracle_plus.messenger`
- Version code: `2026081215`
- Version name: `1.0.20260812.15`
- Min SDK: 24
- Target SDK: 36
- Native code: `arm64-v8a`
- Signature: Android debug certificate.
- Contains native libraries including React Native, Hermes, Reanimated, Worklets, LiveKit/WebRTC (`libjingle_peerconnection_so.so`).
- Cleanup status: removed after verification as a temporary debug artifact.

Release/AAB:

- NON TESTE as final Play binary.
- BLOQUE PAR L'ENVIRONNEMENT because release signing variables are not exported.

## H. Production risks

CRITIQUE:

- Real two-phone Android A/B testing remains required before production.
- Real audio/video media must be verified by human/device test: A hears B, B hears A, camera frames transmitted both ways.
- Real FCM notification display/open-from-notification remains unproven.

MAJEUR:

- Final signed release AAB not generated in this environment.
- Production-ready script fails until changes are committed/tracked and release signing env is configured.
- Legacy `frontend/android` WebView wrapper remains in repository; avoid confusing it with the native release app.

MOYEN:

- Gradle reports deprecated features that will be incompatible with Gradle 10.
- Android permissions include sensitive policy areas (`SYSTEM_ALERT_WINDOW`, full-screen intent, foreground camera/microphone, contacts). These need Play policy review.

FAIBLE:

- Debug APK is debuggable and debug-signed by design.

## Disk accounting

- Space before audit campaign: about 11G free on `/workspaces`.
- Space before final cleanup: 5.3G free on `/workspaces`.
- Space after final cleanup: 7.9G free on `/workspaces`.
- Peak audit/build consumption from start to pre-cleanup: about 5.7G.
- Space recovered by final cleanup: about 2.6G.
- Preserved artifacts: final A/B run, final lab JSONL, final lab summary, final console/backend logs, lab script, documentation, and this report.
- Removed artifacts: intermediate A/B runs, old temporary lab logs, debug APK/build outputs, native `.cxx` build intermediates, audit Postgres container, audit Postgres anonymous Docker volume, audit Postgres Docker image.
