#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const requireSigning = process.argv.includes('--require-signing') || process.argv.includes('--strict');

const EXPECTED = {
  packageName: 'online.oracle_plus.messenger',
  versionName: '1.0.20260812.15',
  versionCode: 2026081215,
  newArchEnabled: true,
  webClientId: '734297398479-rids78si56kck1u3sjrgnivfdtpr7e89.apps.googleusercontent.com',
  androidClients: [
    {
      clientId: '734297398479-49duf58ok258ni2di43aq7df4pn5tp4d.apps.googleusercontent.com',
      sha1: 'c780363eb030966eb79d0b8ada64623e9ac1d2c8',
    },
    {
      clientId: '734297398479-f164rp1c083d77vftt76mk7qm32l2u21.apps.googleusercontent.com',
      sha1: 'f2c2572b6ce4c73d3f257b71990575a92a8bfbd1',
    },
    {
      clientId: '734297398479-irrshc48k2d7kotc696gofbellvll43i.apps.googleusercontent.com',
      sha1: 'cdb22720d6fb5728a90a3327fd276b283d32a178',
    },
  ],
};

const failures = [];
const warnings = [];

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) fail(`${label}: expected ${expected}, got ${actual}`);
}

function assertIncludes(label, haystack, needle) {
  if (!haystack.includes(needle)) fail(`${label}: missing ${needle}`);
}

function verifyPackageAndVersion() {
  const app = readJson('app.json').expo;
  const buildGradle = readText('android/app/build.gradle');
  const env = readText('src/config/env.ts');

  assertEqual('app.json expo.version', app.version, EXPECTED.versionName);
  assertEqual('app.json android.package', app.android.package, EXPECTED.packageName);
  assertEqual('app.json android.versionCode', app.android.versionCode, EXPECTED.versionCode);
  assertEqual('app.json newArchEnabled', app.newArchEnabled, EXPECTED.newArchEnabled);
  assertEqual('app.json extra.playPackage', app.extra.playPackage, EXPECTED.packageName);

  assertIncludes('build.gradle namespace', buildGradle, `namespace = '${EXPECTED.packageName}'`);
  assertIncludes('build.gradle applicationId', buildGradle, `applicationId = '${EXPECTED.packageName}'`);
  assertIncludes('build.gradle versionName', buildGradle, `versionName = "${EXPECTED.versionName}"`);
  assertIncludes('build.gradle versionCode', buildGradle, `versionCode = ${EXPECTED.versionCode}`);
  assertIncludes('gradle.properties newArchEnabled', readText('android/gradle.properties'), `newArchEnabled=${EXPECTED.newArchEnabled}`);

  assertIncludes('env ANDROID_PACKAGE', env, `ANDROID_PACKAGE = String(extra.playPackage ?? '${EXPECTED.packageName}')`);
  assertIncludes('env GOOGLE_WEB_CLIENT_ID', env, `GOOGLE_WEB_CLIENT_ID = '${EXPECTED.webClientId}'`);
}

function verifyGoogleServices(relativePath) {
  const json = readJson(relativePath);
  const forbiddenKeys = [];

  function scanForbiddenKeys(value, trail = []) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const nextTrail = [...trail, key];
      if (key === 'client_secret' || key === 'private_key') {
        forbiddenKeys.push(nextTrail.join('.'));
      }
      scanForbiddenKeys(child, nextTrail);
    }
  }

  scanForbiddenKeys(json);
  if (forbiddenKeys.length) {
    fail(`${relativePath}: forbidden secret field(s) found: ${forbiddenKeys.join(', ')}`);
  }

  const client = (json.client || []).find(item =>
    item?.client_info?.android_client_info?.package_name === EXPECTED.packageName
  );
  if (!client) {
    fail(`${relativePath}: missing client for ${EXPECTED.packageName}`);
    return;
  }

  const oauth = client.oauth_client || [];
  for (const expected of EXPECTED.androidClients) {
    const match = oauth.find(item =>
      item.client_type === 1 &&
      item.client_id === expected.clientId &&
      item.android_info?.package_name === EXPECTED.packageName &&
      String(item.android_info?.certificate_hash || '').toLowerCase() === expected.sha1
    );
    if (!match) fail(`${relativePath}: missing Android OAuth client ${expected.clientId} / ${expected.sha1}`);
  }

  const webClient = oauth.find(item => item.client_type === 3 && item.client_id === EXPECTED.webClientId);
  if (!webClient) fail(`${relativePath}: missing Web OAuth client ${EXPECTED.webClientId}`);
}

function verifyLocalSigningFiles() {
  const candidates = [
    '../.secrets/android/oracle-messenger-upload.jks',
    '../frontend/.secrets/android/oracle-messenger-upload.jks',
    'android/app/debug.keystore',
  ];

  const present = candidates
    .map(relativePath => ({ relativePath, absolutePath: path.resolve(root, relativePath) }))
    .filter(item => fs.existsSync(item.absolutePath))
    .map(item => item.relativePath);

  if (present.length) {
    warn(`local signing file(s) present but not proof of final Play signing: ${present.join(', ')}`);
  }
}

function verifySigningEnv() {
  const names = [
    'ORACLE_MESSENGER_KEYSTORE_FILE',
    'ORACLE_MESSENGER_KEYSTORE_PASSWORD',
    'ORACLE_MESSENGER_KEY_ALIAS',
    'ORACLE_MESSENGER_KEY_PASSWORD',
  ];
  const missing = names.filter(name => !process.env[name]);
  if (missing.length) {
    const message = `release signing env missing: ${missing.join(', ')}`;
    if (requireSigning) fail(message);
    else warn(`${message}. Build can compile, but final AAB signing is not proven in this shell.`);
    return;
  }

  const keystorePath = path.resolve(root, process.env.ORACLE_MESSENGER_KEYSTORE_FILE);
  if (!fs.existsSync(keystorePath)) {
    fail(`release keystore not found: ${keystorePath}`);
    return;
  }

  const keytool = spawnSync('keytool', [
    '-list',
    '-v',
    '-keystore',
    keystorePath,
    '-storepass',
    process.env.ORACLE_MESSENGER_KEYSTORE_PASSWORD,
    '-alias',
    process.env.ORACLE_MESSENGER_KEY_ALIAS,
    '-keypass',
    process.env.ORACLE_MESSENGER_KEY_PASSWORD,
  ], { encoding: 'utf8' });

  if (keytool.status !== 0) {
    fail(`keytool failed for release keystore: ${(keytool.stderr || keytool.stdout || '').trim()}`);
    return;
  }

  const output = keytool.stdout;
  const sha1Match = output.match(/SHA1:\s*([A-F0-9:]+)/);
  if (!sha1Match) {
    fail('release keystore SHA1 not found in keytool output');
    return;
  }
  const sha1 = sha1Match[1].replace(/:/g, '').toLowerCase();
  const allowed = EXPECTED.androidClients.map(item => item.sha1);
  if (!allowed.includes(sha1)) {
    fail(`release keystore SHA1 ${sha1} is not present in google-services OAuth clients`);
  }
}

function main() {
  verifyPackageAndVersion();
  verifyGoogleServices('google-services.json');
  verifyGoogleServices('android/app/google-services.json');
  verifyLocalSigningFiles();
  verifySigningEnv();

  for (const message of warnings) console.warn(`WARN ${message}`);

  if (failures.length) {
    for (const message of failures) console.error(`FAIL ${message}`);
    process.exit(1);
  }

  console.log('PASS Android release config preflight');
}

main();
