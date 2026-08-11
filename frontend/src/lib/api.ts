import { BACKEND_URL } from './config';

const BASE = BACKEND_URL;

async function req<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Session expirée. Reconnectez-vous avec Google avant de continuer.');
    }
    const text = await res.text().catch(() => '');
    let message = text;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.message || parsed?.error || text;
    } catch {}
    throw new Error(message || `Erreur ${res.status}`);
  }
  return res.json();
}

export const api = {
  media: {
    upload: (token: string, data: { dataUrl: string; name?: string; mime?: string; kind?: string }) =>
      req<{ url: string; path: string; mime: string; size: number; checksum: string; name: string; kind: string }>(
        '/media/upload',
        { method: 'POST', body: JSON.stringify(data) },
        token,
      ),
  },
  conversations: {
    list: (token: string) => req<any[]>('/conversations', {}, token),
    search: (q: string, token: string) => req<any[]>(`/conversations/search?q=${encodeURIComponent(q)}`, {}, token),
    get:  (id: string, token: string) => req<any>(`/conversations/${id}`, {}, token),
    create: (participantId: string, token: string) =>
      req<any>('/conversations', { method: 'POST', body: JSON.stringify({ participantId }) }, token),
    delete: (id: string, token: string) =>
      req<{ ok: boolean }>(`/conversations/${id}`, { method: 'DELETE' }, token),
  },
  messages: {
    list: (convId: string, token: string, before?: string) =>
      req<any[]>(`/conversations/${convId}/messages${before ? `?before=${before}` : ''}`, {}, token),
    send: (convId: string, content: string, type: string, token: string) =>
      req<any>(`/conversations/${convId}/messages`, { method: 'POST', body: JSON.stringify({ content, type }) }, token),
    delete: (id: string, token: string) =>
      req<void>(`/messages/${id}`, { method: 'DELETE' }, token),
    edit: (id: string, content: string, token: string) =>
      req<any>(`/messages/${id}`, { method: 'PATCH', body: JSON.stringify({ content }) }, token),
  },
  users: {
    me:     (token: string) => req<any>('/users/me', {}, token),
    update: (token: string, data: { name?: string; bio?: string; avatar?: string; phone?: string }) =>
      req<any>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }, token),
    search: (q: string, token: string) => req<any[]>(`/users/search?q=${encodeURIComponent(q)}`, {}, token),
    byUsername: (username: string) => req<any>(`/users/u/${encodeURIComponent(username)}`),
    matchByPhoneHashes: (hashes: string[], token: string) =>
      req<any[]>('/users/match-phone-hashes', { method: 'POST', body: JSON.stringify({ hashes }) }, token),
    matchContact: (data: { hashes?: string[]; phone?: string; email?: string }, token: string) =>
      req<any | null>('/users/match-contact', { method: 'POST', body: JSON.stringify(data) }, token),
  },
  notifications: {
    subscribe: (token: string, sub: PushSubscriptionJSON) =>
      req<void>('/notifications/subscribe', { method: 'POST', body: JSON.stringify(sub) }, token),
  },
  business: {
    overview: (token: string) => req<{ clients: any[]; reminders: any[]; payments?: any[]; access?: any }>('/business/overview', {}, token),
    initializePaystack: (token: string) =>
      req<{ reference: string; authorizationUrl: string }>('/business/paystack/initialize', { method: 'POST', body: JSON.stringify({}) }, token),
    verifyPaystack: (token: string, reference: string) =>
      req<any>('/business/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
  },
  aiAuto: {
    overview: (token: string) => req<any>('/ai-auto/overview', {}, token),
    saveConfig: (token: string, data: {
      prompt?: string;
      delayMs?: number;
      recipientScope?: string;
      isEnabled?: boolean;
      dailyLimit?: number | null;
    }) => req<any>('/ai-auto/config', { method: 'POST', body: JSON.stringify(data) }, token),
    test: (token: string, message: string, context?: 'tools' | 'conversation') =>
      req<{ response: string; words: number; costFcfa: number; freeMessagesRemaining?: number; freeTestsRemainingToday?: number }>('/ai-auto/test', { method: 'POST', body: JSON.stringify({ message, context }) }, token),
    translate: (token: string, text: string, target: string) =>
      req<{ translated: string; target: string; provider: 'google' | 'dictionary' }>('/ai-auto/translate', { method: 'POST', body: JSON.stringify({ text, target }) }, token),
    initializePaystack: (token: string, planCode: string) =>
      req<{ reference: string; authorizationUrl: string }>('/ai-auto/paystack/initialize', { method: 'POST', body: JSON.stringify({ planCode }) }, token),
    verifyPaystack: (token: string, reference: string) =>
      req<any>('/ai-auto/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
  },
  aiFlyer: {
    overview: (token: string) => req<any>('/ai-flyer/overview', {}, token),
    generate: (token: string, prompt: string, referenceImages?: { dataUrl: string; mime: string; name?: string }[]) =>
      req<{ imageUrl: string; mime: string; title: string; mode: 'free' | 'paid'; referenceCount?: number; overview: any }>(
        '/ai-flyer/generate',
        { method: 'POST', body: JSON.stringify({ prompt, referenceImages: referenceImages ?? [] }) },
        token,
      ),
    initializePaystack: (token: string) =>
      req<{ reference: string; authorizationUrl: string }>('/ai-flyer/paystack/initialize', { method: 'POST', body: JSON.stringify({}) }, token),
    verifyPaystack: (token: string, reference: string) =>
      req<any>('/ai-flyer/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
  },
  aiVideo: {
    overview: (token: string) => req<any>('/ai-video/overview', {}, token),
    generate: (token: string, data: {
      prompt: string;
      durationSeconds: 10 | 45;
      aspectRatio: '16:9' | '9:16';
      quality: 'hd' | 'full_hd' | 'ultra';
      voiceOver: boolean;
      music: boolean;
      soundEffects: boolean;
      paymentReference?: string;
      referenceImages?: { dataUrl: string; mime: string; name?: string }[];
    }) => req<any>('/ai-video/generate', { method: 'POST', body: JSON.stringify(data) }, token),
    initializePaystack: (token: string) =>
      req<{ reference: string; authorizationUrl: string }>('/ai-video/paystack/initialize', { method: 'POST', body: JSON.stringify({}) }, token),
    verifyPaystack: (token: string, reference: string) =>
      req<any>('/ai-video/paystack/verify', { method: 'POST', body: JSON.stringify({ reference }) }, token),
  },
  auth: {
    recoverByPhone: (phone: string) =>
      req<{ found: boolean; name?: string; emailHint?: string; message: string }>('/auth/recover-phone', { method: 'POST', body: JSON.stringify({ phone }) }),
  },
};
