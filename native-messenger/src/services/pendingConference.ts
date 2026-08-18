import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'oracle-native-pending-conference-slug';

export async function rememberPendingConference(slug: string) {
  const clean = String(slug || '').trim();
  if (!clean) return;
  await AsyncStorage.setItem(STORAGE_KEY, clean);
}

export async function consumePendingConference() {
  const slug = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
  if (slug) await AsyncStorage.removeItem(STORAGE_KEY).catch(() => undefined);
  return slug || null;
}
