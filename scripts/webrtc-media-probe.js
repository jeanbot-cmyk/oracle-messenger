#!/usr/bin/env node
/*
 * Browser-side WebRTC media probe.
 *
 * Requires a test JSON generated for scripts/phone-ab-smoke-test.js:
 *   OM_PHONE_TEST_JSON=/path/to/test-users.json node scripts/webrtc-media-probe.js
 *
 * The script launches Chromium with fake camera/microphone, checks getUserMedia,
 * fetches ICE and SFU config from the production backend, then connects two
 * RTCPeerConnection instances locally to verify track flow.
 */

const fs = require('fs');
const path = require('path');

function requirePlaywright() {
  const candidates = [
    'playwright',
    '/tmp/om-pw/node_modules/playwright',
    path.resolve(__dirname, '../frontend/node_modules/playwright'),
  ];
  for (const candidate of candidates) {
    try { return require(candidate); } catch {}
  }
  throw new Error('playwright introuvable');
}

const { chromium } = requirePlaywright();

const inputPath = process.env.OM_PHONE_TEST_JSON;
if (!inputPath) {
  console.error('OM_PHONE_TEST_JSON est requis');
  process.exit(2);
}

const cfg = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const backendUrl = (cfg.backendUrl || process.env.OM_BACKEND_URL || 'https://api-messenger.oracle-plus.online').replace(/\/$/, '');
const token = cfg.users?.a?.token;
if (!token) {
  console.error('Token utilisateur A manquant');
  process.exit(2);
}

function log(step, data = {}) {
  console.log(`[ok] ${step}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ''}`);
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['camera', 'microphone'],
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  try {
    await page.goto('https://messenger.oracle-plus.online/install', { waitUntil: 'domcontentloaded', timeout: 20000 });
    const result = await page.evaluate(async ({ backendUrl, token }) => {
      const support = {
        mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
        rtcPeerConnection: typeof RTCPeerConnection !== 'undefined',
        audioContext: typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined',
      };
      if (!support.mediaDevices || !support.rtcPeerConnection) {
        return { support, ok: false, reason: 'WebRTC non supporté' };
      }

      const iceRes = await fetch(`${backendUrl}/calls/ice-servers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const iceJson = await iceRes.json();
      const iceServers = Array.isArray(iceJson.iceServers) ? iceJson.iceServers : [];

      const sfuRes = await fetch(`${backendUrl}/calls/sfu-token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ room: `probe-${Date.now()}`, name: 'Oracle Probe' }),
      });
      const sfu = await sfuRes.json();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
        },
        video: {
          facingMode: { ideal: 'user' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
      });

      const localTracks = stream.getTracks().map(track => ({
        kind: track.kind,
        enabled: track.enabled,
        readyState: track.readyState,
        settings: track.getSettings ? track.getSettings() : {},
      }));

      const pc1 = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 2 });
      const pc2 = new RTCPeerConnection({ iceServers, iceCandidatePoolSize: 2 });
      const remoteKinds = [];
      pc1.onicecandidate = event => { if (event.candidate) pc2.addIceCandidate(event.candidate).catch(() => {}); };
      pc2.onicecandidate = event => { if (event.candidate) pc1.addIceCandidate(event.candidate).catch(() => {}); };
      pc2.ontrack = event => {
        remoteKinds.push(event.track.kind);
      };
      stream.getTracks().forEach(track => pc1.addTrack(track, stream));
      const offer = await pc1.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc1.setLocalDescription(offer);
      await pc2.setRemoteDescription(offer);
      const answer = await pc2.createAnswer();
      await pc2.setLocalDescription(answer);
      await pc1.setRemoteDescription(answer);

      const started = Date.now();
      while (Date.now() - started < 6000) {
        const connected = ['connected', 'completed'].includes(pc1.iceConnectionState) ||
          pc1.connectionState === 'connected';
        if (connected && remoteKinds.includes('audio') && remoteKinds.includes('video')) break;
        await new Promise(resolve => setTimeout(resolve, 120));
      }

      const states = {
        pc1Connection: pc1.connectionState,
        pc1Ice: pc1.iceConnectionState,
        pc2Connection: pc2.connectionState,
        pc2Ice: pc2.iceConnectionState,
        remoteKinds: [...new Set(remoteKinds)].sort(),
      };
      pc1.close();
      pc2.close();
      stream.getTracks().forEach(track => track.stop());

      return {
        ok: states.remoteKinds.includes('audio') && states.remoteKinds.includes('video'),
        support,
        iceServers: iceServers.length,
        hasTurn: iceServers.some(item => JSON.stringify(item.urls || '').toLowerCase().includes('turn:') || JSON.stringify(item.urls || '').toLowerCase().includes('turns:')),
        sfuEnabled: Boolean(sfu.enabled),
        sfuProvider: sfu.provider || null,
        localTracks,
        states,
      };
    }, { backendUrl, token });

    if (!result.ok) {
      console.error(`[fail] ${JSON.stringify(result, null, 2)}`);
      process.exit(1);
    }
    log('support navigateur WebRTC', result.support);
    log('micro/caméra accessibles', { tracks: result.localTracks.map(track => ({ kind: track.kind, state: track.readyState, enabled: track.enabled })) });
    log('ICE/TURN récupérés', { iceServers: result.iceServers, hasTurn: result.hasTurn });
    log('LiveKit SFU token', { enabled: result.sfuEnabled, provider: result.sfuProvider });
    log('flux média local RTCPeerConnection', result.states);
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(`[fail] ${error.stack || error.message}`);
  process.exit(1);
});
