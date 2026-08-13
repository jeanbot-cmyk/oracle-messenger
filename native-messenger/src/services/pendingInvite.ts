import AsyncStorage from '@react-native-async-storage/async-storage';

const PENDING_INVITE_KEY = 'oracle.messenger.native.pendingInviteUsername';

function normalizeInviteUsername(value?: string | null) {
  const clean = String(value || '').trim().replace(/^@+/, '');
  if (!clean) return '';
  try {
    return decodeURIComponent(clean).replace(/^@+/, '').replace(/[^a-z0-9._-].*$/i, '').toLowerCase();
  } catch {
    return clean.replace(/[^a-z0-9._-].*$/i, '').toLowerCase();
  }
}

export async function rememberPendingInvite(username?: string | null) {
  const normalized = normalizeInviteUsername(username);
  if (!normalized) return;
  await AsyncStorage.setItem(PENDING_INVITE_KEY, normalized).catch(() => undefined);
}

export async function readPendingInvite() {
  const raw = await AsyncStorage.getItem(PENDING_INVITE_KEY).catch(() => null);
  return normalizeInviteUsername(raw);
}

export async function clearPendingInvite() {
  await AsyncStorage.removeItem(PENDING_INVITE_KEY).catch(() => undefined);
}
