#!/usr/bin/env node
/*
 * Oracle Messenger realistic A/B smoke test.
 *
 * Required input:
 *   OM_PHONE_TEST_JSON=/path/to/test-users.json node scripts/phone-ab-smoke-test.js
 *
 * The JSON file must contain:
 * {
 *   "backendUrl": "https://api-messenger.oracle-plus.online",
 *   "users": {
 *     "a": { "id": "...", "token": "..." },
 *     "b": { "id": "...", "token": "..." },
 *     "c": { "id": "...", "token": "..." }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function requireSocketIoClient() {
  const candidates = [
    'socket.io-client',
    path.resolve(__dirname, '../frontend/node_modules/socket.io-client'),
    path.resolve(__dirname, '../backend/node_modules/socket.io-client'),
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch {}
  }
  throw new Error('socket.io-client introuvable. Lancez npm install dans frontend.');
}

const { io } = requireSocketIoClient();

const currentClient = {
  app: 'oracle-messenger-native',
  platform: 'android',
  versionName: '1.0.20260814.6',
  versionCode: 2026081406,
};

const inputPath = process.env.OM_PHONE_TEST_JSON;
if (!inputPath) {
  console.error('OM_PHONE_TEST_JSON est requis');
  process.exit(2);
}

const cfg = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const backendUrl = (cfg.backendUrl || process.env.OM_BACKEND_URL || 'https://api-messenger.oracle-plus.online').replace(/\/$/, '');
const users = cfg.users || {};

function assert(value, message) {
  if (!value) throw new Error(message);
}

function log(step, data = {}) {
  const safe = JSON.stringify(data, (_, value) => {
    if (typeof value === 'string' && value.length > 160) return `${value.slice(0, 157)}...`;
    return value;
  });
  console.log(`[ok] ${step}${safe === '{}' ? '' : ` ${safe}`}`);
}

async function api(pathname, token, options = {}) {
  const res = await fetch(`${backendUrl}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    throw new Error(`API ${res.status} ${pathname}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

function connectPhone(label, token) {
  const socket = io(backendUrl, {
    auth: { token, client: currentClient },
    extraHeaders: {
      'X-Oracle-App': currentClient.app,
      'X-Oracle-Platform': currentClient.platform,
      'X-Oracle-Version': currentClient.versionName,
      'X-Oracle-Version-Code': String(currentClient.versionCode),
    },
    transports: ['websocket', 'polling'],
    reconnection: false,
    timeout: 8000,
  });
  const events = [];
  const watched = [
    'connect', 'connect_error', 'message:new', 'message:update', 'conversation:read',
    'call:incoming', 'call:incoming:received', 'call:answered', 'call:participants-added',
    'call:participant-left', 'call:ended', 'webrtc:offer', 'webrtc:answer', 'webrtc:ice',
    'call:error', 'message:error', 'conversation:error',
  ];
  for (const event of watched) {
    socket.on(event, payload => events.push({ event, payload, at: Date.now() }));
  }
  return { label, socket, events };
}

function waitForEvent(phone, event, predicate = () => true, timeoutMs = 7000) {
  const existing = phone.events.find(item => item.event === event && predicate(item.payload));
  if (existing) return Promise.resolve(existing.payload);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      phone.socket.off(event, handler);
      reject(new Error(`${phone.label}: événement ${event} non reçu en ${timeoutMs} ms`));
    }, timeoutMs);
    const handler = payload => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      phone.socket.off(event, handler);
      resolve(payload);
    };
    phone.socket.on(event, handler);
  });
}

function emitAck(phone, event, payload, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${phone.label}: ack ${event} non reçu`)), timeoutMs);
    phone.socket.emit(event, payload, ack => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

async function main() {
  assert(users.a?.token && users.a?.id, 'Utilisateur test A manquant');
  assert(users.b?.token && users.b?.id, 'Utilisateur test B manquant');
  assert(users.c?.token && users.c?.id, 'Utilisateur test C manquant');

  const started = Date.now();
  const uniq = crypto.randomBytes(4).toString('hex');
  log('configuration', { backendUrl, run: uniq });

  const health = await fetch(`${backendUrl}/health`).then(r => r.json());
  assert(health.status === 'ok', 'Backend health KO');
  log('backend health', health);

  const [meA, meB, meC] = await Promise.all([
    api('/users/me', users.a.token),
    api('/users/me', users.b.token),
    api('/users/me', users.c.token),
  ]);
  log('profils test chargés', { a: meA.name, b: meB.name, c: meC.name });

  const conv = await api('/conversations', users.a.token, {
    method: 'POST',
    body: JSON.stringify({ participantId: users.b.id }),
  });
  assert(conv.id, 'Conversation A/B non créée');
  log('conversation A/B prête', { conversationId: conv.id });

  const listA = await api('/conversations', users.a.token);
  const listB = await api('/conversations', users.b.token);
  assert(listA.some(item => item.id === conv.id), 'Conversation absente côté A');
  assert(listB.some(item => item.id === conv.id), 'Conversation absente côté B');
  log('listes conversations OK', { a: listA.length, b: listB.length });

  const phoneA = connectPhone('Téléphone A', users.a.token);
  const phoneB = connectPhone('Téléphone B', users.b.token);
  const phoneC = connectPhone('Téléphone C', users.c.token);
  try {
    await Promise.all([
      waitForEvent(phoneA, 'connect', () => true, 8000),
      waitForEvent(phoneB, 'connect', () => true, 8000),
      waitForEvent(phoneC, 'connect', () => true, 8000),
    ]);
    log('sockets connectés', {
      a: phoneA.socket.id,
      b: phoneB.socket.id,
      c: phoneC.socket.id,
    });

    phoneA.socket.emit('conversation:join', { conversationId: conv.id });
    phoneB.socket.emit('conversation:join', { conversationId: conv.id });

    const content = `Test reel A vers B ${uniq} accent Éléphant`;
    const ack = await emitAck(phoneA, 'message:send', { conversationId: conv.id, content, type: 'text' });
    assert(ack?.id && ack.content === content, 'Ack message invalide');
    const received = await waitForEvent(phoneB, 'message:new', msg => msg?.id === ack.id || msg?.content === content);
    assert(received.content === content, 'Message reçu différent');
    phoneB.socket.emit('message:delivered', { messageId: received.id });
    phoneB.socket.emit('message:read', { conversationId: conv.id, messageId: received.id });
    await waitForEvent(phoneA, 'conversation:read', payload => payload?.conversationId === conv.id && payload?.userId === users.b.id);
    log('messagerie temps réel A -> B OK', { messageId: received.id });

    const search = await api(`/conversations/search?q=${encodeURIComponent('éléphant')}`, users.a.token);
    assert(search.some(item => item.id === conv.id), 'Recherche accent/minuscule ne retrouve pas le message');
    log('recherche conversation/message OK', { results: search.length });

    const reactionAck = await emitAck(phoneB, 'message:react', { messageId: received.id, emoji: '👍' }).catch(() => null);
    await waitForEvent(phoneA, 'message:update', payload => payload?.id === received.id && Array.isArray(payload?.patch?.reactions));
    log('réaction message OK', { ack: Boolean(reactionAck) });

    const sfuStatus = await api('/calls/sfu-status', users.a.token);
    const mediaProvider = sfuStatus.enabled ? 'livekit' : 'webrtc';
    assert(mediaProvider === 'livekit', `LiveKit/SFU indisponible: ${sfuStatus.reason || 'configuration absente'}`);
    log('statut SFU appels OK', {
      mediaProvider,
      maxAudioParticipants: sfuStatus.maxAudioParticipants,
      maxVideoParticipants: sfuStatus.maxVideoParticipants,
    });

    const callId = `smoke-${Date.now()}-${uniq}`;
    const startAck = await emitAck(phoneA, 'call:start', {
      callId,
      conversationId: conv.id,
      type: 'audio',
      targetUserIds: [users.b.id],
      mediaProvider,
    });
    assert(startAck?.ok, `call:start KO: ${JSON.stringify(startAck)}`);
    const incoming = await waitForEvent(phoneB, 'call:incoming', payload => payload?.callId === callId);
    assert(incoming.conversationId === conv.id, 'call:incoming conversation invalide');
    phoneB.socket.emit('call:incoming:received', { callId, conversationId: conv.id });
    await waitForEvent(phoneA, 'call:incoming:received', payload => payload?.callId === callId && payload?.userId === users.b.id);
    log('sonnerie logique / incoming OK', { callId });

    const answerAck = await emitAck(phoneB, 'call:answer', { callId, accepted: true });
    assert(answerAck?.ok && answerAck.accepted, `call:answer KO: ${JSON.stringify(answerAck)}`);
    await waitForEvent(phoneA, 'call:answered', payload => payload?.callId === callId && payload?.accepted === true);
    log('décrochage logique OK', { callId });

    log('signalisation LiveKit sélectionnée', { callId, mediaProvider });

    const addAck = await emitAck(phoneA, 'call:add-participants', { callId, targetUserIds: [users.c.id] });
    assert(addAck?.ok, `call:add-participants KO: ${JSON.stringify(addAck)}`);
    await waitForEvent(phoneC, 'call:incoming', payload => payload?.callId === callId);
    await waitForEvent(phoneA, 'call:participants-added', payload => payload?.callId === callId && payload?.userIds?.includes(users.c.id));
    log('ajout participant en appel OK', { target: users.c.id });

    phoneA.socket.emit('call:end', { callId });
    await Promise.all([
      waitForEvent(phoneB, 'call:participant-left', payload => payload?.callId === callId && payload?.userId === users.a.id),
      waitForEvent(phoneC, 'call:participant-left', payload => payload?.callId === callId && payload?.userId === users.a.id),
    ]);
    log('sortie appel groupe OK', { callId, userId: users.a.id });

    phoneB.socket.emit('call:end', { callId });
    await waitForEvent(phoneC, 'call:ended', payload => payload?.callId === callId);
    log('fin appel groupe + diffusion OK', { callId });

    const historyA = await api('/calls/history?limit=10', users.a.token);
    const historyB = await api('/calls/history?limit=10', users.b.token);
    assert(historyA.some(entry => entry.callId === callId), 'Historique appel absent côté A');
    assert(historyB.some(entry => entry.callId === callId), 'Historique appel absent côté B');
    log('historique appels OK', { a: historyA[0]?.direction, b: historyB[0]?.direction });

    const ice = await api('/calls/ice-servers', users.a.token);
    assert(Array.isArray(ice.iceServers) && ice.iceServers.length >= 1, 'ICE servers absents');
    const sfu = await api('/calls/sfu-token', users.a.token, {
      method: 'POST',
      body: JSON.stringify({ room: `smoke-${uniq}`, name: meA.name }),
    });
    log('configuration appels OK', { iceServers: ice.iceServers.length, sfuEnabled: Boolean(sfu.enabled) });

    log('test complet réussi', { durationMs: Date.now() - started });
  } finally {
    for (const phone of [phoneA, phoneB, phoneC]) {
      phone.socket.disconnect();
    }
  }
}

main().catch(error => {
  console.error(`[fail] ${error.stack || error.message}`);
  process.exit(1);
});
