import Constants from 'expo-constants';

const extra = Constants.expoConfig?.extra ?? {};

export const NATIVE_BASELINE = String(extra.nativeBaseline ?? 'dev');
export const BACKEND_URL = String(extra.backendUrl ?? 'https://api-messenger.oracle-plus.online').replace(/\/+$/, '');
export const FRONTEND_URL = String(extra.frontendUrl ?? 'https://messenger.oracle-plus.online').replace(/\/+$/, '');
export const ANDROID_PACKAGE = String(extra.playPackage ?? 'online.oracle_plus.messenger');
export const GOOGLE_ANDROID_CLIENT_ID = '734297398479-irrshc48k2d7kotc696gofbellvll43i.apps.googleusercontent.com';
export const GOOGLE_WEB_CLIENT_ID = '734297398479-rids78si56kck1u3sjrgnivfdtpr7e89.apps.googleusercontent.com';
