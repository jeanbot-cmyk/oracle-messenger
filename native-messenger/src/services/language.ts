import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const SETTINGS_KEY = 'oracle-native-menu-settings';

export const LANGUAGES = [
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
] as const;

export type LanguageCode = typeof LANGUAGES[number]['code'];

type Settings = { theme?: 'light' | 'dark'; language?: LanguageCode };
type Listener = (language: LanguageCode) => void;

const listeners = new Set<Listener>();

const TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  fr: {
    'nav.chats': 'Discussions',
    'nav.calls': 'Appels',
    'nav.stories': 'Actus',
    'nav.tools': 'Outils',
    'nav.menu': 'Menu',
    'menu.title': 'Menu',
    'menu.subtitle': 'Compte, services et réglages principaux d’Oracle Messenger.',
    'menu.account': 'COMPTE',
    'menu.services': 'SERVICES',
    'menu.settings': 'RÉGLAGES',
    'menu.profile': 'Mon profil',
    'menu.contacts': 'Contacts',
    'menu.business': 'Entreprise',
    'menu.gallery': 'Photos & Multimédia',
    'menu.ai': 'Réponses IA',
    'menu.flyers': 'Créer un flyer IA',
    'menu.videos': 'IA Vidéo',
    'menu.payments': 'Paiements',
    'menu.translate': 'Traduction',
    'menu.meeting': 'Salle de conférence',
    'menu.notes': 'Notes',
    'menu.events': 'Rappels',
    'menu.spirituality': 'Spiritualité',
    'menu.dark': 'Mode sombre',
    'menu.light': 'Mode clair',
    'menu.language': 'Langue',
    'menu.privacy': 'Confidentialité',
    'menu.terms': 'Conditions',
    'menu.admin': 'Administration',
    'menu.share': 'Partager',
    'menu.logout': 'Déconnexion',
  },
  en: {
    'nav.chats': 'Chats',
    'nav.calls': 'Calls',
    'nav.stories': 'Updates',
    'nav.tools': 'Tools',
    'nav.menu': 'Menu',
    'menu.title': 'Menu',
    'menu.subtitle': 'Account, services and main Oracle Messenger settings.',
    'menu.account': 'ACCOUNT',
    'menu.services': 'SERVICES',
    'menu.settings': 'SETTINGS',
    'menu.profile': 'My profile',
    'menu.contacts': 'Contacts',
    'menu.business': 'Business',
    'menu.gallery': 'Photos & Media',
    'menu.ai': 'AI Replies',
    'menu.flyers': 'Create AI flyer',
    'menu.videos': 'AI Video',
    'menu.payments': 'Payments',
    'menu.translate': 'Translation',
    'menu.meeting': 'Conference room',
    'menu.notes': 'Notes',
    'menu.events': 'Reminders',
    'menu.spirituality': 'Spirituality',
    'menu.dark': 'Dark mode',
    'menu.light': 'Light mode',
    'menu.language': 'Language',
    'menu.privacy': 'Privacy',
    'menu.terms': 'Terms',
    'menu.admin': 'Administration',
    'menu.share': 'Share',
    'menu.logout': 'Sign out',
  },
  es: {
    'nav.chats': 'Chats',
    'nav.calls': 'Llamadas',
    'nav.stories': 'Estados',
    'nav.tools': 'Herramientas',
    'nav.menu': 'Menú',
    'menu.title': 'Menú',
    'menu.subtitle': 'Cuenta, servicios y ajustes principales de Oracle Messenger.',
    'menu.account': 'CUENTA',
    'menu.services': 'SERVICIOS',
    'menu.settings': 'AJUSTES',
    'menu.profile': 'Mi perfil',
    'menu.contacts': 'Contactos',
    'menu.business': 'Empresa',
    'menu.gallery': 'Fotos y multimedia',
    'menu.ai': 'Respuestas IA',
    'menu.flyers': 'Crear flyer IA',
    'menu.videos': 'Video IA',
    'menu.payments': 'Pagos',
    'menu.translate': 'Traducción',
    'menu.meeting': 'Sala de conferencia',
    'menu.notes': 'Notas',
    'menu.events': 'Recordatorios',
    'menu.spirituality': 'Espiritualidad',
    'menu.dark': 'Modo oscuro',
    'menu.light': 'Modo claro',
    'menu.language': 'Idioma',
    'menu.privacy': 'Privacidad',
    'menu.terms': 'Condiciones',
    'menu.admin': 'Administración',
    'menu.share': 'Compartir',
    'menu.logout': 'Cerrar sesión',
  },
  ar: {},
  zh: {},
  pt: {},
  ru: {},
  hi: {},
  de: {},
  ja: {},
};

export function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some(item => item.code === value);
}

export function translate(language: LanguageCode, key: string) {
  return TRANSLATIONS[language]?.[key] || TRANSLATIONS.fr[key] || key;
}

export async function readAppSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return {};
  const saved = JSON.parse(raw) as Settings;
  return {
    theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : undefined,
    language: isLanguageCode(saved.language) ? saved.language : undefined,
  };
}

export async function saveAppSettings(next: Settings) {
  const current = await readAppSettings().catch(() => ({}));
  const value = { ...current, ...next };
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(value)).catch(() => undefined);
  if (value.language) listeners.forEach(listener => listener(value.language as LanguageCode));
  return value;
}

export function subscribeLanguage(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLanguage() {
  const [language, setLanguage] = useState<LanguageCode>('fr');

  useEffect(() => {
    let alive = true;
    readAppSettings()
      .then(settings => {
        if (alive && settings.language) setLanguage(settings.language);
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  useEffect(() => subscribeLanguage(setLanguage), []);

  return {
    language,
    setLanguage: async (next: LanguageCode) => {
      setLanguage(next);
      await saveAppSettings({ language: next });
    },
    t: (key: string) => translate(language, key),
  };
}
