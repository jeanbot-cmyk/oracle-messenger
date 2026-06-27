import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type LangCode, detectLanguage } from '../lib/i18n';

interface SettingsStore {
  theme: 'light' | 'dark';
  lang: LangCode;
  setTheme: (t: 'light' | 'dark') => void;
  setLang: (l: LangCode) => void;
  toggleTheme: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set, get) => ({
      theme: 'light',
      lang: 'fr', // sera détecté au montage
      setTheme: (theme) => set({ theme }),
      setLang: (lang) => set({ lang }),
      toggleTheme: () => set({ theme: get().theme === 'light' ? 'dark' : 'light' }),
    }),
    { name: 'oracle-settings' }
  )
);
