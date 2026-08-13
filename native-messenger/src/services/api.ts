import { BACKEND_URL } from '@/config/env';
import type { AuthSession, Conversation, Message, User } from '@/types/messenger';

const REQUEST_TIMEOUT_MS = 12000;
const UPLOAD_TIMEOUT_MS = 60000;
const AI_TEXT_TIMEOUT_MS = 45000;
const AI_IMAGE_TIMEOUT_MS = 120000;
const AI_VIDEO_TIMEOUT_MS = 240000;

export type HealthResponse = {
  status: string;
  timestamp?: string;
};

async function parseError(response: Response) {
  const text = await response.text().catch(() => '');
  try {
    const body = JSON.parse(text);
    return String(body?.message || body?.error || `HTTP ${response.status}`);
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

export async function apiGet<T>(path: string, token?: string): Promise<T> {
  const response = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<T>;
}

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const response = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  }, timeoutMs);
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<T>;
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Connexion trop lente ou indisponible.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function apiUploadFile(
  token: string,
  data: { uri: string; name?: string; mime?: string; kind?: string },
): Promise<{ url: string; path: string; mime: string; size: number; checksum: string; name: string; kind: string }> {
  const formData = new FormData();
  formData.append('file', {
    uri: data.uri,
    name: data.name || `oracle-media-${Date.now()}`,
    type: data.mime || 'application/octet-stream',
  } as any);
  if (data.name) formData.append('name', data.name);
  if (data.mime) formData.append('mime', data.mime);
  if (data.kind) formData.append('kind', data.kind);
  const response = await fetchWithTimeout(`${BACKEND_URL}/media/upload-file`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData as any,
  }, UPLOAD_TIMEOUT_MS);
  if (!response.ok) throw new Error(await parseError(response));
  return response.json();
}

export const api = {
  health: () => apiGet<HealthResponse>('/health'),
  mediaUpload: (token: string, data: { dataUrl: string; name?: string; mime?: string; kind?: string }) =>
    apiRequest<{ url: string; path: string; mime: string; size: number; checksum: string; name: string; kind: string }>(
      '/media/upload',
      { method: 'POST', body: JSON.stringify(data) },
      token,
      UPLOAD_TIMEOUT_MS,
    ),
  mediaUploadFile: apiUploadFile,
  iceServers: (token: string) => apiGet<{ iceServers?: RTCIceServer[] }>('/calls/ice-servers', token),
  sfuToken: (token: string, room: string, name?: string) =>
    apiRequest<{ enabled: boolean; provider?: string; url?: string; room?: string; token?: string; reason?: string }>(
      '/calls/sfu-token',
      { method: 'POST', body: JSON.stringify({ room, name }) },
      token,
    ),
  callHistory: (token: string, limit = 100) => apiGet<any[]>(`/calls/history?limit=${encodeURIComponent(String(limit))}`, token),
  clearCallHistory: (token: string) =>
    apiRequest<{ ok?: boolean }>('/calls/history', { method: 'DELETE' }, token),
  deleteCallHistoryEntry: (token: string, id: string) =>
    apiRequest<{ ok?: boolean }>(`/calls/history/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
  subscribePush: (token: string, subscription: { type: 'fcm'; token: string; platform: 'android' }) =>
    apiRequest<{ ok?: boolean }>(
      '/notifications/subscribe',
      { method: 'POST', body: JSON.stringify(subscription) },
      token,
    ),
  authGoogle: (idToken: string) =>
    apiRequest<AuthSession>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),
  recoverPhone: (phone: string) =>
    apiRequest<{ found: boolean; name?: string; emailHint?: string; message: string }>('/auth/recover-phone', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  me: (token: string) => apiGet<User>('/users/me', token),
  updateMe: (token: string, data: { name?: string; bio?: string; avatar?: string; phone?: string }) =>
    apiRequest<User>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }, token),
  setPhone: (token: string, phone: string) =>
    apiRequest<User | { error?: string }>('/users/me/phone', { method: 'POST', body: JSON.stringify({ phone }) }, token),
  searchUsers: (query: string, token: string) =>
    apiGet<User[]>(`/users/search?q=${encodeURIComponent(query)}`, token),
  matchContact: (token: string, data: { hashes?: string[]; phone?: string; email?: string }) =>
    apiRequest<User | null>('/users/match-contact', { method: 'POST', body: JSON.stringify(data) }, token),
  matchPhoneHashes: (token: string, hashes: string[]) =>
    apiRequest<User[]>('/users/match-phone-hashes', { method: 'POST', body: JSON.stringify({ hashes }) }, token),
  deleteContact: (contactUserId: string, token: string) =>
    apiRequest<{ ok?: boolean; deleted?: number }>(`/users/contacts/${encodeURIComponent(contactUserId)}`, { method: 'DELETE' }, token),
  byUsername: (username: string) => apiGet<User>(`/users/u/${encodeURIComponent(username)}`),
  conversations: (token: string) => apiGet<Conversation[]>('/conversations', token),
  searchConversations: (query: string, token: string) =>
    apiGet<Conversation[]>(`/conversations/search?q=${encodeURIComponent(query)}`, token),
  createConversation: (participantId: string, token: string) =>
    apiRequest<Conversation>('/conversations', { method: 'POST', body: JSON.stringify({ participantId }) }, token),
  createGroup: (token: string, data: { name?: string; participantIds: string[]; avatar?: string }) =>
    apiRequest<Conversation>('/conversations/group', { method: 'POST', body: JSON.stringify(data) }, token),
  addGroupMembers: (token: string, conversationId: string, participantIds: string[]) =>
    apiRequest<Conversation>(
      `/conversations/${encodeURIComponent(conversationId)}/participants`,
      { method: 'POST', body: JSON.stringify({ participantIds }) },
      token,
    ),
  deleteConversation: (conversationId: string, token: string) =>
    apiRequest<{ ok?: boolean }>(`/conversations/${encodeURIComponent(conversationId)}`, { method: 'DELETE' }, token),
  messages: (conversationId: string, token: string, before?: string) =>
    apiGet<Message[]>(
      `/conversations/${encodeURIComponent(conversationId)}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
      token,
    ),
  markConversationRead: (conversationId: string, token: string, messageId?: string) =>
    apiRequest<{ id: string; conversationId: string; status?: string; updatedAt?: string }[]>(
      `/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: 'POST', body: JSON.stringify(messageId ? { messageId } : {}) },
      token,
    ),
  pendingMedia: (token: string) => apiGet<Message[]>('/messages/media-pending?limit=80', token),
  sendMessage: (conversationId: string, token: string, content: string, type = 'text', replyToId?: string) =>
    apiRequest<Message>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: 'POST', body: JSON.stringify({ content, type, replyToId }) },
      token,
    ),
  editMessage: (messageId: string, token: string, content: string) =>
    apiRequest<Message>(`/messages/${encodeURIComponent(messageId)}`, { method: 'PATCH', body: JSON.stringify({ content }) }, token),
  deleteMessage: (messageId: string, token: string) =>
    apiRequest<void>(`/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' }, token),
  ackMediaSaved: (messageId: string, token: string, checksum: string, size: number) =>
    apiRequest<{ ackConfirmed?: boolean; mediaDelivery?: unknown }>(
      `/messages/${encodeURIComponent(messageId)}/media-local-save`,
      { method: 'POST', body: JSON.stringify({ checksum, size }) },
      token,
    ),
  stories: (token: string) => apiGet<any[]>('/stories', token),
  createStory: (token: string, data: { content: string; caption?: string; type: string; bg?: string }) =>
    apiRequest<any>('/stories', { method: 'POST', body: JSON.stringify(data) }, token),
  viewStory: (token: string, id: string) =>
    apiRequest<any>(`/stories/${encodeURIComponent(id)}/view`, { method: 'POST', body: JSON.stringify({}) }, token),
  deleteStory: (token: string, id: string) =>
    apiRequest<void>(`/stories/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
  businessOverview: (token: string) => apiGet<any>('/business/overview', token),
  businessInitializePaystack: (token: string, nativeReturn = true) =>
    apiRequest<{ reference: string; authorizationUrl: string }>('/business/paystack/initialize', { method: 'POST', body: JSON.stringify({ nativeReturn }) }, token),
  businessVerifyPaystack: (token: string, reference: string) =>
    apiRequest<any>('/business/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
  businessSaveClient: (token: string, data: { id?: string; name: string; phone?: string; email?: string; status?: string; tags?: string[]; notes?: string; value?: number }) =>
    apiRequest<any>('/business/clients', { method: 'POST', body: JSON.stringify(data) }, token),
  businessSaveReminder: (token: string, data: { clientId?: string; title?: string; note?: string; dueAt: string; autoSend?: boolean }) =>
    apiRequest<any>('/business/reminders', { method: 'POST', body: JSON.stringify(data) }, token),
  businessMarkReminderDone: (token: string, id: string, done = true) =>
    apiRequest<any>(`/business/reminders/${encodeURIComponent(id)}/done`, { method: 'PATCH', body: JSON.stringify({ done }) }, token),
  aiAutoOverview: (token: string) => apiGet<any>('/ai-auto/overview', token),
  aiAutoSaveConfig: (token: string, data: { prompt?: string; delayMs?: number; maxWords?: number; recipientScope?: string; isEnabled?: boolean; dailyLimit?: number | null }) =>
    apiRequest<any>('/ai-auto/config', { method: 'POST', body: JSON.stringify(data) }, token),
  aiAutoTest: (token: string, message: string, context: 'tools' | 'conversation' = 'tools') =>
    apiRequest<{ response: string; words: number; costFcfa: number; freeMessagesRemaining?: number; freeTestsRemainingToday?: number }>(
      '/ai-auto/test',
      { method: 'POST', body: JSON.stringify({ message, context }) },
      token,
      AI_TEXT_TIMEOUT_MS,
    ),
  aiAutoTranslate: (token: string, text: string, target: string) =>
    apiRequest<{ translated: string; target: string; provider: 'google' | 'dictionary' }>(
      '/ai-auto/translate',
      { method: 'POST', body: JSON.stringify({ text, target }) },
      token,
      AI_TEXT_TIMEOUT_MS,
    ),
  aiAutoInitializePaystack: (token: string, planCode: string, nativeReturn = true) =>
    apiRequest<{ reference: string; authorizationUrl: string }>('/ai-auto/paystack/initialize', { method: 'POST', body: JSON.stringify({ planCode, nativeReturn }) }, token),
  aiAutoVerifyPaystack: (token: string, reference: string) =>
    apiRequest<any>('/ai-auto/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
  aiFlyerOverview: (token: string) => apiGet<any>('/ai-flyer/overview', token),
  aiFlyerGenerate: (token: string, prompt: string, referenceImages: { dataUrl: string; mime: string; name?: string }[] = []) =>
    apiRequest<any>('/ai-flyer/generate', { method: 'POST', body: JSON.stringify({ prompt, referenceImages }) }, token, AI_IMAGE_TIMEOUT_MS),
  aiFlyerInitializePaystack: (token: string, nativeReturn = true) =>
    apiRequest<{ reference: string; authorizationUrl: string }>('/ai-flyer/paystack/initialize', { method: 'POST', body: JSON.stringify({ nativeReturn }) }, token),
  aiFlyerVerifyPaystack: (token: string, reference: string) =>
    apiRequest<any>('/ai-flyer/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
  aiVideoOverview: (token: string) => apiGet<any>('/ai-video/overview', token),
  aiVideoGenerate: (token: string, data: {
    prompt: string;
    durationSeconds: 8 | 45;
    aspectRatio: '16:9' | '9:16';
    quality: 'hd' | 'full_hd' | 'ultra';
    voiceOver: boolean;
    music: boolean;
    soundEffects: boolean;
    paymentReference?: string;
    referenceImages?: { dataUrl: string; mime: string; name?: string }[];
  }) => apiRequest<any>('/ai-video/generate', { method: 'POST', body: JSON.stringify(data) }, token, AI_VIDEO_TIMEOUT_MS),
  aiVideoInitializePaystack: (token: string, nativeReturn = true) =>
    apiRequest<{ reference: string; authorizationUrl: string }>('/ai-video/paystack/initialize', { method: 'POST', body: JSON.stringify({ nativeReturn }) }, token),
  aiVideoVerifyPaystack: (token: string, reference: string) =>
    apiRequest<any>('/ai-video/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
  adminStats: (token: string) => apiGet<any>('/admin/stats', token),
  adminMetrics: (token: string) => apiGet<any>('/admin/metrics', token),
  adminUsers: (token: string) => apiGet<any[]>('/admin/users', token),
  adminCountries: (token: string) => apiGet<any[]>('/admin/countries', token),
  adminAiAuto: (token: string) => apiGet<any>('/admin/ai-auto', token),
  adminSaveAiPlans: (token: string, plans: any[]) =>
    apiRequest<any>('/admin/ai-auto/plans', { method: 'POST', body: JSON.stringify({ plans }) }, token),
  adminSaveAiSettings: (token: string, settings: Record<string, string>) =>
    apiRequest<any>('/admin/ai-auto/settings', { method: 'POST', body: JSON.stringify({ settings }) }, token),
  adminNotify: (token: string, data: { title: string; body: string; url?: string }) =>
    apiRequest<any>('/admin/notify', { method: 'POST', body: JSON.stringify(data) }, token),
  adminSystemMessage: (token: string, data: { content?: string; mediaUrl?: string; type?: string }) =>
    apiRequest<any>('/admin/system-message', { method: 'POST', body: JSON.stringify(data) }, token),
  adminBroadcast: (token: string, data: { content?: string; mediaUrl?: string; type?: string }) =>
    apiRequest<any>('/admin/broadcast', { method: 'POST', body: JSON.stringify(data) }, token),
};
