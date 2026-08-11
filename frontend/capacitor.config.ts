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
      launchShowDuration: 650,
      backgroundColor: '#128C7E',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    GoogleAuth: {
      scopes: ['profile', 'email'],
      androidClientId: process.env.NEXT_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '734297398479-irrshc48k2d7kotc696gofbellvll43i.apps.googleusercontent.com',
      clientId: process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || '734297398479-rids78si56kck1u3sjrgnivfdtpr7e89.apps.googleusercontent.com',
      forceCodeForRefreshToken: false,
    },
  },
};

export default config;
