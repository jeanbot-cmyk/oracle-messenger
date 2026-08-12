#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const repoRoot = path.resolve(__dirname, '..', '..');
const backendRequire = createRequire(path.join(repoRoot, 'backend/package.json'));
const nativeRequire = createRequire(path.join(repoRoot, 'native-messenger/package.json'));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

loadEnvFile(path.join(repoRoot, '.env'));
loadEnvFile(path.join(repoRoot, 'backend/.env'));

const { PrismaClient } = backendRequire('@prisma/client');
const { io } = nativeRequire('socket.io-client');

const nowStamp = new Date().toISOString().replace(/[:.]/g, '-');
const BACKEND_URL = process.env.ORACLE_AB_BACKEND_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3001}`;
const OUT_DIR = process.env.ORACLE_AB_LAB_OUTPUT_DIR || path.join(repoRoot, 'audit-artifacts', `oracle-ab-lab-${nowStamp}`);
const TIMEOUT_MS = Number(process.env.ORACLE_AB_LAB_TIMEOUT_MS || 12_000);
const NAMESPACE = String(process.env.ORACLE_AB_LAB_NAMESPACE || 'production').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12) || 'production';
const MESSAGE_BURST_COUNT = Number(process.env.ORACLE_AB_MESSAGE_BURST_COUNT || 100);
const OFFLINE_BATCH_COUNT = Number(process.env.ORACLE_AB_OFFLINE_BATCH_COUNT || 10);
const LONG_CONVERSATION_COUNT = Number(process.env.ORACLE_AB_LONG_CONVERSATION_COUNT || 1000);
const NO_EVENT_WINDOW_MS = Number(process.env.ORACLE_AB_NO_EVENT_WINDOW_MS || 2500);
const CALL_NO_ANSWER_EXPECT_MS = Number(process.env.ORACLE_AB_CALL_NO_ANSWER_EXPECT_MS || 8000);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signJwt(payload, secret, ttlSeconds = 30 * 24 * 60 * 60) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(body))}`;
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|authorization|secret|credential|password|pushToken/i.test(key)) {
      next[key] = item ? '[redacted]' : item;
    } else {
      next[key] = redact(item);
    }
  }
  return next;
}

class Trace {
  constructor(outputDir) {
    this.outputDir = outputDir;
    this.startedAt = Date.now();
    this.records = [];
    this.failures = [];
    fs.mkdirSync(outputDir, { recursive: true });
    this.jsonlPath = path.join(outputDir, 'events.jsonl');
    this.summaryPath = path.join(outputDir, 'summary.json');
  }

  event(actor, event, data = {}) {
    const record = {
      seq: this.records.length + 1,
      at: new Date().toISOString(),
      elapsedMs: Date.now() - this.startedAt,
      actor,
      event,
      data: redact(data),
    };
    this.records.push(record);
    fs.appendFileSync(this.jsonlPath, `${JSON.stringify(record)}\n`);
    const preview = JSON.stringify(record.data).slice(0, 260);
    console.log(`[+${String(record.elapsedMs).padStart(5, ' ')}ms] ${actor.padEnd(8)} ${event} ${preview}`);
    return record;
  }

  pass(id, data = {}) {
    this.event('LAB', `PASS:${id}`, data);
  }

  fail(id, error, data = {}) {
    const failure = {
      id,
      message: error instanceof Error ? error.message : String(error || 'unknown error'),
      data: redact(data),
    };
    this.failures.push(failure);
    this.event('LAB', `FAIL:${id}`, failure);
  }

  writeSummary(extra = {}) {
    const summary = {
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      backendUrl: BACKEND_URL,
      outputDir: this.outputDir,
      totalEvents: this.records.length,
      failures: this.failures,
      ...extra,
    };
    fs.writeFileSync(this.summaryPath, JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(this.outputDir, 'README.md'), [
      '# Oracle Messenger A/B Lab',
      '',
      `Backend: ${BACKEND_URL}`,
      `Started: ${summary.startedAt}`,
      `Finished: ${summary.finishedAt}`,
      `Events: ${summary.totalEvents}`,
      `Failures: ${summary.failures.length}`,
      '',
      'Files:',
      '- `events.jsonl`: event timeline with timestamps and actors.',
      '- `summary.json`: machine-readable result summary.',
      '',
    ].join('\n'));
    return summary;
  }
}

function waitForSocketEvent(trace, label, socket, eventName, predicate = () => true, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timeout waiting for ${label}:${eventName}`));
    }, timeoutMs);
    const handler = payload => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(eventName, handler);
      trace.event(label, `wait:${eventName}`, payload);
      resolve(payload);
    };
    socket.on(eventName, handler);
  });
}

function waitForNoSocketEvent(trace, label, socket, eventName, predicate = () => true, timeoutMs = NO_EVENT_WINDOW_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      trace.event(label, `no-event:${eventName}`, { windowMs: timeoutMs });
      resolve();
    }, timeoutMs);
    const handler = payload => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(eventName, handler);
      reject(new Error(`Unexpected ${label}:${eventName}`));
    };
    socket.on(eventName, handler);
  });
}

function collectSocketEvents(trace, label, socket, eventName, predicate, expectedCount, timeoutMs = TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const events = [];
    const timer = setTimeout(() => {
      socket.off(eventName, handler);
      reject(new Error(`Timeout waiting for ${expectedCount} ${label}:${eventName} events, got ${events.length}`));
    }, timeoutMs);
    const handler = payload => {
      if (!predicate(payload)) return;
      events.push(payload);
      if (events.length >= expectedCount) {
        clearTimeout(timer);
        socket.off(eventName, handler);
        trace.event(label, `collect:${eventName}`, { expectedCount, receivedCount: events.length });
        resolve(events);
      }
    };
    socket.on(eventName, handler);
  });
}

function emitAck(trace, label, socket, eventName, payload, timeoutMs = TIMEOUT_MS) {
  trace.event(label, `emit:${eventName}`, payload);
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(eventName, payload, (error, response) => {
      if (error) {
        reject(new Error(`Ack timeout for ${label}:${eventName}`));
        return;
      }
      trace.event(label, `ack:${eventName}`, response || {});
      resolve(response);
    });
  });
}

function emit(trace, label, socket, eventName, payload) {
  trace.event(label, `emit:${eventName}`, payload);
  socket.emit(eventName, payload);
}

async function httpJson(trace, actor, method, route, token, body) {
  const startedAt = Date.now();
  const response = await fetch(`${BACKEND_URL}${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  trace.event(actor, `http:${method}:${route}`, {
    status: response.status,
    elapsedMs: Date.now() - startedAt,
    body: parsed,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${route}`);
  return parsed;
}

async function httpStatus(trace, actor, method, route, token, body) {
  const startedAt = Date.now();
  const response = await fetch(`${BACKEND_URL}${route}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  const result = {
    ok: response.ok,
    status: response.status,
    elapsedMs: Date.now() - startedAt,
    body: parsed,
  };
  trace.event(actor, `http:${method}:${route}`, result);
  return result;
}

async function seedUsersAndConversation(trace) {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    throw new Error('DATABASE_URL and JWT_SECRET are required unless ORACLE_A_TOKEN, ORACLE_B_TOKEN and ORACLE_AB_CONVERSATION_ID are provided.');
  }

  const prisma = new PrismaClient();
  try {
    const users = {};
    for (const label of ['A', 'B']) {
      const suffix = label.toLowerCase();
      const username = `audit${NAMESPACE}${suffix}`.slice(0, 20);
      users[label] = await prisma.user.upsert({
        where: { googleId: `oracle-audit-${NAMESPACE}-${suffix}` },
        update: {
          name: `Oracle Audit ${label}`,
          status: 'offline',
          pushToken: null,
        },
        create: {
          googleId: `oracle-audit-${NAMESPACE}-${suffix}`,
          email: `oracle-audit-${NAMESPACE}-${suffix}@example.test`,
          name: `Oracle Audit ${label}`,
          username,
          status: 'offline',
        },
      });
    }

    let conversation = await prisma.conversation.findFirst({
      where: {
        type: 'direct',
        AND: [
          { participants: { some: { userId: users.A.id } } },
          { participants: { some: { userId: users.B.id } } },
        ],
      },
      select: { id: true },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          type: 'direct',
          participants: {
            create: [{ userId: users.A.id }, { userId: users.B.id }],
          },
        },
        select: { id: true },
      });
    }

    await prisma.contact.upsert({
      where: { ownerId_contactUserId: { ownerId: users.A.id, contactUserId: users.B.id } },
      create: { ownerId: users.A.id, contactUserId: users.B.id, source: 'production_audit' },
      update: { source: 'production_audit' },
    });
    await prisma.contact.upsert({
      where: { ownerId_contactUserId: { ownerId: users.B.id, contactUserId: users.A.id } },
      create: { ownerId: users.B.id, contactUserId: users.A.id, source: 'production_audit' },
      update: { source: 'production_audit' },
    });

    trace.event('LAB', 'seed:ready', {
      userA: users.A.id,
      userB: users.B.id,
      conversationId: conversation.id,
    });

    return {
      conversationId: conversation.id,
      A: {
        id: users.A.id,
        token: signJwt({ sub: users.A.id, email: users.A.email }, process.env.JWT_SECRET),
      },
      B: {
        id: users.B.id,
        token: signJwt({ sub: users.B.id, email: users.B.email }, process.env.JWT_SECRET),
      },
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function loadLabIdentity(trace) {
  const tokensProvided = process.env.ORACLE_A_TOKEN && process.env.ORACLE_B_TOKEN && process.env.ORACLE_AB_CONVERSATION_ID;
  if (tokensProvided) {
    const userA = process.env.ORACLE_A_USER_ID
      ? { id: process.env.ORACLE_A_USER_ID }
      : await httpJson(trace, 'A', 'GET', '/users/me', process.env.ORACLE_A_TOKEN);
    const userB = process.env.ORACLE_B_USER_ID
      ? { id: process.env.ORACLE_B_USER_ID }
      : await httpJson(trace, 'B', 'GET', '/users/me', process.env.ORACLE_B_TOKEN);
    trace.event('LAB', 'identity:provided', { conversationId: process.env.ORACLE_AB_CONVERSATION_ID });
    return {
      conversationId: process.env.ORACLE_AB_CONVERSATION_ID,
      A: { id: userA.id, token: process.env.ORACLE_A_TOKEN },
      B: { id: userB.id, token: process.env.ORACLE_B_TOKEN },
    };
  }
  return seedUsersAndConversation(trace);
}

function createSocketClient(trace, label, token, overrides = {}) {
  const socket = io(BACKEND_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 400,
    timeout: TIMEOUT_MS,
    ...overrides,
  });
  socket.onAny((event, payload) => trace.event(label, `socket:${event}`, payload || {}));
  socket.on('connect_error', error => trace.event(label, 'socket:connect_error', { message: error.message }));
  return socket;
}

async function connectClient(trace, label, token) {
  const socket = createSocketClient(trace, label, token);
  await waitForSocketEvent(trace, label, socket, 'connect', () => true, TIMEOUT_MS);
  return socket;
}

async function expectInvalidSocketRejected(trace, label, token) {
  const socket = createSocketClient(trace, label, token, {
    reconnection: false,
    timeout: Math.min(TIMEOUT_MS, 5000),
  });
  try {
    await new Promise((resolve, reject) => {
      const timeoutMs = Math.min(TIMEOUT_MS, 5000);
      const timer = setTimeout(() => {
        cleanup();
        if (socket.connected) reject(new Error(`${label} invalid socket connected unexpectedly`));
        else resolve();
      }, timeoutMs);
      const cleanup = () => {
        clearTimeout(timer);
        socket.off('connect', onConnect);
        socket.off('connect_error', onRejected);
        socket.off('disconnect', onRejected);
      };
      const onConnect = () => {
        cleanup();
        reject(new Error(`${label} invalid socket connected unexpectedly`));
      };
      const onRejected = payload => {
        cleanup();
        trace.event(label, 'socket:invalid-rejected', payload || {});
        resolve();
      };
      socket.once('connect', onConnect);
      socket.once('connect_error', onRejected);
      socket.once('disconnect', onRejected);
    });
    trace.pass(`auth:${label}:socket-rejected`, {});
  } finally {
    socket.disconnect();
  }
}

async function runAuthScenario(trace, ctx) {
  const [meA, meB] = await Promise.all([
    httpJson(trace, 'A', 'GET', '/users/me', ctx.A.token),
    httpJson(trace, 'B', 'GET', '/users/me', ctx.B.token),
  ]);
  if (meA?.id !== ctx.A.id) throw new Error('A token resolved to the wrong user');
  if (meB?.id !== ctx.B.id) throw new Error('B token resolved to the wrong user');
  if (meA?.id === meB?.id) throw new Error('A and B resolved to the same user');

  const invalidHttp = await httpStatus(trace, 'LAB', 'GET', '/users/me', 'invalid.audit.token');
  if (invalidHttp.status !== 401) throw new Error(`invalid HTTP token returned ${invalidHttp.status}, expected 401`);
  await expectInvalidSocketRejected(trace, 'INVALID', 'invalid.audit.token');
  trace.pass('auth:distinct-sessions-and-invalid-token', { userA: ctx.A.id, userB: ctx.B.id });
}

async function runMessagingScenario(trace, ctx, fromLabel, toLabel, text) {
  const from = ctx[fromLabel];
  const to = ctx[toLabel];
  const receivedPromise = waitForSocketEvent(
    trace,
    toLabel,
    to.socket,
    'message:new',
    message => typeof message?.content === 'string' && message.content === text,
  );
  const sent = await emitAck(trace, fromLabel, from.socket, 'message:send', {
    conversationId: ctx.conversationId,
    content: text,
    type: 'text',
  });
  if (!sent?.id || sent.status !== 'sent') throw new Error(`message:send did not return sent message for ${fromLabel}`);

  const received = await receivedPromise;
  if (received?.id !== sent.id) throw new Error(`message:new id mismatch for ${fromLabel}->${toLabel}`);
  const deliveredPromise = waitForSocketEvent(trace, fromLabel, from.socket, 'message:update', update => update?.id === sent.id && update?.patch?.status === 'delivered');
  emit(trace, toLabel, to.socket, 'message:delivered', { messageId: sent.id });
  await deliveredPromise;
  const readPromise = waitForSocketEvent(trace, fromLabel, from.socket, 'message:update', update => update?.id === sent.id && update?.patch?.status === 'read');
  emit(trace, toLabel, to.socket, 'message:read', { conversationId: ctx.conversationId, messageId: sent.id });
  await readPromise;
  trace.pass(`messaging:${fromLabel}->${toLabel}`, { messageId: sent.id });
}

async function runRapidMessagesScenario(trace, ctx, fromLabel, toLabel, count) {
  const from = ctx[fromLabel];
  const to = ctx[toLabel];
  const prefix = `Burst ${fromLabel}->${toLabel} ${Date.now()}`;
  const receivePromise = collectSocketEvents(
    trace,
    toLabel,
    to.socket,
    'message:new',
    message => typeof message?.content === 'string' && message.content.startsWith(prefix),
    count,
    Math.max(TIMEOUT_MS, count * 700),
  );

  const sentMessages = [];
  for (let index = 0; index < count; index += 1) {
    const sequence = String(index + 1).padStart(3, '0');
    const sent = await emitAck(trace, fromLabel, from.socket, 'message:send', {
      conversationId: ctx.conversationId,
      content: `${prefix} #${sequence}`,
      type: 'text',
    }, Math.max(TIMEOUT_MS, count * 300));
    if (!sent?.id || sent.status !== 'sent') throw new Error(`burst send failed at #${sequence}`);
    sentMessages.push(sent);
  }

  const received = await receivePromise;
  const receivedIds = received.map(message => message.id);
  if (new Set(receivedIds).size !== count) throw new Error(`burst duplicate IDs detected for ${fromLabel}->${toLabel}`);
  const sentIds = sentMessages.map(message => message.id);
  const missing = sentIds.filter(id => !receivedIds.includes(id));
  if (missing.length) throw new Error(`burst receiver missed ${missing.length} messages for ${fromLabel}->${toLabel}`);
  const receivedSequences = received.map(message => Number(String(message.content).match(/#(\d+)$/)?.[1] ?? '0'));
  const outOfOrder = receivedSequences.some((sequence, index) => sequence !== index + 1);
  if (outOfOrder) {
    throw new Error(`burst receiver order mismatch for ${fromLabel}->${toLabel}: ${receivedSequences.join(',')}`);
  }

  const deliveredPromise = collectSocketEvents(
    trace,
    fromLabel,
    from.socket,
    'message:update',
    update => sentIds.includes(update?.id) && update?.patch?.status === 'delivered',
    count,
    Math.max(TIMEOUT_MS, count * 700),
  );
  for (const id of sentIds) emit(trace, toLabel, to.socket, 'message:delivered', { messageId: id });
  await deliveredPromise;

  const readPromise = collectSocketEvents(
    trace,
    fromLabel,
    from.socket,
    'message:update',
    update => sentIds.includes(update?.id) && update?.patch?.status === 'read',
    count,
    Math.max(TIMEOUT_MS, count * 700),
  );
  emit(trace, toLabel, to.socket, 'message:read', { conversationId: ctx.conversationId, messageId: sentIds[sentIds.length - 1] });
  await readPromise;
  trace.pass(`messaging-burst:${fromLabel}->${toLabel}`, { count });
}

async function runOfflineBatchScenario(trace, ctx, fromLabel, toLabel, count) {
  const from = ctx[fromLabel];
  const to = ctx[toLabel];
  to.socket.disconnect();
  trace.event(toLabel, 'socket:manual-disconnect', {});
  await sleep(600);

  const prefix = `Offline ${fromLabel}->${toLabel} ${Date.now()}`;
  const sentMessages = [];
  for (let index = 0; index < count; index += 1) {
    const sequence = String(index + 1).padStart(3, '0');
    const sent = await emitAck(trace, fromLabel, from.socket, 'message:send', {
      conversationId: ctx.conversationId,
      content: `${prefix} #${sequence}`,
      type: 'text',
    });
    if (!sent?.id) throw new Error(`offline send failed at #${sequence}`);
    sentMessages.push(sent);
  }

  to.socket = await connectClient(trace, toLabel, to.token);
  emit(trace, toLabel, to.socket, 'conversation:join', { conversationId: ctx.conversationId });
  await sleep(300);

  const messages = await httpJson(trace, toLabel, 'GET', `/conversations/${encodeURIComponent(ctx.conversationId)}/messages`, to.token);
  const expectedIds = sentMessages.map(message => message.id);
  const historyIds = Array.isArray(messages) ? messages.map(message => message.id) : [];
  const missing = expectedIds.filter(id => !historyIds.includes(id));
  if (missing.length) throw new Error(`offline history missed ${missing.length}/${count} messages for ${fromLabel}->${toLabel}`);
  const historySequences = messages
    .filter(message => expectedIds.includes(message.id))
    .map(message => Number(String(message.content).match(/#(\d+)$/)?.[1] ?? '0'));
  const outOfOrder = historySequences.some((sequence, index) => sequence !== index + 1);
  if (outOfOrder) throw new Error(`offline history order mismatch for ${fromLabel}->${toLabel}: ${historySequences.join(',')}`);

  const readPromise = collectSocketEvents(
    trace,
    fromLabel,
    from.socket,
    'message:update',
    update => expectedIds.includes(update?.id) && update?.patch?.status === 'read',
    count,
    Math.max(TIMEOUT_MS, count * 700),
  );
  emit(trace, toLabel, to.socket, 'message:read', { conversationId: ctx.conversationId, messageId: expectedIds[expectedIds.length - 1] });
  await readPromise;
  trace.pass(`offline-batch:${fromLabel}->${toLabel}`, { count });
}

async function runPresenceScenario(trace, ctx) {
  await emitAck(trace, 'A', ctx.A.socket, 'presence:heartbeat', { state: 'active', at: new Date().toISOString() });
  await emitAck(trace, 'B', ctx.B.socket, 'presence:heartbeat', { state: 'active', at: new Date().toISOString() });
  await emitAck(trace, 'B', ctx.B.socket, 'presence:heartbeat', { state: 'background', at: new Date().toISOString() });
  await waitForSocketEvent(trace, 'A', ctx.A.socket, 'user:offline', event => event?.userId === ctx.B.id, 15_000);
  const onlinePromise = waitForSocketEvent(trace, 'A', ctx.A.socket, 'user:online', event => event?.userId === ctx.B.id, TIMEOUT_MS);
  await emitAck(trace, 'B', ctx.B.socket, 'presence:heartbeat', { state: 'active', at: new Date().toISOString() });
  await onlinePromise;
  trace.pass('presence:B-background-active', {});
}

async function runMultiSocketPresenceScenario(trace, ctx) {
  await emitAck(trace, 'B', ctx.B.socket, 'presence:heartbeat', { state: 'active', at: new Date().toISOString(), socket: 'B1' });
  const socketB2 = await connectClient(trace, 'B2', ctx.B.token);
  emit(trace, 'B2', socketB2, 'conversation:join', { conversationId: ctx.conversationId });
  await emitAck(trace, 'B2', socketB2, 'presence:heartbeat', { state: 'active', at: new Date().toISOString(), socket: 'B2' });

  ctx.B.socket.disconnect();
  trace.event('B', 'socket:manual-disconnect:B1', {});
  await waitForNoSocketEvent(trace, 'A', ctx.A.socket, 'user:offline', event => event?.userId === ctx.B.id);

  await emitAck(trace, 'B2', socketB2, 'presence:heartbeat', { state: 'background', at: new Date().toISOString(), socket: 'B2' });
  await waitForSocketEvent(trace, 'A', ctx.A.socket, 'user:offline', event => event?.userId === ctx.B.id, Math.max(TIMEOUT_MS, 15_000));

  socketB2.disconnect();
  trace.event('B2', 'socket:manual-disconnect:B2', {});
  const onlinePromise = waitForSocketEvent(trace, 'A', ctx.A.socket, 'user:online', event => event?.userId === ctx.B.id, TIMEOUT_MS);
  ctx.B.socket = await connectClient(trace, 'B', ctx.B.token);
  emit(trace, 'B', ctx.B.socket, 'conversation:join', { conversationId: ctx.conversationId });
  await emitAck(trace, 'B', ctx.B.socket, 'presence:heartbeat', { state: 'active', at: new Date().toISOString() });
  await onlinePromise;
  trace.pass('presence:B-multi-socket-convergence', {});
}

async function runCallSignalingScenario(trace, ctx, type = 'audio') {
  const callId = `audit-${type}-${Date.now()}`;
  const incomingPromise = waitForSocketEvent(trace, 'B', ctx.B.socket, 'call:incoming', event => event?.callId === callId);
  const started = await emitAck(trace, 'A', ctx.A.socket, 'call:start', {
    callId,
    conversationId: ctx.conversationId,
    type,
    targetUserIds: [ctx.B.id],
    mediaProvider: 'webrtc',
  });
  if (!started?.ok) throw new Error(`call:start failed for ${type}`);
  await incomingPromise;
  emit(trace, 'B', ctx.B.socket, 'call:incoming:received', { callId, conversationId: ctx.conversationId });
  await waitForSocketEvent(trace, 'A', ctx.A.socket, 'call:incoming:received', event => event?.callId === callId);
  const answeredPromise = waitForSocketEvent(trace, 'A', ctx.A.socket, 'call:answered', event => event?.callId === callId && event?.accepted === true);
  const answer = await emitAck(trace, 'B', ctx.B.socket, 'call:answer', { callId, accepted: true, mediaProvider: 'webrtc' });
  if (!answer?.ok || !answer.accepted) throw new Error(`call:answer failed for ${type}`);
  await answeredPromise;

  const offer = { type: 'offer', sdp: 'v=0\r\no=oracle-audit 0 0 IN IP4 127.0.0.1\r\ns=Oracle Audit\r\nt=0 0\r\n' };
  const answerSdp = { type: 'answer', sdp: 'v=0\r\no=oracle-audit 0 0 IN IP4 127.0.0.1\r\ns=Oracle Audit\r\nt=0 0\r\n' };
  const ice = { candidate: 'candidate:1 1 UDP 2122260223 127.0.0.1 9 typ host', sdpMid: '0', sdpMLineIndex: 0 };

  const offerPromise = waitForSocketEvent(trace, 'B', ctx.B.socket, 'webrtc:offer', event => event?.callId === callId);
  emit(trace, 'A', ctx.A.socket, 'webrtc:offer', { callId, targetUserId: ctx.B.id, sdp: offer });
  await offerPromise;

  const answerPromise = waitForSocketEvent(trace, 'A', ctx.A.socket, 'webrtc:answer', event => event?.callId === callId);
  emit(trace, 'B', ctx.B.socket, 'webrtc:answer', { callId, targetUserId: ctx.A.id, sdp: answerSdp });
  await answerPromise;

  const iceToBPromise = waitForSocketEvent(trace, 'B', ctx.B.socket, 'webrtc:ice', event => event?.callId === callId);
  emit(trace, 'A', ctx.A.socket, 'webrtc:ice', { callId, targetUserId: ctx.B.id, candidate: ice });
  await iceToBPromise;

  const iceToAPromise = waitForSocketEvent(trace, 'A', ctx.A.socket, 'webrtc:ice', event => event?.callId === callId);
  emit(trace, 'B', ctx.B.socket, 'webrtc:ice', { callId, targetUserId: ctx.A.id, candidate: ice });
  await iceToAPromise;

  const endedA = waitForSocketEvent(trace, 'A', ctx.A.socket, 'call:ended', event => event?.callId === callId);
  const endedB = waitForSocketEvent(trace, 'B', ctx.B.socket, 'call:ended', event => event?.callId === callId);
  emit(trace, 'A', ctx.A.socket, 'call:end', { callId });
  await Promise.all([endedA, endedB]);
  trace.pass(`call-signaling:${type}:A->B`, { callId });
}

async function runVoiceMessageScenario(trace, ctx, fromLabel, toLabel) {
  const from = ctx[fromLabel];
  const to = ctx[toLabel];
  const checksum = crypto.createHash('sha256').update(`voice-${fromLabel}-${toLabel}-${Date.now()}`).digest('hex');
  const payload = {
    url: `/uploads/audit/voice-${fromLabel.toLowerCase()}-${toLabel.toLowerCase()}-${Date.now()}.m4a`,
    mime: 'audio/mp4',
    name: `voice-${fromLabel}-${toLabel}.m4a`,
    size: 4096,
    checksum,
    durationMs: 1800,
  };
  const receivedPromise = waitForSocketEvent(
    trace,
    toLabel,
    to.socket,
    'message:new',
    message => message?.type === 'audio' && typeof message?.content === 'string' && message.content.includes(payload.name),
  );
  const sent = await emitAck(trace, fromLabel, from.socket, 'message:send', {
    conversationId: ctx.conversationId,
    content: JSON.stringify(payload),
    type: 'audio',
  });
  if (!sent?.id || sent.type !== 'audio') throw new Error(`voice message send failed for ${fromLabel}->${toLabel}`);
  const received = await receivedPromise;
  if (received?.id !== sent.id) throw new Error(`voice message id mismatch for ${fromLabel}->${toLabel}`);
  const deliveredPromise = waitForSocketEvent(trace, fromLabel, from.socket, 'message:update', update => update?.id === sent.id && update?.patch?.status === 'delivered');
  emit(trace, toLabel, to.socket, 'message:delivered', { messageId: sent.id });
  await deliveredPromise;

  const mediaAck = await httpJson(
    trace,
    toLabel,
    'POST',
    `/messages/${encodeURIComponent(sent.id)}/media-local-save`,
    to.token,
    { checksum, size: payload.size },
  );
  if (mediaAck?.ackConfirmed !== true) throw new Error(`voice media-local-save did not confirm for ${fromLabel}->${toLabel}`);

  const readPromise = waitForSocketEvent(trace, fromLabel, from.socket, 'message:update', update => update?.id === sent.id && update?.patch?.status === 'read');
  emit(trace, toLabel, to.socket, 'message:read', { conversationId: ctx.conversationId, messageId: sent.id });
  await readPromise;
  trace.pass(`voice-message:${fromLabel}->${toLabel}:transport-and-cache-ack`, { messageId: sent.id });
}

async function runNotificationScenario(trace, ctx) {
  await httpJson(trace, 'B', 'POST', '/notifications/subscribe', ctx.B.token, {
    type: 'fcm',
    token: `invalid-fcm-token-${Date.now()}`,
    platform: 'android',
  });
  const prisma = new PrismaClient();
  try {
    const userBefore = await prisma.user.findUnique({ where: { id: ctx.B.id }, select: { pushToken: true } });
    trace.event('LAB', 'notification:token-stored', { hasPushToken: Boolean(userBefore?.pushToken) });
  } finally {
    await prisma.$disconnect();
  }

  ctx.B.socket.disconnect();
  trace.event('B', 'socket:manual-disconnect:notification-path', {});
  const sent = await emitAck(trace, 'A', ctx.A.socket, 'message:send', {
    conversationId: ctx.conversationId,
    content: `Notification path A->B ${new Date().toISOString()}`,
    type: 'text',
  });
  if (!sent?.id || sent.status !== 'sent') throw new Error('notification path message send failed');
  await sleep(1000);
  ctx.B.socket = await connectClient(trace, 'B', ctx.B.token);
  emit(trace, 'B', ctx.B.socket, 'conversation:join', { conversationId: ctx.conversationId });
  trace.pass('notifications:fcm-path-exercised-with-invalid-token', {
    messageId: sent.id,
    androidNotificationDisplayed: false,
    reason: 'FCM credentials/device unavailable in this environment',
  });
}

async function runLongConversationScenario(trace, ctx, count) {
  const prisma = new PrismaClient();
  const prefix = `Long conversation ${NAMESPACE} ${Date.now()}`;
  try {
    const baseTime = Date.now() + 1000;
    const rows = [];
    for (let index = 0; index < count; index += 1) {
      const sequence = String(index + 1).padStart(4, '0');
      const mediaKind = index % 125 === 0 ? 'audio' : index % 90 === 0 ? 'image' : index % 160 === 0 ? 'video' : index % 210 === 0 ? 'file' : 'text';
      const content = mediaKind === 'text'
        ? `${prefix} #${sequence}`
        : JSON.stringify({
            url: `/uploads/audit/${mediaKind}-${sequence}`,
            mime: mediaKind === 'image' ? 'image/jpeg' : mediaKind === 'video' ? 'video/mp4' : mediaKind === 'audio' ? 'audio/mp4' : 'application/pdf',
            name: `${mediaKind}-${sequence}`,
            size: 2048 + index,
            checksum: crypto.createHash('sha256').update(`${prefix}-${sequence}`).digest('hex'),
          });
      rows.push({
        conversationId: ctx.conversationId,
        senderId: index % 2 === 0 ? ctx.A.id : ctx.B.id,
        content,
        type: mediaKind,
        status: 'sent',
        createdAt: new Date(baseTime + index * 1000),
      });
    }
    await prisma.message.createMany({ data: rows });
    await prisma.conversation.update({ where: { id: ctx.conversationId }, data: { updatedAt: new Date() } });
    trace.event('LAB', 'long-conversation:seeded', { count, prefix });
  } finally {
    await prisma.$disconnect();
  }

  const messages = await httpJson(trace, 'A', 'GET', `/conversations/${encodeURIComponent(ctx.conversationId)}/messages`, ctx.A.token);
  if (!Array.isArray(messages) || messages.length !== 50) throw new Error(`long conversation first page returned ${Array.isArray(messages) ? messages.length : 'non-array'} messages`);
  const latest = messages[messages.length - 1];
  if (!String(latest?.content || '').includes(`#${String(count).padStart(4, '0')}`) && latest?.type === 'text') {
    throw new Error('long conversation first page did not end on latest message');
  }
  const before = encodeURIComponent(messages[0].createdAt);
  const previousPage = await httpJson(trace, 'A', 'GET', `/conversations/${encodeURIComponent(ctx.conversationId)}/messages?before=${before}`, ctx.A.token);
  if (!Array.isArray(previousPage) || previousPage.length !== 50) throw new Error('long conversation previous page returned unexpected count');
  trace.pass('long-conversation:pagination-latest-first-page', {
    seeded: count,
    firstPage: messages.length,
    previousPage: previousPage.length,
    latestMessageId: latest?.id,
  });
}

async function startCall(trace, ctx, type, suffix) {
  const callId = `audit-${type}-${suffix}-${Date.now()}-${Math.round(Math.random() * 1000)}`;
  const incomingPromise = waitForSocketEvent(trace, 'B', ctx.B.socket, 'call:incoming', event => event?.callId === callId);
  const started = await emitAck(trace, 'A', ctx.A.socket, 'call:start', {
    callId,
    conversationId: ctx.conversationId,
    type,
    targetUserIds: [ctx.B.id],
    mediaProvider: 'webrtc',
  });
  if (!started?.ok) throw new Error(`call:start failed for ${type}/${suffix}: ${started?.message || 'unknown'}`);
  await incomingPromise;
  emit(trace, 'B', ctx.B.socket, 'call:incoming:received', { callId, conversationId: ctx.conversationId });
  await waitForSocketEvent(trace, 'A', ctx.A.socket, 'call:incoming:received', event => event?.callId === callId);
  return callId;
}

async function assertCallInactive(trace, ctx, callId, label) {
  const active = await emitAck(trace, 'A', ctx.A.socket, 'call:get-active', { callId });
  if (active?.ok) throw new Error(`call ${callId} remained active after ${label}`);
}

async function runCallRejectScenario(trace, ctx, type = 'audio') {
  const callId = await startCall(trace, ctx, type, 'reject');
  const rejectedPromise = waitForSocketEvent(
    trace,
    'A',
    ctx.A.socket,
    'call:answered',
    event => event?.callId === callId && event?.accepted === false && event?.ended === true,
  );
  const answer = await emitAck(trace, 'B', ctx.B.socket, 'call:answer', { callId, accepted: false, mediaProvider: 'webrtc' });
  if (!answer?.ok || answer.accepted !== false || answer.ended !== true) throw new Error(`call reject ack invalid for ${type}`);
  await rejectedPromise;
  await assertCallInactive(trace, ctx, callId, `${type}:reject`);
  trace.pass(`call:${type}:reject`, { callId });
}

async function runCallCancelScenario(trace, ctx, type = 'audio') {
  const callId = await startCall(trace, ctx, type, 'cancel');
  const endedB = waitForSocketEvent(trace, 'B', ctx.B.socket, 'call:ended', event => event?.callId === callId);
  emit(trace, 'A', ctx.A.socket, 'call:end', { callId });
  await endedB;
  await assertCallInactive(trace, ctx, callId, `${type}:cancel`);
  trace.pass(`call:${type}:cancel-before-answer`, { callId });
}

async function runCallNoAnswerScenario(trace, ctx, type = 'audio') {
  const callId = await startCall(trace, ctx, type, 'noanswer');
  const endedA = waitForSocketEvent(trace, 'A', ctx.A.socket, 'call:ended', event => event?.callId === callId, CALL_NO_ANSWER_EXPECT_MS);
  const endedB = waitForSocketEvent(trace, 'B', ctx.B.socket, 'call:ended', event => event?.callId === callId, CALL_NO_ANSWER_EXPECT_MS);
  await Promise.all([endedA, endedB]);
  await assertCallInactive(trace, ctx, callId, `${type}:no-answer`);
  trace.pass(`call:${type}:no-answer-timeout`, { callId, expectedMs: CALL_NO_ANSWER_EXPECT_MS });
}

async function runCallAcceptCancelRaceScenario(trace, ctx, type = 'audio') {
  const callId = await startCall(trace, ctx, type, 'race');
  const terminal = Promise.race([
    waitForSocketEvent(trace, 'A', ctx.A.socket, 'call:answered', event => event?.callId === callId, TIMEOUT_MS).catch(error => ({ error: error.message })),
    waitForSocketEvent(trace, 'A', ctx.A.socket, 'call:ended', event => event?.callId === callId, TIMEOUT_MS).catch(error => ({ error: error.message })),
    waitForSocketEvent(trace, 'B', ctx.B.socket, 'call:ended', event => event?.callId === callId, TIMEOUT_MS).catch(error => ({ error: error.message })),
  ]);
  const answerPromise = emitAck(trace, 'B', ctx.B.socket, 'call:answer', { callId, accepted: true, mediaProvider: 'webrtc' })
    .catch(error => ({ ok: false, message: error.message }));
  emit(trace, 'A', ctx.A.socket, 'call:end', { callId });
  const [answerResult, terminalResult] = await Promise.all([answerPromise, terminal]);
  trace.event('LAB', `call:${type}:race-result`, { callId, answerResult, terminalResult });
  await sleep(400);
  await assertCallInactive(trace, ctx, callId, `${type}:accept-cancel-race`);
  trace.pass(`call:${type}:accept-cancel-race`, { callId });
}

async function runDoubleCallGuardScenario(trace, ctx, type = 'audio') {
  const firstCallId = await startCall(trace, ctx, type, 'double1');
  const secondCallId = `audit-${type}-double2-${Date.now()}`;
  const second = await emitAck(trace, 'A', ctx.A.socket, 'call:start', {
    callId: secondCallId,
    conversationId: ctx.conversationId,
    type,
    targetUserIds: [ctx.B.id],
    mediaProvider: 'webrtc',
  });
  if (second?.ok) {
    emit(trace, 'A', ctx.A.socket, 'call:end', { callId: secondCallId });
    throw new Error('double call was accepted while a participant was already busy');
  }
  const endedB = waitForSocketEvent(trace, 'B', ctx.B.socket, 'call:ended', event => event?.callId === firstCallId);
  emit(trace, 'A', ctx.A.socket, 'call:end', { callId: firstCallId });
  await endedB;
  await assertCallInactive(trace, ctx, firstCallId, `${type}:double-call-cleanup`);
  trace.pass(`call:${type}:double-call-guard`, { firstCallId, secondCallId, rejected: true });
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log([
      'Oracle Messenger A/B production lab',
      '',
      'Required local mode:',
      '  DATABASE_URL=... JWT_SECRET=... BACKEND_URL=http://localhost:3001 npm run audit:ab-lab',
      '',
      'Token mode:',
      '  ORACLE_A_TOKEN=... ORACLE_B_TOKEN=... ORACLE_AB_CONVERSATION_ID=... npm run audit:ab-lab',
      '',
      'Optional:',
      '  ORACLE_AB_LAB_OUTPUT_DIR=./audit-artifacts/run-1',
      '  ORACLE_AB_LAB_TIMEOUT_MS=12000',
      '  ORACLE_AB_LAB_NAMESPACE=staging',
    ].join('\n'));
    return;
  }

  const trace = new Trace(OUT_DIR);
  let ctx;
  try {
    trace.event('LAB', 'preflight', {
      backendUrl: BACKEND_URL,
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasJwtSecret: Boolean(process.env.JWT_SECRET),
      tokenMode: Boolean(process.env.ORACLE_A_TOKEN && process.env.ORACLE_B_TOKEN),
      outputDir: OUT_DIR,
    });
    await httpJson(trace, 'LAB', 'GET', '/health');
    ctx = await loadLabIdentity(trace);
    await runAuthScenario(trace, ctx);
    ctx.A.socket = await connectClient(trace, 'A', ctx.A.token);
    ctx.B.socket = await connectClient(trace, 'B', ctx.B.token);
    emit(trace, 'A', ctx.A.socket, 'conversation:join', { conversationId: ctx.conversationId });
    emit(trace, 'B', ctx.B.socket, 'conversation:join', { conversationId: ctx.conversationId });
    await sleep(250);

    await runPresenceScenario(trace, ctx);
    await runMultiSocketPresenceScenario(trace, ctx);
    await runMessagingScenario(trace, ctx, 'A', 'B', `Message de test A -> B ${new Date().toISOString()}`);
    await runMessagingScenario(trace, ctx, 'B', 'A', `Message de test B -> A ${new Date().toISOString()}`);
    await runRapidMessagesScenario(trace, ctx, 'A', 'B', 10);
    await runRapidMessagesScenario(trace, ctx, 'A', 'B', MESSAGE_BURST_COUNT);
    await runRapidMessagesScenario(trace, ctx, 'B', 'A', MESSAGE_BURST_COUNT);
    await runOfflineBatchScenario(trace, ctx, 'A', 'B', OFFLINE_BATCH_COUNT);
    await runOfflineBatchScenario(trace, ctx, 'B', 'A', OFFLINE_BATCH_COUNT);
    await runNotificationScenario(trace, ctx);
    await runVoiceMessageScenario(trace, ctx, 'A', 'B');
    await runVoiceMessageScenario(trace, ctx, 'B', 'A');
    await runLongConversationScenario(trace, ctx, LONG_CONVERSATION_COUNT);
    await runCallSignalingScenario(trace, ctx, 'audio');
    await runCallRejectScenario(trace, ctx, 'audio');
    await runCallCancelScenario(trace, ctx, 'audio');
    await runCallNoAnswerScenario(trace, ctx, 'audio');
    await runCallAcceptCancelRaceScenario(trace, ctx, 'audio');
    await runDoubleCallGuardScenario(trace, ctx, 'audio');
    await runCallSignalingScenario(trace, ctx, 'video');
    await runCallRejectScenario(trace, ctx, 'video');
    await runCallCancelScenario(trace, ctx, 'video');
    await runCallNoAnswerScenario(trace, ctx, 'video');
    await runCallAcceptCancelRaceScenario(trace, ctx, 'video');
    await runDoubleCallGuardScenario(trace, ctx, 'video');
  } catch (error) {
    trace.fail('lab-runtime', error);
  } finally {
    ctx?.A?.socket?.disconnect();
    ctx?.B?.socket?.disconnect();
    const summary = trace.writeSummary({
      actors: ctx ? {
        A: { id: ctx.A.id },
        B: { id: ctx.B.id },
        conversationId: ctx.conversationId,
      } : undefined,
      parameters: {
        messageBurstCount: MESSAGE_BURST_COUNT,
        offlineBatchCount: OFFLINE_BATCH_COUNT,
        longConversationCount: LONG_CONVERSATION_COUNT,
        callNoAnswerExpectMs: CALL_NO_ANSWER_EXPECT_MS,
      },
    });
    console.log(`\nA/B lab artifacts: ${OUT_DIR}`);
    console.log(`Failures: ${summary.failures.length}`);
    if (summary.failures.length) process.exitCode = 1;
  }
}

main();
