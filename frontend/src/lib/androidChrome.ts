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
  return `intent://${target.host}${path}#Intent;scheme=${target.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(target.href)};end`;
}

export function openCurrentAndroidLinkInChrome() {
  if (!shouldOpenAndroidLinkInChrome()) return false;
  const currentUrl = window.location.href;
  const key = `oracle-opened-chrome:${currentUrl}`;
  if (sessionStorage.getItem(key)) return false;
  sessionStorage.setItem(key, '1');
  window.location.href = buildChromeIntentUrl(currentUrl);
  return true;
}
