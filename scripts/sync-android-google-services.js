#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'native-messenger/google-services.json');
const target = path.join(root, 'frontend/android/app/google-services.json');
const expectedPackage = 'online.oracle_plus.messenger';

function fail(message) {
  console.error(`[google-services] ${message}`);
  process.exit(1);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`Invalid JSON in ${path.relative(root, file)}: ${error.message}`);
  }
}

function validateGoogleServices(file) {
  const json = readJson(file);
  const client = (json.client || []).find((item) =>
    item?.client_info?.android_client_info?.package_name === expectedPackage
  );

  if (!client) {
    fail(`${path.relative(root, file)} has no Android client for ${expectedPackage}`);
  }

  const androidOauthClients = (client.oauth_client || []).filter((item) =>
    item?.client_type === 1 &&
    item?.android_info?.package_name === expectedPackage &&
    item?.android_info?.certificate_hash
  );

  if (!androidOauthClients.length) {
    fail(`${path.relative(root, file)} has no Android OAuth client with SHA fingerprint for ${expectedPackage}`);
  }

  return json;
}

if (!fs.existsSync(source)) {
  fail(`Missing source file ${path.relative(root, source)}`);
}

validateGoogleServices(source);

fs.mkdirSync(path.dirname(target), { recursive: true });

const sourceContent = fs.readFileSync(source, 'utf8');
const targetContent = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';

if (sourceContent !== targetContent) {
  fs.writeFileSync(target, sourceContent);
  console.log(`[google-services] Synced ${path.relative(root, target)} from ${path.relative(root, source)}`);
} else {
  console.log(`[google-services] OK ${path.relative(root, target)} already matches ${path.relative(root, source)}`);
}

validateGoogleServices(target);
