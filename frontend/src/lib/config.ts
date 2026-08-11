export const BACKEND_URL = (
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'https://api-messenger.oracle-plus.online'
).replace(/\/+$/, '');

export const GOOGLE_WEB_CLIENT_ID = (
  process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
  '734297398479-rids78si56kck1u3sjrgnivfdtpr7e89.apps.googleusercontent.com'
).trim();

export const GOOGLE_ANDROID_CLIENT_ID = (
  process.env.NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
  '734297398479-irrshc48k2d7kotc696gofbellvll43i.apps.googleusercontent.com'
).trim();

export const GOOGLE_ANDROID_APK_CLIENT_ID = (
  process.env.NEXT_PUBLIC_GOOGLE_ANDROID_APK_CLIENT_ID ||
  '734297398479-f164rp1c083d77vftt76mk7qm32l2u21.apps.googleusercontent.com'
).trim();

export const GOOGLE_ANDROID_UPLOAD_CLIENT_ID = (
  process.env.NEXT_PUBLIC_GOOGLE_ANDROID_UPLOAD_CLIENT_ID ||
  '734297398479-49duf58ok258ni2di43aq7df4pn5tp4d.apps.googleusercontent.com'
).trim();

export const APP_BUILD_LABEL = (
  process.env.NEXT_PUBLIC_APP_BUILD_LABEL ||
  '2026080931'
).trim();
