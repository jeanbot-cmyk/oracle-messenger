/**
 * Request camera/mic access with persistent permission check.
 * - If already granted: opens stream silently (no browser prompt).
 * - If prompt state: requests once, browser remembers the choice.
 * - If denied: throws a user-friendly error.
 */
export async function getMediaStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
  // Check existing permission state silently before prompting
  if (navigator.permissions) {
    try {
      const checks: Promise<PermissionStatus>[] = [
        navigator.permissions.query({ name: 'microphone' as PermissionName }),
      ];
      if (constraints.video) {
        checks.push(navigator.permissions.query({ name: 'camera' as PermissionName }));
      }
      const results = await Promise.all(checks);
      const denied = results.find(r => r.state === 'denied');
      if (denied) {
        throw new Error(
          "L'accès au micro ou à la caméra est bloqué. Activez-le dans les paramètres de votre navigateur."
        );
      }
      // If all granted or prompt — proceed directly, no extra UI shown
    } catch (e: any) {
      // If the error is our own message, rethrow
      if (e.message?.includes('bloqué')) throw e;
      // Otherwise permissions API not supported — fall through to getUserMedia
    }
  }

  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err: any) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      throw new Error(
        "Accès refusé. Veuillez autoriser le micro et la caméra dans les paramètres de votre navigateur."
      );
    }
    throw err;
  }
}
