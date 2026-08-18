#!/usr/bin/env node
/* eslint-disable no-console */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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

function resolveDatabaseUrl(rawUrl) {
  const explicit = process.env.CONFERENCE_LAB_DATABASE_URL;
  if (explicit) return explicit;
  let resolved = rawUrl;
  if (resolved && process.env.POSTGRES_PASSWORD) {
    resolved = resolved.replace(/:\/\/oracle:[^@]+@/, `://oracle:${encodeURIComponent(process.env.POSTGRES_PASSWORD)}@`);
  }
  if (!resolved || !resolved.includes('@postgres:')) return resolved;
  try {
    const ip = execSync(
      "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' oracle-messenger-postgres-1",
      { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    if (ip) return resolved.replace('@postgres:', `@${ip}:`);
  } catch {
    // Keep the original URL; Prisma will report the connection error.
  }
  return resolved;
}

process.env.DATABASE_URL = resolveDatabaseUrl(process.env.DATABASE_URL);

const { PrismaClient } = backendRequire('@prisma/client');
const { io } = nativeRequire('socket.io-client');
const nativeAppConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'native-messenger/app.json'), 'utf8')).expo || {};

const BACKEND_URL = process.env.CONFERENCE_LAB_BACKEND_URL || `http://localhost:${process.env.CONFERENCE_LAB_PORT || process.env.PORT || 3001}`;
const nowStamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = process.env.CONFERENCE_LAB_OUTPUT_DIR || path.join(repoRoot, 'audit-artifacts', `conference-lab-${nowStamp}`);
const TIMEOUT_MS = Number(process.env.CONFERENCE_LAB_TIMEOUT_MS || 15_000);
const PARTICIPANT_COUNT = Number(process.env.CONFERENCE_LAB_PARTICIPANTS || 50);
const NAMESPACE = String(process.env.CONFERENCE_LAB_NAMESPACE || 'conf').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12) || 'conf';
const currentClient = {
  app: 'oracle-messenger-native',
  platform: 'android',
  versionName: nativeAppConfig.version || 'unknown',
  versionCode: Number(nativeAppConfig.android?.versionCode || 0),
};

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
    this.metrics = {};
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
    console.log(`[+${String(record.elapsedMs).padStart(5, ' ')}ms] ${actor.padEnd(12)} ${event} ${preview}`);
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

  metric(name, value) {
    this.metrics[name] = value;
    this.event('METRIC', name, { value });
  }

  writeSummary(extra = {}) {
    const summary = {
      startedAt: new Date(this.startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      backendUrl: BACKEND_URL,
      outputDir: this.outputDir,
      participantCount: PARTICIPANT_COUNT,
      totalEvents: this.records.length,
      metrics: this.metrics,
      failures: this.failures,
      ...extra,
    };
    fs.writeFileSync(this.summaryPath, JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(this.outputDir, 'README.md'), [
      '# Oracle Messenger Conference Lab',
      '',
      `Backend: ${BACKEND_URL}`,
      `Started: ${summary.startedAt}`,
      `Finished: ${summary.finishedAt}`,
      `Participants simulated: ${PARTICIPANT_COUNT}`,
      `Events: ${summary.totalEvents}`,
      `Failures: ${summary.failures.length}`,
      '',
      'Scope:',
      '- Real backend HTTP endpoints.',
      '- Real Socket.IO conference change events.',
      '- Real database persistence and capacity checks.',
      '- No physical Android camera/microphone media load in this script.',
      '',
      'Files:',
      '- `events.jsonl`: timestamped timeline.',
      '- `summary.json`: machine-readable result summary.',
      '',
    ].join('\n'));
    return summary;
  }
}

function clientHeaders(token) {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-Oracle-App': currentClient.app,
    'X-Oracle-Platform': currentClient.platform,
    'X-Oracle-Version': currentClient.versionName,
    'X-Oracle-Version-Code': String(currentClient.versionCode),
  };
}

async function http(trace, actor, method, route, token, body, expectOk = true) {
  const startedAt = Date.now();
  const response = await fetch(`${BACKEND_URL}${route}`, {
    method,
    headers: {
      ...clientHeaders(token),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
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
  const elapsedMs = Date.now() - startedAt;
  trace.event(actor, `http:${method}:${route}`, { status: response.status, elapsedMs, body: parsed });
  if (expectOk && !response.ok) throw new Error(`HTTP ${response.status} ${route}: ${JSON.stringify(parsed).slice(0, 220)}`);
  return { ok: response.ok, status: response.status, elapsedMs, body: parsed };
}

function waitForSocketConnect(trace, label, socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting socket connect for ${label}`));
    }, TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };
    const onConnect = () => {
      cleanup();
      trace.event(label, 'socket:connect', { id: socket.id });
      resolve();
    };
    const onError = error => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

async function connectSocket(trace, label, token, onConferenceChanged) {
  const socket = io(BACKEND_URL, {
    auth: { token, client: currentClient },
    extraHeaders: clientHeaders(token),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 8,
    reconnectionDelay: 400,
    timeout: TIMEOUT_MS,
  });
  socket.on('conference:changed', payload => {
    trace.event(label, 'socket:conference:changed', payload || {});
    if (onConferenceChanged) onConferenceChanged(payload || {});
  });
  socket.on('disconnect', reason => trace.event(label, 'socket:disconnect', { reason }));
  await waitForSocketConnect(trace, label, socket);
  return socket;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function seed(trace) {
  if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
    throw new Error('DATABASE_URL and JWT_SECRET are required.');
  }
  const prisma = new PrismaClient();
  try {
    const suffix = `${NAMESPACE}-${Date.now().toString(36)}`;
    const host = await prisma.user.upsert({
      where: { googleId: `conference-lab-host-${NAMESPACE}` },
      update: {
        name: 'Oracle Lab Conférencier',
        status: 'offline',
        pushToken: null,
      },
      create: {
        googleId: `conference-lab-host-${NAMESPACE}`,
        email: `conference-lab-host-${NAMESPACE}@example.test`,
        name: 'Oracle Lab Conférencier',
        username: `conflabhost${NAMESPACE}`.slice(0, 24),
        status: 'offline',
      },
    });
    const participants = [];
    for (let index = 0; index < PARTICIPANT_COUNT + 1; index += 1) {
      const number = String(index + 1).padStart(2, '0');
      const participant = await prisma.user.upsert({
        where: { googleId: `conference-lab-participant-${NAMESPACE}-${number}` },
        update: {
          name: `Participant Oracle ${number}`,
          status: 'offline',
          pushToken: null,
        },
        create: {
          googleId: `conference-lab-participant-${NAMESPACE}-${number}`,
          email: `conference-lab-participant-${NAMESPACE}-${number}@example.test`,
          name: `Participant Oracle ${number}`,
          username: `conflab${NAMESPACE}${number}`.slice(0, 24),
          status: 'offline',
        },
      });
      participants.push(participant);
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO "ConferenceSubscription" ("id", "userId", "planCode", "capacity", "activeUntil")
       VALUES ($1, $2, 'conference_50_70m', 50, $3)
       ON CONFLICT ("userId") DO UPDATE SET
         "planCode" = EXCLUDED."planCode",
         "capacity" = EXCLUDED."capacity",
         "activeUntil" = EXCLUDED."activeUntil",
         "updatedAt" = CURRENT_TIMESTAMP`,
      crypto.randomUUID(),
      host.id,
      new Date(Date.now() + 2 * 60 * 60 * 1000),
    );
    const identity = {
      suffix,
      host: {
        id: host.id,
        email: host.email,
        token: signJwt({ sub: host.id, email: host.email }, process.env.JWT_SECRET),
      },
      participants: participants.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        token: signJwt({ sub: user.id, email: user.email }, process.env.JWT_SECRET),
      })),
    };
    trace.event('LAB', 'seed:ready', { hostId: host.id, participantCount: participants.length });
    return identity;
  } finally {
    await prisma.$disconnect();
  }
}

async function markParticipantStale(userId, roomId) {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "ConferenceParticipant" SET "lastSeenAt" = $3, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "roomId" = $1 AND "userId" = $2`,
      roomId,
      userId,
      new Date(Date.now() - 3 * 60 * 1000),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const trace = new Trace(OUT_DIR);
  const sockets = [];
  let roomId = '';
  let roomSlug = '';
  try {
    const health = await http(trace, 'LAB', 'GET', '/health', null, null);
    if (health.body?.status !== 'ok') throw new Error('Backend health is not ok.');
    const realtime = await http(trace, 'LAB', 'GET', '/health/realtime', null, null, false);
    if (!realtime.ok) trace.fail('realtime-health-visible', new Error(`Realtime health HTTP ${realtime.status}`));
    else trace.pass('realtime-health-visible', realtime.body);

    const identity = await seed(trace);
    const conferenceEvents = { host: 0, participant: 0 };
    sockets.push(await connectSocket(trace, 'HOST', identity.host.token, () => { conferenceEvents.host += 1; }));
    for (let index = 0; index < Math.min(5, identity.participants.length); index += 1) {
      sockets.push(await connectSocket(trace, `P${index + 1}`, identity.participants[index].token, () => { conferenceEvents.participant += 1; }));
    }

    const overview = await http(trace, 'HOST', 'GET', '/conference/plans', identity.host.token);
    if (!overview.body?.plans?.length) throw new Error('No conference plan returned.');
    if (!overview.body?.livekitReady) trace.fail('livekit-ready', new Error('Backend reports LiveKit not ready.'));
    else trace.pass('livekit-ready', { livekitReady: true });

    const create = await http(trace, 'HOST', 'POST', '/conference/rooms', identity.host.token, {
      title: `Audit conférence Oracle ${identity.suffix}`,
      slug: `audit-conference-${identity.suffix}`,
      description: 'Session audit avec 50 participants, questions, sondage, documents et agent virtuel.',
      speakerName: 'Conférencier Oracle',
      contactInfo: 'Support Oracle Messenger',
      visualIdentity: 'Audit production',
      sourceMode: 'camera',
      planCode: 'conference_50_70m',
    });
    roomId = create.body?.room?.id;
    roomSlug = create.body?.room?.slug;
    if (!roomId || !roomSlug) throw new Error('Room id or slug missing after create.');
    if (!create.body?.room?.link || !create.body?.room?.deepLink) throw new Error('Room links missing after create.');
    trace.pass('room-link-before-live', { slug: roomSlug, link: create.body.room.link, deepLink: create.body.room.deepLink });

    const publicBeforeStart = await http(trace, 'PUBLIC', 'GET', `/conference/rooms/${encodeURIComponent(roomSlug)}`, null, null);
    if (publicBeforeStart.body?.room?.status !== 'draft') throw new Error('Public room before live is not draft.');
    trace.pass('public-link-opens-before-live', { status: publicBeforeStart.body.room.status });

    const earlyJoin = await http(trace, 'P1', 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/join`, identity.participants[0].token, {}, false);
    if (earlyJoin.ok || earlyJoin.status < 400) throw new Error('Participant joined before live unexpectedly.');
    trace.pass('participant-waiting-before-live-blocked-from-media', { status: earlyJoin.status });

    const started = await http(trace, 'HOST', 'POST', `/conference/rooms/${encodeURIComponent(roomId)}/start`, identity.host.token, {});
    if (started.body?.room?.status !== 'live') throw new Error('Room did not start live.');
    trace.pass('room-started', { status: started.body.room.status, expiresAt: started.body.room.expiresAt });

    const hostJoin = await http(trace, 'HOST', 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/join`, identity.host.token, {});
    if (!hostJoin.body?.livekit?.enabled || !hostJoin.body.livekit.canPublishCamera || !hostJoin.body.livekit.canPublishMicrophone) {
      throw new Error('Host LiveKit publish token is not usable.');
    }
    trace.pass('host-livekit-token', {
      provider: hostJoin.body.livekit.provider,
      role: hostJoin.body.livekit.role,
      canPublishCamera: hostJoin.body.livekit.canPublishCamera,
      canPublishMicrophone: hostJoin.body.livekit.canPublishMicrophone,
    });

    const joinStartedAt = Date.now();
    const joined = await mapLimit(identity.participants.slice(0, PARTICIPANT_COUNT), 10, async (participant, index) => {
      const result = await http(trace, `P${index + 1}`, 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/join`, participant.token, {});
      const livekit = result.body?.livekit || {};
      if (!livekit.enabled || livekit.canPublish || livekit.canPublishMicrophone || !livekit.canSubscribe) {
        throw new Error(`Participant ${index + 1} LiveKit viewer token invalid.`);
      }
      return {
        id: participant.id,
        token: participant.token,
        state: result.body?.state,
        livekit,
      };
    });
    const joinElapsedMs = Date.now() - joinStartedAt;
    trace.metric('join_50_participants_elapsed_ms', joinElapsedMs);
    trace.metric('join_50_participants_avg_ms', Math.round(joinElapsedMs / PARTICIPANT_COUNT));
    trace.pass('participants-joined', { count: joined.length });

    const overflow = await http(trace, 'P51', 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/join`, identity.participants[PARTICIPANT_COUNT].token, {}, false);
    if (overflow.ok || overflow.status !== 403) throw new Error(`Capacity overflow expected HTTP 403, got ${overflow.status}.`);
    trace.pass('capacity-50-enforced', { status: overflow.status });

    const hostState = await http(trace, 'HOST', 'GET', `/conference/rooms/${encodeURIComponent(roomSlug)}/state`, identity.host.token);
    const participants = hostState.body?.participants || [];
    const viewers = participants.filter(item => item.role === 'viewer');
    if (viewers.length !== PARTICIPANT_COUNT) throw new Error(`Expected ${PARTICIPANT_COUNT} viewers, got ${viewers.length}.`);
    trace.pass('dashboard-shows-50-connected', { totalParticipants: participants.length, viewers: viewers.length });

    const firstFive = joined.slice(0, 5);
    await Promise.all(firstFive.map((participant, index) =>
      http(trace, `P${index + 1}`, 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/hand/raise`, participant.token, {}),
    ));
    await sleep(350);
    const raisedState = await http(trace, 'HOST', 'GET', `/conference/rooms/${encodeURIComponent(roomSlug)}/state`, identity.host.token);
    if ((raisedState.body?.raisedHands || []).length < 5) throw new Error('Raised hands not visible to host.');
    trace.pass('raised-hands-visible-to-host', { raisedHands: raisedState.body.raisedHands.length });

    const targetSpeaker = raisedState.body.raisedHands[0];
    const targetIndex = firstFive.findIndex(participant => participant.id === targetSpeaker.userId);
    const targetJoined = targetIndex >= 0 ? firstFive[targetIndex] : firstFive[0];
    const targetLabel = `P${targetIndex >= 0 ? targetIndex + 1 : 1}`;
    await http(trace, 'HOST', 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/hand/${encodeURIComponent(targetSpeaker.id)}/allow`, identity.host.token, {});
    const speakerJoin = await http(trace, targetLabel, 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/join`, targetJoined.token, {});
    if (!speakerJoin.body?.livekit?.canPublishMicrophone || speakerJoin.body.livekit.role !== 'speaker') {
      throw new Error('Approved participant did not receive speaker microphone token.');
    }
    trace.pass('host-approves-microphone', { participant: targetSpeaker.name, role: speakerJoin.body.livekit.role });

    await http(trace, 'HOST', 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/hand/${encodeURIComponent(targetSpeaker.id)}/revoke`, identity.host.token, {});
    const revokedJoin = await http(trace, targetLabel, 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/join`, targetJoined.token, {});
    if (revokedJoin.body?.livekit?.canPublishMicrophone) throw new Error('Revoked participant still has microphone publish permission.');
    trace.pass('host-revokes-microphone', { role: revokedJoin.body.livekit.role });

    const questionStartedAt = Date.now();
    const questionResults = await mapLimit(joined.slice(0, 12), 6, async (participant, index) =>
      http(trace, `P${index + 1}`, 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/questions`, participant.token, {
        content: `Question ${index + 1}: comment suivre les actions après la conférence ?`,
      }),
    );
    trace.metric('questions_12_elapsed_ms', Date.now() - questionStartedAt);
    const questionId = questionResults[0].body?.questions?.[0]?.id;
    if (!questionId) throw new Error('Question id missing after question creation.');
    await http(trace, 'HOST', 'PATCH', `/conference/rooms/${encodeURIComponent(roomSlug)}/questions/${encodeURIComponent(questionId)}`, identity.host.token, {
      isPinned: true,
      priority: 80,
    });
    await http(trace, 'HOST', 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/questions/${encodeURIComponent(questionId)}/answer`, identity.host.token, {
      answer: 'Après le direct, l’agent virtuel Oracle prépare le compte rendu et les actions.',
    });
    trace.pass('questions-pin-answer', { created: questionResults.length, answeredQuestionId: questionId });

    const pollCreate = await http(trace, 'HOST', 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/polls`, identity.host.token, {
      question: 'Quel suivi voulez-vous recevoir ?',
      options: ['Compte rendu', 'Documents', 'Relance individuelle'],
      showResults: true,
    });
    const pollId = pollCreate.body?.polls?.[0]?.id;
    if (!pollId) throw new Error('Poll id missing after poll creation.');
    const voteStartedAt = Date.now();
    await mapLimit(joined, 10, async (participant, index) =>
      http(trace, `P${(index % 50) + 1}`, 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/polls/${encodeURIComponent(pollId)}/vote`, participant.token, {
        optionIndex: index % 3,
      }),
    );
    trace.metric('poll_50_votes_elapsed_ms', Date.now() - voteStartedAt);
    const pollState = await http(trace, 'HOST', 'GET', `/conference/rooms/${encodeURIComponent(roomSlug)}/state`, identity.host.token);
    const poll = (pollState.body?.polls || []).find(item => item.id === pollId);
    if (!poll || poll.totalVotes !== PARTICIPANT_COUNT) throw new Error(`Poll total expected ${PARTICIPANT_COUNT}, got ${poll?.totalVotes}.`);
    trace.pass('poll-50-votes', { totalVotes: poll.totalVotes, voteCounts: poll.voteCounts });

    await Promise.all(joined.slice(0, 12).map((participant, index) =>
      http(trace, `P${index + 1}`, 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/reactions`, participant.token, {
        emoji: ['👍', '❤️', '👏', '✅'][index % 4],
      }),
    ));
    const doc = await http(trace, 'HOST', 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/documents`, identity.host.token, {
      title: 'Support de conférence',
      url: 'https://messenger.oracle-plus.online/conference-support.pdf',
      kind: 'link',
    });
    if (!(doc.body?.documents || []).length) throw new Error('Document not visible after share.');
    trace.pass('documents-and-reactions', { documents: doc.body.documents.length });

    const ai = await http(trace, 'HOST', 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/ai-summary`, identity.host.token, {
      promptType: 'summary',
    });
    if (!(ai.body?.aiSummaries || []).length) throw new Error('Agent summary missing.');
    trace.pass('oracle-virtual-agent-summary', { summaries: ai.body.aiSummaries.length, wordsRemaining: ai.body.room?.aiWordsRemaining });

    await markParticipantStale(joined[49].id, roomId);
    const staleState = await http(trace, 'HOST', 'GET', `/conference/rooms/${encodeURIComponent(roomSlug)}/state`, identity.host.token);
    const staleVisible = (staleState.body?.participants || []).some(item => item.userId === joined[49].id);
    if (staleVisible) throw new Error('Stale participant remained visible after lastSeen timeout.');
    trace.pass('presence-timeout-removes-stale-participant', { participantUserId: joined[49].id });
    await http(trace, 'P50', 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/heartbeat`, joined[49].token, {});
    const backState = await http(trace, 'HOST', 'GET', `/conference/rooms/${encodeURIComponent(roomSlug)}/state`, identity.host.token);
    const backVisible = (backState.body?.participants || []).some(item => item.userId === joined[49].id);
    if (!backVisible) throw new Error('Heartbeat did not restore participant visibility.');
    trace.pass('presence-heartbeat-restores-participant', { participantUserId: joined[49].id });

    if (conferenceEvents.host < 8) throw new Error(`Host received too few conference:changed events (${conferenceEvents.host}).`);
    if (conferenceEvents.participant < 3) throw new Error(`Participants received too few conference:changed events (${conferenceEvents.participant}).`);
    trace.pass('websocket-conference-changes', conferenceEvents);

    const stopped = await http(trace, 'HOST', 'POST', `/conference/rooms/${encodeURIComponent(roomId)}/stop`, identity.host.token, {});
    if (stopped.body?.room?.status !== 'ended') throw new Error('Room did not stop as ended.');
    const postStopAction = await http(trace, 'P2', 'POST', `/conference/rooms/${encodeURIComponent(roomSlug)}/hand/raise`, joined[1].token, {}, false);
    if (postStopAction.ok || postStopAction.status < 400) throw new Error('Participant action after stop unexpectedly succeeded.');
    trace.pass('room-stop-blocks-live-actions', { status: postStopAction.status });

    const summary = trace.writeSummary({ roomId, roomSlug, conferenceEvents });
    if (trace.failures.length) process.exitCode = 1;
    console.log(JSON.stringify({ ok: trace.failures.length === 0, summaryPath: summary.summaryPath, outputDir: OUT_DIR }, null, 2));
  } catch (error) {
    trace.fail('fatal', error);
    const summary = trace.writeSummary({ roomId, roomSlug });
    console.error(JSON.stringify({ ok: false, summaryPath: summary.summaryPath, outputDir: OUT_DIR }, null, 2));
    process.exitCode = 1;
  } finally {
    for (const socket of sockets) {
      socket.disconnect();
    }
  }
}

main();
