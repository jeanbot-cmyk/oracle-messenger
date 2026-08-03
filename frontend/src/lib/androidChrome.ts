function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

export function shouldOpenAndroidLinkInChrome() {
  if (typeof window === 'undefined') return false;
  if (isStandaloneMode()) return false;

  const ua = navigator.userAgent.toLowerCase();
  const isAndroid = ua.includes('android');
  if (!isAndroid) return false;

  const isChrome = ua.includes('chrome/') && !ua.includes('wv') &&
    !ua.includes('samsungbrowser') &&
    !ua.includes('edg/') &&
    !ua.includes('opr/') &&
    !ua.includes('opera') &&
    !ua.includes('firefox') &&
    !ua.includes('fxios');

  return !isChrome;
}

export function buildChromeIntentUrl(url = window.location.href) {
  const target = new URL(url);
  const path = `${target.pathname}${target.search}${target.hash}`;
  const chromeFallback = target.toString();
  return `intent://${target.host}${path}#Intent;scheme=https;package=com.android.chrome;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(chromeFallback)};end`;
}

export function installPageUrl() {
  if (typeof window === 'undefined') return 'https://messenger.oracle-plus.online/install';
  const url = new URL('/install', window.location.origin);
  const from = new URLSearchParams(window.location.search).get('from');
  if (from) url.searchParams.set('from', from);
  url.searchParams.set('source', 'android-install');
  return url.toString();
}

export function buildChromeInstallIntentUrl() {
  return buildChromeIntentUrl(installPageUrl());
}

export function openCurrentAndroidLinkInChrome(scope = 'route') {
  if (!shouldOpenAndroidLinkInChrome()) return false;
  window.location.replace(buildChromeIntentUrl(window.location.href));
  return true;
}
