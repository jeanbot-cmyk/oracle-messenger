import { Capacitor } from '@capacitor/core';

export function isNativeAndroidWebView() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return ua.includes('; wv') || ua.includes('version/4.0 chrome/');
}

export function isInstalledAppMode() {
  if (typeof window === 'undefined') return false;
  const isCapacitorNative = Capacitor.isNativePlatform?.() === true ||
    (typeof (window as any).Capacitor?.isNativePlatform === 'function' && (window as any).Capacitor.isNativePlatform());
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    isCapacitorNative ||
    document.referrer.startsWith('android-app://') ||
    isNativeAndroidWebView();
}

export const ANDROID_PACKAGE_ID = 'online.oracle_plus.messenger';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`;

export function isAndroidDevice() {
  if (typeof window === 'undefined') return false;
  return navigator.userAgent.toLowerCase().includes('android');
}

export function isIosDevice() {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function isCompatibleAndroidChrome() {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const isChrome = ua.includes('chrome/') && !ua.includes('wv') &&
    !ua.includes('samsungbrowser') &&
    !ua.includes('edg/') &&
    !ua.includes('opr/') &&
    !ua.includes('opera') &&
    !ua.includes('firefox') &&
    !ua.includes('fxios');

  return isChrome;
}

export function shouldOpenAndroidLinkInChrome() {
  if (typeof window === 'undefined') return false;
  if (isInstalledAppMode()) return false;
  if (!isAndroidDevice()) return false;
  return !isCompatibleAndroidChrome();
}

export function buildChromeIntentUrl(url = window.location.href) {
  const target = new URL(url);
  const path = `${target.pathname}${target.search}${target.hash}`;
  const chromeFallback = target.toString();
  return `intent://${target.host}${path}#Intent;scheme=https;package=com.android.chrome;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(chromeFallback)};end`;
}

export function installPageUrl(params: Record<string, string> = {}) {
  if (typeof window === 'undefined') return 'https://messenger.oracle-plus.online/install';
  const url = new URL('/install', window.location.origin);
  const from = new URLSearchParams(window.location.search).get('from');
  if (from) url.searchParams.set('from', from);
  url.searchParams.set('source', 'android-install');
  Object.entries(params).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  return url.toString();
}

export function buildChromeInstallIntentUrl(params: Record<string, string> = {}) {
  return buildChromeIntentUrl(installPageUrl(params));
}

export function buildPlayStoreIntentUrl() {
  return `intent://details?id=${ANDROID_PACKAGE_ID}#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;
}

export function openPlayStore() {
  if (typeof window === 'undefined') return;
  window.location.assign(buildPlayStoreIntentUrl());
}

export function openCurrentAndroidLinkInChrome(scope = 'route') {
  if (!shouldOpenAndroidLinkInChrome()) return false;
  window.location.replace(buildChromeIntentUrl(window.location.href));
  return true;
}
