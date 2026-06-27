const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

async function req<T>(path: string, options?: RequestInit, token?: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  conversations: {
    list: (token: string) => req<any[]>('/conversations', {}, token),
    get:  (id: string, token: string) => req<any>(`/conversations/${id}`, {}, token),
    create: (participantId: string, token: string) =>
      req<any>('/conversations', { method: 'POST', body: JSON.stringify({ participantId }) }, token),
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
    update: (token: string, data: { name?: string; bio?: string; avatar?: string }) =>
      req<any>('/users/me', { method: 'PATCH', body: JSON.stringify(data) }, token),
    search: (q: string, token: string) => req<any[]>(`/users/search?q=${encodeURIComponent(q)}`, {}, token),
    byUsername: (username: string) => req<any>(`/users/u/${username}`),
    matchByPhones: (phones: string[], token: string) =>
      req<any[]>('/users/match-phones', { method: 'POST', body: JSON.stringify({ phones }) }, token),
  },
  notifications: {
    subscribe: (token: string, sub: PushSubscriptionJSON) =>
      req<void>('/notifications/subscribe', { method: 'POST', body: JSON.stringify(sub) }, token),
  },
};
