#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const repoRoot = path.resolve(root, '..');
const requireSigning = process.argv.includes('--require-signing') || process.argv.includes('--strict');
const rejectDebugCerts = process.argv.includes('--reject-debug-certs');
const apkArgIndex = process.argv.findIndex(arg => arg === '--apk' || arg.startsWith('--apk='));
const apkPathArg = apkArgIndex >= 0
  ? (process.argv[apkArgIndex].startsWith('--apk=')
    ? process.argv[apkArgIndex].slice('--apk='.length)
    : process.argv[apkArgIndex + 1])
  : '';

const EXPECTED = {
  packageName: 'online.oracle_plus.messenger',
  versionName: '1.0.20260819.14',
  versionCode: 2026081914,
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
    {
      clientId: '734297398479-lroihgl276ld6f5m6ubf38bq2qni7plc.apps.googleusercontent.com',
      sha1: '5e8f16062ea3cd2c4a0d547876baa6f38cabf625',
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

function run(command, commandArgs, options = {}) {
  return spawnSync(command, commandArgs, {
    cwd: options.cwd || root,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: process.env,
  });
}

function findAndroidTool(name) {
  const candidates = [];
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(repoRoot, '.android-sdk'),
    path.join(root, '.android-sdk'),
  ].filter(Boolean);

  for (const sdkRoot of sdkRoots) {
    const buildToolsDir = path.join(sdkRoot, 'build-tools');
    if (!fs.existsSync(buildToolsDir)) continue;
    for (const version of fs.readdirSync(buildToolsDir).sort().reverse()) {
      candidates.push(path.join(buildToolsDir, version, name));
    }
  }

  candidates.push(name);
  return candidates.find(candidate => {
    const result = run(candidate, ['--version']);
    return result.status === 0 || result.stderr || result.stdout;
  }) || name;
}

function parseApkPath() {
  if (!apkPathArg || apkPathArg === '--reject-debug-certs') return null;
  return path.isAbsolute(apkPathArg) ? apkPathArg : path.resolve(root, apkPathArg);
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

function verifyApkGoogleSignature() {
  const apkPath = parseApkPath();
  if (!apkPath) return;

  if (!fs.existsSync(apkPath)) {
    fail(`APK not found: ${apkPath}`);
    return;
  }

  const aapt = findAndroidTool('aapt');
  const badging = run(aapt, ['dump', 'badging', apkPath]);
  if (badging.status !== 0) {
    fail(`aapt failed for APK ${apkPath}: ${(badging.stderr || badging.stdout || '').trim()}`);
  } else {
    const packageMatch = badging.stdout.match(/package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/);
    if (!packageMatch) {
      fail(`APK badging did not include package metadata: ${apkPath}`);
    } else {
      assertEqual('APK packageName', packageMatch[1], EXPECTED.packageName);
      assertEqual('APK versionCode', Number(packageMatch[2]), EXPECTED.versionCode);
      assertEqual('APK versionName', packageMatch[3], EXPECTED.versionName);
    }
  }

  const apksigner = findAndroidTool('apksigner');
  const result = run(apksigner, ['verify', '--print-certs', '--verbose', apkPath]);
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  if (result.status !== 0) {
    fail(`apksigner verification failed for APK ${apkPath}: ${output.trim()}`);
    return;
  }

  const sha1Match = output.match(/Signer #1 certificate SHA-1 digest:\s*([a-fA-F0-9:]+)/);
  if (!sha1Match) {
    fail(`APK signer SHA1 not found in apksigner output for ${apkPath}`);
    return;
  }

  const signerSha1 = sha1Match[1].replace(/:/g, '').toLowerCase();
  const allowed = EXPECTED.androidClients.map(item => item.sha1);
  if (!allowed.includes(signerSha1)) {
    fail(
      `APK signer SHA1 ${signerSha1} is not present in Google OAuth clients. ` +
      'Google Sign-In can fail with DEVELOPER_ERROR for this APK.'
    );
  }

  const signerDnMatch = output.match(/Signer #1 certificate DN:\s*(.+)/);
  const signerDn = signerDnMatch ? signerDnMatch[1].trim() : '';
  if (rejectDebugCerts && /Android Debug/i.test(signerDn)) {
    fail(`APK is signed with an Android Debug certificate: ${signerDn}`);
  }
}

function main() {
  verifyPackageAndVersion();
  verifyGoogleServices('google-services.json');
  verifyGoogleServices('android/app/google-services.json');
  verifyLocalSigningFiles();
  verifySigningEnv();
  verifyApkGoogleSignature();

  for (const message of warnings) console.warn(`WARN ${message}`);

  if (failures.length) {
    for (const message of failures) console.error(`FAIL ${message}`);
    process.exit(1);
  }

  console.log('PASS Android release config preflight');
}

main();
