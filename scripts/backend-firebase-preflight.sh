#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

printf "Oracle Messenger Firebase Admin preflight\n"

if [[ -z "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" && -z "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]]; then
  if [[ -f "$ROOT_DIR/.secrets/firebase-admin.json" ]]; then
    export GOOGLE_APPLICATION_CREDENTIALS="$ROOT_DIR/.secrets/firebase-admin.json"
  else
    printf "MISS Firebase Admin secret: set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS\n" >&2
    exit 1
  fi
fi

cd "$ROOT_DIR/backend"
node <<'NODE'
const fs = require('fs');
const { initializeApp, applicationDefault, cert, getApps } = require('firebase-admin/app');

let source = 'GOOGLE_APPLICATION_CREDENTIALS';
let credentials;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  source = 'FIREBASE_SERVICE_ACCOUNT_JSON';
  credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  initializeApp({ credential: cert(credentials) });
} else {
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  credentials = JSON.parse(fs.readFileSync(file, 'utf8'));
  initializeApp({ credential: applicationDefault() });
}

const valid =
  credentials.type === 'service_account' &&
  credentials.project_id === 'tchingankong' &&
  typeof credentials.private_key === 'string' &&
  credentials.private_key.includes('BEGIN PRIVATE KEY') &&
  typeof credentials.client_email === 'string' &&
  credentials.client_email.endsWith('.gserviceaccount.com') &&
  getApps().length === 1;

console.log({
  source,
  project_id: credentials.project_id,
  service_account: credentials.type === 'service_account',
  private_key_present: Boolean(credentials.private_key),
  firebase_admin_initialized: getApps().length === 1,
});

if (!valid) process.exit(1);
NODE

printf "Firebase Admin preflight OK.\n"
