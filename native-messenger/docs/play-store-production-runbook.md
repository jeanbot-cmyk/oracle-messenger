# Oracle Messenger Native - Play Store Production Runbook

Date: 2026-08-11

## Current Decision

Status: NO-GO for public production until the release signing environment, real Android tests, and Play Console declarations are complete.

The native Android code builds and the debug arm64 validation passes. A production upload still requires a signed Android App Bundle generated from `native-messenger/`.

## Source Of Truth

- App: `native-messenger/`
- Package: `online.oracle_plus.messenger`
- Version name: `1.0.20260811.2`
- Version code: `2026081102`
- Backend: `https://api-messenger.oracle-plus.online`
- Public web domain: `https://messenger.oracle-plus.online`

Do not use the legacy Capacitor Android build for the final Oracle Messenger native release.

## Release Signing

The release shell must provide:

```bash
export ORACLE_MESSENGER_KEYSTORE_FILE=/absolute/path/to/oracle-messenger-upload.jks
export ORACLE_MESSENGER_KEYSTORE_PASSWORD=...
export ORACLE_MESSENGER_KEY_ALIAS=...
export ORACLE_MESSENGER_KEY_PASSWORD=...
```

Do not commit `.jks`, `.keystore`, `.env`, `.apk`, `.aab`, `.pem`, or `.key` files.

Run the strict gate before building:

```bash
cd native-messenger
npm run verify:android-production-ready
```

Expected result when signing is configured:

```text
PASS Android release config preflight
PASS Android production readiness gate
```

## Build The Signed AAB

Use the single production command:

```bash
cd native-messenger
npm run android:production-release
```

This runs:

- TypeScript check.
- Expo lint.
- Strict Android release config and signing verification.
- Gradle `bundleRelease`.
- Final AAB existence check.

Expected AAB:

```text
native-messenger/android/app/build/outputs/bundle/release/app-release.aab
```

Upload this `.aab` to Play Console. Do not upload a debug APK.

## GitHub Actions

The workflow `.github/workflows/android-apk.yml` builds `native-messenger/`.

- On every native change, it builds a debug APK for smoke tests.
- If GitHub release signing secrets are configured, it also runs `npm run android:production-release` and uploads a signed AAB artifact.
- It must not be changed back to `frontend/android` for the native Messenger release.

Required GitHub secrets for signed AAB artifacts:

- `ORACLE_MESSENGER_KEYSTORE_BASE64`
- `ORACLE_MESSENGER_KEYSTORE_PASSWORD`
- `ORACLE_MESSENGER_KEY_ALIAS`
- `ORACLE_MESSENGER_KEY_PASSWORD`

## Google Sign-In Check

Before each Play upload, confirm that Firebase / Google Cloud OAuth still contains Android OAuth clients for package `online.oracle_plus.messenger` with these SHA-1 hashes:

| Usage | SHA-1 |
| --- | --- |
| Upload key | `c780363eb030966eb79d0b8ada64623e9ac1d2c8` |
| Previous Play key | `f2c2572b6ce4c73d3f257b71990575a92a8bfbd1` |
| Current Play App Signing key | `cdb22720d6fb5728a90a3327fd276b283d32a178` |

The script `verify:android-production-ready` validates that these OAuth entries are still present in both `google-services.json` files.

## Internal Or Closed Test Track

Upload the signed AAB to a non-production Play track first.

Minimum test matrix:

- 2 physical Android phones.
- 2 different Google accounts.
- App installed from Play Console test link, not only local APK.
- Wi-Fi, mobile data, weak network.
- App foreground, background, killed, and locked screen.

Critical flows:

- Google Sign-In.
- Session restore and logout.
- Text messages with socket ACK and API fallback.
- Image, document, and voice messages.
- Local media cache and reopen after app restart.
- Incoming and outgoing audio calls.
- Incoming and outgoing video calls.
- Call reject, cancel, end, reconnect, audio route, mute, camera switch.
- Notifications for messages and calls when app is closed or phone is locked.
- Notification tap opens the correct conversation/call.
- Contacts permission allowed and denied.

Record every failure with phone model, Android version, account, network, app state, exact time, screenshot/video, and server logs when available.

## Play Console Declarations

Complete before production review:

- Privacy policy URL.
- Data Safety form.
- Content rating.
- Target audience.
- App access instructions for reviewers if login is required.
- Permissions declaration for contacts, camera, microphone, notifications, foreground service, and full-screen intent.
- Generated content / AI feature disclosures if requested in the Play Console account.
- Developer contact details and store listing assets.

Suggested permission wording:

- Contacts: helps users find existing Oracle Messenger contacts from their device address book after user approval.
- Camera and microphone: enables user-initiated audio/video calls and media capture.
- Notifications, vibration, wake lock, full-screen intent, foreground service: supports message alerts and incoming call experience.
- Bluetooth/audio settings: supports headset and speaker routing during calls.

## Production Rollout

Only promote to production after:

- `npm run android:production-release` passes.
- Signed AAB is installed successfully from Play test track.
- No blocker crashes in Play Console pre-launch / Android vitals.
- Real-device call and notification tests pass.
- Play Console declarations are accepted.

Use a staged rollout first. Monitor crashes, ANRs, sign-in failures, notification delivery, media upload failures, and call connection failures before increasing rollout.

## Known External Blockers In This Workspace

This environment currently cannot finish production by itself because:

- The Play Store signing variables are not present in the shell.
- No physical Android device is attached for locked-screen/call/notification validation.
- Play Console access is not available from the repository.

These are required external inputs, not code tasks.
