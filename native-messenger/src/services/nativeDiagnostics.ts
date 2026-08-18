import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Socket } from 'socket.io-client';
import { nativeClientInfo } from '@/services/appVersion';
import { isNativeDebugEnabled, nativeDebugLog, nativeDebugWarn } from '@/services/nativeLogger';

const DIAGNOSTIC_JOURNAL_KEY = 'oracle-native-diagnostic-journal-v1';
const MAX_JOURNAL_ENTRIES = 240;

type DiagnosticSocket = Pick<Socket, 'connected' | 'emit'>;

export type NativeDiagnosticDetails = Record<string, unknown>;

export type NativeDiagnosticEntry = {
  id: string;
  at: string;
  event: string;
  feature: 'message' | 'presence' | 'typing' | 'call' | 'socket' | 'storage' | 'ui';
  conversationId?: string;
  messageId?: string;
  callId?: string;
  details?: NativeDiagnosticDetails;
};

function safeString(value: string, maxLength = 180) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function sanitize(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string') return safeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitize);
  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 30)) {
      if (/token|secret|password|authorization/i.test(key)) continue;
      output[key] = sanitize(item);
    }
    return output;
  }
  return String(value);
}

async function appendJournal(entry: NativeDiagnosticEntry) {
  try {
    const raw = await AsyncStorage.getItem(DIAGNOSTIC_JOURNAL_KEY);
    const current = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(current) ? current : [];
    list.push(entry);
    await AsyncStorage.setItem(DIAGNOSTIC_JOURNAL_KEY, JSON.stringify(list.slice(-MAX_JOURNAL_ENTRIES)));
  } catch (error) {
    nativeDebugWarn('[NativeDiagnosticJournalWriteFailed]', error instanceof Error ? error.message : String(error));
  }
}

function shouldPersistDiagnostic(entry: NativeDiagnosticEntry) {
  if (isNativeDebugEnabled()) return true;
  return /fail|error|reject|skip|missing|timeout|disconnect/i.test(entry.event);
}

function shouldEmitDiagnostic(entry: NativeDiagnosticEntry) {
  if (isNativeDebugEnabled()) return true;
  return shouldPersistDiagnostic(entry);
}

function shouldRecordDiagnosticEvent(event: string) {
  if (isNativeDebugEnabled()) return true;
  return /fail|error|reject|skip|missing|timeout|disconnect/i.test(event);
}

export function recordNativeDiagnostic(
  socket: DiagnosticSocket | null | undefined,
  entry: Omit<NativeDiagnosticEntry, 'id' | 'at'> & { at?: string },
) {
  const shouldRecord = shouldRecordDiagnosticEvent(entry.event);
  const fullEntry: NativeDiagnosticEntry = {
    id: `diag-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: entry.at || new Date().toISOString(),
    event: entry.event,
    feature: entry.feature,
    conversationId: entry.conversationId,
    messageId: entry.messageId,
    callId: entry.callId,
    details: shouldRecord
      ? sanitize({
          ...(entry.details || {}),
          client: nativeClientInfo,
          socketConnected: Boolean(socket?.connected),
        }) as NativeDiagnosticDetails
      : undefined,
  };

  if (!shouldRecord) return fullEntry;

  nativeDebugLog('[NativeDiagnostic]', fullEntry);
  if (shouldPersistDiagnostic(fullEntry)) void appendJournal(fullEntry);

  if (!socket?.connected || !shouldEmitDiagnostic(fullEntry)) return fullEntry;
  const payload = {
    ...fullEntry,
    state: entry.feature,
  };
  socket.emit('client:diagnostic', payload);
  socket.emit('call:diagnostic', payload);
  return fullEntry;
}

export async function readNativeDiagnosticJournal() {
  try {
    const raw = await AsyncStorage.getItem(DIAGNOSTIC_JOURNAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed as NativeDiagnosticEntry[] : [];
  } catch {
    return [];
  }
}

export async function clearNativeDiagnosticJournal() {
  await AsyncStorage.removeItem(DIAGNOSTIC_JOURNAL_KEY);
}
