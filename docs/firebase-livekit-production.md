# Firebase and LiveKit Production Checklist

## Firebase FCM Android

Required for reliable native Android push notifications and incoming-call alerts.

1. Open Firebase Console.
2. Create or select the Oracle Messenger project.
3. Add Android app with package:
   `online.oracle_plus.messenger`
4. Download `google-services.json`.
5. Put it here:
   `frontend/android/app/google-services.json`
6. Create a Firebase service account key for backend sending.
7. Configure one backend environment variable:
   - `FIREBASE_SERVICE_ACCOUNT_JSON` with the full JSON content, or
   - `GOOGLE_APPLICATION_CREDENTIALS` pointing to a mounted JSON file.
8. When using `GOOGLE_APPLICATION_CREDENTIALS`, mount the service account file in the backend container:

   ```yaml
   GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase-admin.json
   FIREBASE_ADMIN_HOST_PATH=/root/secrets/oracle-messenger/firebase-admin.json
   ```

   The container must expose:

   ```yaml
   /root/secrets/oracle-messenger/firebase-admin.json:/run/secrets/firebase-admin.json:ro
   ```

9. Rebuild backend and Android AAB.

Validation:

```bash
scripts/android-preflight.sh
scripts/android-build-aab.sh
```

## LiveKit SFU

Required for scalable group calls. The current mesh WebRTC mode is acceptable for small calls but not for 50, 100, 500, or 1000 participants.

Required environment:

```bash
LIVEKIT_URL=wss://livekit.oracle-plus.online
LIVEKIT_API_KEY=replace_me
LIVEKIT_API_SECRET=replace_me
MAX_AUDIO_CALL_PARTICIPANTS=100
MAX_VIDEO_CALL_PARTICIPANTS=10
```

Local secret file prepared for deployment:

```bash
.secrets/livekit.env
```

The deployment script loads that file automatically before starting the LiveKit container.

Backend endpoint already prepared:

```http
POST /calls/sfu-token
Authorization: Bearer <backend-token>
Content-Type: application/json

{"room":"conversation-or-call-id"}
```

Expected response when configured:

```json
{
  "enabled": true,
  "provider": "livekit",
  "url": "wss://livekit.oracle-plus.online",
  "room": "conversation-or-call-id",
  "token": "..."
}
```

Next implementation step:

- replace group-call mesh media transport with LiveKit client rooms;
- keep current Socket.IO signaling for call invitations, ringing, refusal, missed calls and history;
- use LiveKit only for audio/video transport.
