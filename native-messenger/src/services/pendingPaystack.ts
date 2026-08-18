import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '@/services/api';
import type { PaystackScope } from '@/screens/home/homeUtils';

const STORAGE_KEY = 'oracle-native-pending-paystack-payments';

export type PendingPaystackPayment = {
  scope: PaystackScope;
  reference: string;
  createdAt: number;
};

function normalizeReference(reference: string) {
  return String(reference || '').trim();
}

async function readAll(): Promise<PendingPaystackPayment[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter(item => item?.scope && item?.reference)
      : [];
  } catch {
    return [];
  }
}

async function writeAll(items: PendingPaystackPayment[]) {
  const fresh = items
    .filter(item => item.reference && Date.now() - item.createdAt < 24 * 60 * 60 * 1000)
    .slice(-12);
  if (!fresh.length) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
}

export async function rememberPendingPaystackPayment(scope: PaystackScope, reference: string) {
  const cleanReference = normalizeReference(reference);
  if (!cleanReference) return;
  const current = await readAll();
  const next = [
    ...current.filter(item => item.reference !== cleanReference),
    { scope, reference: cleanReference, createdAt: Date.now() },
  ];
  await writeAll(next);
}

export async function readPendingPaystackPayments() {
  return readAll();
}

export async function clearPendingPaystackPayment(reference: string) {
  const cleanReference = normalizeReference(reference);
  if (!cleanReference) return;
  const current = await readAll();
  await writeAll(current.filter(item => item.reference !== cleanReference));
}

export async function verifyPaystackScope(token: string, scope: PaystackScope, reference: string) {
  const cleanReference = normalizeReference(reference);
  if (!cleanReference) throw new Error('Référence Paystack absente.');
  if (scope === 'ai') return api.aiAutoVerifyPaystack(token, cleanReference);
  if (scope === 'flyer') return api.aiFlyerVerifyPaystack(token, cleanReference);
  if (scope === 'video') return api.aiVideoVerifyPaystack(token, cleanReference);
  if (scope === 'conference') return api.conferenceVerifyPaystack(token, cleanReference);
  if (scope === 'conference-book') return api.conferenceVerifyBookPaystack(token, cleanReference);
  return api.businessVerifyPaystack(token, cleanReference);
}
