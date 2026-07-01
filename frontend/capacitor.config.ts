import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'online.oracle_plus.messenger',
  appName: 'Oracle Messenger',
  webDir: 'out',
  server: {
    // En production : pointe vers le serveur web pour avoir les données en temps réel
    url: 'https://messenger.oracle-plus.online',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#128C7E',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
