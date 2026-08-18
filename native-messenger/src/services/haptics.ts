import * as Haptics from 'expo-haptics';

const LIGHT_UI_HAPTICS_ENABLED = false;

export function selectionHaptic() {
  if (!LIGHT_UI_HAPTICS_ENABLED) return;
  Haptics.selectionAsync().catch(() => undefined);
}

export function lightImpactHaptic() {
  if (!LIGHT_UI_HAPTICS_ENABLED) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}
