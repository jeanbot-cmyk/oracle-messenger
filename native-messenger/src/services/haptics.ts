import * as Haptics from 'expo-haptics';

export function selectionHaptic() {
  Haptics.selectionAsync().catch(() => undefined);
}

export function lightImpactHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
