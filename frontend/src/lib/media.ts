import { Capacitor } from '@capacitor/core';

/**
 * Request camera/mic access with persistent permission check.
 * - If already granted: opens stream silently (no browser prompt).
 * - If prompt state: requests once, browser remembers the choice.
 * - If denied: throws a user-friendly error.
 */
export async function getMediaStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Les appels ne sont pas disponibles sur ce navigateur. Utilisez Chrome Android, Safari iPhone ou l'application Android.");
  }
  const isNativeAndroid = Capacitor.isNativePlatform?.() === true && Capacitor.getPlatform?.() === 'android';

  // Check existing permission state silently before prompting
  if (!isNativeAndroid && navigator.permissions) {
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
          "Votre caméra ou microphone est désactivé. Activez les autorisations pour continuer."
        );
      }
      // If all granted or prompt — proceed directly, no extra UI shown
    } catch (e: any) {
      // If the error is our own message, rethrow
      if (e.message?.includes('désactivé') || e.message?.includes('bloqué')) throw e;
      // Otherwise permissions API not supported — fall through to getUserMedia
    }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    if (constraints.audio && stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error("Aucun microphone disponible. Activez le micro pour continuer l'appel.");
    }
    if (constraints.video && stream.getVideoTracks().length === 0) {
      stream.getTracks().forEach(track => track.stop());
      throw new Error("Aucune caméra disponible. Activez la caméra pour continuer l'appel vidéo.");
    }
    return stream;
  } catch (err: any) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      throw new Error(
        isNativeAndroid
          ? "Autorisation caméra ou micro refusée. Ouvrez les paramètres Android d’Oracle Messenger, autorisez Caméra et Microphone, puis réessayez."
          : "Votre caméra ou microphone est désactivé. Activez les autorisations pour continuer."
      );
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      throw new Error("Caméra ou microphone introuvable sur cet appareil.");
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      throw new Error("Caméra ou microphone déjà utilisé par une autre application. Fermez-la puis réessayez.");
    }
    if (err.name === 'OverconstrainedError') {
      throw new Error("La caméra ne supporte pas cette qualité. Réessayez avec la caméra disponible.");
    }
    throw err;
  }
}
