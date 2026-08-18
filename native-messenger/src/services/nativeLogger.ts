const nativeDebugEnabled = Boolean((globalThis as { __DEV__?: boolean }).__DEV__);

export function nativeDebugLog(...args: unknown[]) {
  if (nativeDebugEnabled) console.info(...args);
}

export function nativeDebugWarn(...args: unknown[]) {
  if (nativeDebugEnabled) console.warn(...args);
}

export function isNativeDebugEnabled() {
  return nativeDebugEnabled;
}
