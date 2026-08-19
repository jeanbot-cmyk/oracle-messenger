import { BACKEND_URL } from '@/config/env';
import { nativeClientHeaders } from '@/services/appVersion';
import type { AuthSession, Conversation, GroupInvitation, Message, User } from '@/types/messenger';
import * as FileSystem from 'expo-file-system/legacy';

const REQUEST_TIMEOUT_MS = 12000;
const UPLOAD_TIMEOUT_MS = 180000;
const AI_TEXT_TIMEOUT_MS = 45000;
const AI_IMAGE_TIMEOUT_MS = 120000;
const AI_VIDEO_TIMEOUT_MS = 240000;
const ADMIN_BROADCAST_TIMEOUT_MS = 120000;

export type HealthResponse = {
  status: string;
  timestamp?: string;
};

export type ConferenceRoomPayload = {
  title?: string;
  description?: string;
  phone?: string;
  contactInfo?: string;
  coverUrl?: string;
  speakerName?: string;
  scheduledAt?: string;
  logoUrl?: string;
  visualIdentity?: string;
  sourceMode?: 'camera' | 'prerecorded';
  prerecordedLocalName?: string;
  planCode?: string;
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
    headers: {
      ...nativeClientHeaders(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<T>;
}

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string, timeoutMs = REQUEST_TIMEOUT_MS): Promise<T> {
  const response = await fetchWithTimeout(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...nativeClientHeaders(),
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
  await assertUploadableLocalFile(data.uri);
  const formData = new FormData();
  formData.append('file', {
    uri: data.uri,
    name: data.name || `oracle-media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    type: data.mime || 'application/octet-stream',
  } as any);
  if (data.name) formData.append('name', data.name);
  if (data.mime) formData.append('mime', data.mime);
  if (data.kind) formData.append('kind', data.kind);
  const response = await fetchWithTimeout(`${BACKEND_URL}/media/upload-file`, {
    method: 'POST',
    headers: { ...nativeClientHeaders(), Authorization: `Bearer ${token}` },
    body: formData as any,
  }, UPLOAD_TIMEOUT_MS);
  if (!response.ok) throw new Error(await parseError(response));
  const uploaded = await response.json();
  if (!uploaded?.url || !Number.isFinite(Number(uploaded.size)) || Number(uploaded.size) <= 0) {
    throw new Error('Upload refusé : le serveur a retourné un fichier vide.');
  }
  return uploaded;
}

async function assertUploadableLocalFile(uri: string) {
  const clean = String(uri || '').trim();
  if (!clean) throw new Error('Fichier local introuvable.');
  if (!/^(file:\/\/|\/)/i.test(clean)) return;
  const fileUri = clean.startsWith('/') ? `file://${clean}` : clean;
  const info = await FileSystem.getInfoAsync(fileUri).catch(() => null);
  if (!info?.exists) throw new Error('Fichier local introuvable.');
  const size = Number((info as { size?: number }).size || 0);
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('Envoi annulé : le fichier local est vide.');
  }
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
  sfuStatus: (token: string) =>
    apiGet<{
      enabled: boolean;
      provider?: string;
      maxAudioParticipants?: number;
      maxVideoParticipants?: number;
      strictRealtime?: boolean;
      privateTurnConfigured?: boolean;
      industrialReady?: boolean;
      reason?: string;
    }>(
      '/calls/sfu-status',
      token,
    ),
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
  conversation: (conversationId: string, token: string) =>
    apiGet<Conversation>(`/conversations/${encodeURIComponent(conversationId)}`, token),
  searchConversations: (query: string, token: string) =>
    apiGet<Conversation[]>(`/conversations/search?q=${encodeURIComponent(query)}`, token),
  createConversation: (participantId: string, token: string) =>
    apiRequest<Conversation>('/conversations', { method: 'POST', body: JSON.stringify({ participantId }) }, token),
  createGroup: (token: string, data: { name?: string; participantIds: string[]; avatar?: string; description?: string }) =>
    apiRequest<Conversation>('/conversations/group', { method: 'POST', body: JSON.stringify(data) }, token),
  addGroupMembers: (token: string, conversationId: string, participantIds: string[]) =>
    apiRequest<Conversation>(
      `/conversations/${encodeURIComponent(conversationId)}/participants`,
      { method: 'POST', body: JSON.stringify({ participantIds }) },
      token,
    ),
  updateGroup: (token: string, conversationId: string, data: { name?: string; avatar?: string | null; description?: string | null; messagePolicy?: string }) =>
    apiRequest<Conversation>(
      `/conversations/${encodeURIComponent(conversationId)}/group`,
      { method: 'PATCH', body: JSON.stringify(data) },
      token,
    ),
  pendingGroupInvitations: (token: string) =>
    apiGet<GroupInvitation[]>('/group-invitations', token),
  acceptGroupInvitation: (token: string, invitationId: string) =>
    apiRequest<{ conversation?: Conversation; invitation?: GroupInvitation }>(
      `/group-invitations/${encodeURIComponent(invitationId)}/accept`,
      { method: 'POST', body: JSON.stringify({}) },
      token,
    ),
  declineGroupInvitation: (token: string, invitationId: string) =>
    apiRequest<{ invitation?: GroupInvitation }>(
      `/group-invitations/${encodeURIComponent(invitationId)}/decline`,
      { method: 'POST', body: JSON.stringify({}) },
      token,
    ),
  cancelGroupInvitation: (token: string, conversationId: string, invitationId: string) =>
    apiRequest<Conversation>(
      `/conversations/${encodeURIComponent(conversationId)}/invitations/${encodeURIComponent(invitationId)}`,
      { method: 'DELETE' },
      token,
    ),
  removeGroupMember: (token: string, conversationId: string, participantId: string) =>
    apiRequest<Conversation>(
      `/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(participantId)}`,
      { method: 'DELETE' },
      token,
    ),
  setGroupMemberRole: (token: string, conversationId: string, participantId: string, role: 'admin' | 'member') =>
    apiRequest<Conversation>(
      `/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(participantId)}/role`,
      { method: 'PATCH', body: JSON.stringify({ role }) },
      token,
    ),
  setGroupMemberPermission: (token: string, conversationId: string, participantId: string, canSendMessages: boolean) =>
    apiRequest<Conversation>(
      `/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(participantId)}/permission`,
      { method: 'PATCH', body: JSON.stringify({ canSendMessages }) },
      token,
    ),
  leaveGroup: (token: string, conversationId: string) =>
    apiRequest<{ ok?: boolean }>(
      `/conversations/${encodeURIComponent(conversationId)}/leave`,
      { method: 'POST', body: JSON.stringify({}) },
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
  markMessageDelivered: (messageId: string, token: string) =>
    apiRequest<{ id: string; conversationId: string; status?: string; updatedAt?: string }>(
      `/messages/${encodeURIComponent(messageId)}/delivered`,
      { method: 'POST', body: JSON.stringify({}) },
      token,
    ),
  pendingMedia: (token: string) => apiGet<Message[]>('/messages/media-pending?limit=80', token),
  sendMessage: (conversationId: string, token: string, content: string, type = 'text', replyToId?: string, clientMessageId?: string) =>
    apiRequest<Message>(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: 'POST', body: JSON.stringify({ content, type, replyToId, clientMessageId }) },
      token,
    ),
  finalizeMediaMessage: (messageId: string, token: string, content: string) =>
    apiRequest<Message>(
      `/messages/${encodeURIComponent(messageId)}/media-ready`,
      { method: 'POST', body: JSON.stringify({ content }) },
      token,
      UPLOAD_TIMEOUT_MS,
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
  interactStory: (token: string, id: string, data: { type: 'like' | 'reaction' | 'comment'; content?: string; emoji?: string }) =>
    apiRequest<any>(
      `/stories/${encodeURIComponent(id)}/interactions`,
      { method: 'POST', body: JSON.stringify(data) },
      token,
    ),
  deleteStory: (token: string, id: string) =>
    apiRequest<void>(`/stories/${encodeURIComponent(id)}`, { method: 'DELETE' }, token),
  businessOverview: (token: string) => apiGet<any>('/business/overview', token),
  businessInitializePaystack: (token: string, nativeReturn = true) =>
    apiRequest<{ reference: string; authorizationUrl: string }>('/business/paystack/initialize', { method: 'POST', body: JSON.stringify({ nativeReturn }) }, token),
  businessVerifyPaystack: (token: string, reference: string) =>
    apiRequest<any>('/business/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
  businessWesternUnionConfig: (token: string) => apiGet<any>('/business/western-union/config', token),
  businessSubmitWesternUnionReceipt: (token: string, data: {
    transactionNumber: string;
    senderFullName: string;
    senderCountry: string;
    amountFcfa: number;
    paymentDate: string;
    receiptDataUrl: string;
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    width?: number;
    height?: number;
  }) => apiRequest<any>('/business/western-union/receipt', { method: 'POST', body: JSON.stringify(data) }, token, UPLOAD_TIMEOUT_MS),
  businessSaveClient: (token: string, data: { id?: string; name: string; phone?: string; email?: string; status?: string; tags?: string[]; notes?: string; value?: number }) =>
    apiRequest<any>('/business/clients', { method: 'POST', body: JSON.stringify(data) }, token),
  businessSaveReminder: (token: string, data: { clientId?: string; title?: string; note?: string; dueAt: string; autoSend?: boolean }) =>
    apiRequest<any>('/business/reminders', { method: 'POST', body: JSON.stringify(data) }, token),
  businessMarkReminderDone: (token: string, id: string, done = true) =>
    apiRequest<any>(`/business/reminders/${encodeURIComponent(id)}/done`, { method: 'PATCH', body: JSON.stringify({ done }) }, token),
  conferenceOverview: (token: string) => apiGet<any>('/conference/plans', token),
  conferenceCreateRoom: (token: string, data: ConferenceRoomPayload) =>
    apiRequest<any>('/conference/rooms', { method: 'POST', body: JSON.stringify(data) }, token),
  conferenceUpdateRoom: (token: string, id: string, data: ConferenceRoomPayload) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  conferenceStartRoom: (token: string, id: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(id)}/start`, { method: 'POST', body: JSON.stringify({}) }, token),
  conferenceStopRoom: (token: string, id: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(id)}/stop`, { method: 'POST', body: JSON.stringify({}) }, token),
  conferenceJoinRoom: (token: string, slug: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/join`, { method: 'POST', body: JSON.stringify({}) }, token),
  conferenceHeartbeat: (token: string, slug: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/heartbeat`, { method: 'POST', body: JSON.stringify({}) }, token),
  conferenceState: (token: string, slug: string) =>
    apiGet<any>(`/conference/rooms/${encodeURIComponent(slug)}/state`, token),
  conferenceRaiseHand: (token: string, slug: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/hand/raise`, { method: 'POST', body: JSON.stringify({}) }, token),
  conferenceCancelHand: (token: string, slug: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/hand/cancel`, { method: 'POST', body: JSON.stringify({}) }, token),
  conferenceAllowHand: (token: string, slug: string, participantId: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/hand/${encodeURIComponent(participantId)}/allow`, { method: 'POST', body: JSON.stringify({}) }, token),
  conferenceRefuseHand: (token: string, slug: string, participantId: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/hand/${encodeURIComponent(participantId)}/refuse`, { method: 'POST', body: JSON.stringify({}) }, token),
  conferenceRevokeHand: (token: string, slug: string, participantId: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/hand/${encodeURIComponent(participantId)}/revoke`, { method: 'POST', body: JSON.stringify({}) }, token),
  conferenceAddQuestion: (token: string, slug: string, content: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/questions`, { method: 'POST', body: JSON.stringify({ content }) }, token),
  conferenceAnswerQuestion: (token: string, slug: string, questionId: string, answer: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/questions/${encodeURIComponent(questionId)}/answer`, { method: 'POST', body: JSON.stringify({ answer }) }, token),
  conferenceUpdateQuestion: (token: string, slug: string, questionId: string, data: { isPinned?: boolean; isAnswered?: boolean; isDeleted?: boolean; priority?: number }) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/questions/${encodeURIComponent(questionId)}`, { method: 'PATCH', body: JSON.stringify(data) }, token),
  conferenceAddReaction: (token: string, slug: string, emoji: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }, token),
  conferenceCreatePoll: (token: string, slug: string, data: { question: string; options: string[]; showResults?: boolean }) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/polls`, { method: 'POST', body: JSON.stringify(data) }, token),
  conferenceClosePoll: (token: string, slug: string, pollId: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/polls/${encodeURIComponent(pollId)}/close`, { method: 'POST', body: JSON.stringify({}) }, token),
  conferenceVotePoll: (token: string, slug: string, pollId: string, optionIndex: number) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/polls/${encodeURIComponent(pollId)}/vote`, { method: 'POST', body: JSON.stringify({ optionIndex }) }, token),
  conferenceShareDocument: (token: string, slug: string, data: { title: string; url?: string; mime?: string; kind?: string }) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/documents`, { method: 'POST', body: JSON.stringify(data) }, token),
  conferenceAiSummary: (token: string, slug: string, promptType: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/ai-summary`, { method: 'POST', body: JSON.stringify({ promptType }) }, token, AI_TEXT_TIMEOUT_MS),
  conferenceBook: (token: string, slug: string) =>
    apiGet<any>(`/conference/rooms/${encodeURIComponent(slug)}/book`, token),
  conferenceGenerateBook: (token: string, slug: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/book/generate`, { method: 'POST', body: JSON.stringify({}) }, token, AI_TEXT_TIMEOUT_MS),
  conferenceInitializeBookPaystack: (token: string, slug: string, nativeReturn = true) =>
    apiRequest<{ reference: string; authorizationUrl: string; amountFcfa?: number }>(`/conference/rooms/${encodeURIComponent(slug)}/book/paystack/initialize`, { method: 'POST', body: JSON.stringify({ nativeReturn }) }, token),
  conferenceVerifyBookPaystack: (token: string, reference: string) =>
    apiRequest<any>('/conference/book/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
  conferenceMarkBookDownloaded: (token: string, slug: string) =>
    apiRequest<any>(`/conference/rooms/${encodeURIComponent(slug)}/book/downloaded`, { method: 'POST', body: JSON.stringify({}) }, token),
  conferenceInitializePaystack: (token: string, planCode: string, nativeReturn = true) =>
    apiRequest<{ reference: string; authorizationUrl: string }>('/conference/paystack/initialize', { method: 'POST', body: JSON.stringify({ planCode, nativeReturn }) }, token),
  conferenceVerifyPaystack: (token: string, reference: string) =>
    apiRequest<any>('/conference/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
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
  aiFlyerMarkDownloaded: (token: string, generationId: string) =>
    apiRequest<{ ok?: boolean; status?: string; downloadedAt?: string | null; purgedAt?: string | null }>(
      `/ai-flyer/generations/${encodeURIComponent(generationId)}/downloaded`,
      { method: 'POST', body: JSON.stringify({}) },
      token,
    ),
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
  aiVideoMarkDownloaded: (token: string, generationId: string) =>
    apiRequest<{ ok?: boolean; status?: string; downloadedAt?: string | null; purgedAt?: string | null }>(
      `/ai-video/generations/${encodeURIComponent(generationId)}/downloaded`,
      { method: 'POST', body: JSON.stringify({}) },
      token,
    ),
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
  adminBusinessWesternUnion: (token: string) => apiGet<any>('/admin/business-western-union', token),
  adminApproveBusinessWesternUnionReceipt: (token: string, receiptId: string) =>
    apiRequest<any>(`/admin/business-western-union/${encodeURIComponent(receiptId)}/approve`, { method: 'POST', body: JSON.stringify({}) }, token),
  adminDeleteBusinessWesternUnionReceipt: (token: string, receiptId: string) =>
    apiRequest<any>(`/admin/business-western-union/${encodeURIComponent(receiptId)}`, { method: 'DELETE' }, token),
  adminNotify: (token: string, data: { title: string; body: string; url?: string }) =>
    apiRequest<any>('/admin/notify', { method: 'POST', body: JSON.stringify(data) }, token),
  adminSystemMessage: (token: string, data: { content?: string; mediaUrl?: string; type?: string }) =>
    apiRequest<any>('/admin/system-message', { method: 'POST', body: JSON.stringify(data) }, token, ADMIN_BROADCAST_TIMEOUT_MS),
  adminBroadcast: (token: string, data: { content?: string; mediaUrl?: string; type?: string }) =>
    apiRequest<any>('/admin/broadcast', { method: 'POST', body: JSON.stringify(data) }, token, ADMIN_BROADCAST_TIMEOUT_MS),
};
