import { existsSync, statSync } from 'fs';

const PLACEHOLDER_VALUES = new Set([
  'oracle_livekit_key',
  'oracle_turn_user',
]);

const PLACEHOLDER_PREFIXES = [
  'replace_with_',
  'your_',
  'changeme',
  'sk-your_',
  'AIza-your_',
];

const PLACEHOLDER_PARTS = [
  'votre-domaine',
  'example.com',
];

export function isUsableEnvValue(value?: string | null) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return false;
  if (PLACEHOLDER_VALUES.has(normalized)) return false;
  if (PLACEHOLDER_PREFIXES.some(prefix => normalized.startsWith(prefix))) return false;
  if (PLACEHOLDER_PARTS.some(part => normalized.includes(part))) return false;
  return true;
}

export function hasUsableEnvValues(names: string[], env: NodeJS.ProcessEnv = process.env) {
  return names.every(name => isUsableEnvValue(env[name]));
}

export function getCsvEnv(name: string, env: NodeJS.ProcessEnv = process.env) {
  return String(env[name] ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(isUsableEnvValue);
}

export function hasPrivateTurnConfig(env: NodeJS.ProcessEnv = process.env) {
  const urls = getCsvEnv('TURN_URLS', env);
  return Boolean(
    urls.length &&
    urls.every(url => /^turns?:/i.test(url)) &&
    hasUsableEnvValues(['TURN_USERNAME', 'TURN_CREDENTIAL'], env),
  );
}

export function hasLiveKitConfig(env: NodeJS.ProcessEnv = process.env) {
  return hasUsableEnvValues(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'], env);
}

export function hasFirebasePushConfig(env: NodeJS.ProcessEnv = process.env) {
  if (isUsableEnvValue(env.FIREBASE_SERVICE_ACCOUNT_JSON)) return true;

  const credentialPath = env.GOOGLE_APPLICATION_CREDENTIALS || env.FIREBASE_ADMIN_HOST_PATH;
  if (!isUsableEnvValue(credentialPath)) return false;

  try {
    return existsSync(credentialPath) && statSync(credentialPath).isFile() && statSync(credentialPath).size > 0;
  } catch {
    return false;
  }
}
