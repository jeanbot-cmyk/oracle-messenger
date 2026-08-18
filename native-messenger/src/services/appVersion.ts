import Constants from 'expo-constants';

const PLAY_PACKAGE = Constants.expoConfig?.extra?.playPackage || 'online.oracle_plus.messenger';

export const nativeClientInfo = {
  platform: 'android',
  app: 'oracle-messenger-native',
  versionName: Constants.expoConfig?.version || 'unknown',
  versionCode: Number(Constants.expoConfig?.android?.versionCode ?? Constants.nativeBuildVersion ?? 0) || 0,
  updateUrl: `market://details?id=${PLAY_PACKAGE}`,
  fallbackUpdateUrl: `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}`,
};

export function nativeClientHeaders() {
  return {
    'X-Oracle-App': nativeClientInfo.app,
    'X-Oracle-Platform': nativeClientInfo.platform,
    'X-Oracle-Version': nativeClientInfo.versionName,
    'X-Oracle-Version-Code': String(nativeClientInfo.versionCode),
  };
}
