import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bot, BriefcaseBusiness, CalendarDays, Contact, CreditCard, FileText, Globe, Image, Languages, LogOut, Moon, NotebookPen, Shield, Settings, Share2, Sparkles, Sun, User, Video, Wand2 } from 'lucide-react-native';
import { FRONTEND_URL } from '@/config/env';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { colors } from '@/theme/colors';
import { PageHeader, SecondaryButton, Section } from './FeatureUi';

type MenuItem = {
  icon: typeof User;
  label: string;
  sub: string;
  tab?: NativeTabKey;
  action?: () => void | Promise<void>;
  actionLabel?: string;
  end?: string;
};

const LANGUAGES = [
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

const SETTINGS_KEY = 'oracle-native-menu-settings';
type LanguageCode = typeof LANGUAGES[number]['code'];

function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some(item => item.code === value);
}

function ServiceRow({ item, onOpenTab }: { item: MenuItem; onOpenTab: (tab: NativeTabKey) => void }) {
  const Icon = item.icon;
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}><Icon size={22} color={colors.accent} strokeWidth={1.8} /></View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{item.label}</Text>
        <Text style={styles.rowSub}>{item.sub}</Text>
      </View>
      {item.end ? <Text style={styles.rowEnd}>{item.end}</Text> : null}
      <SecondaryButton label={item.actionLabel || 'Ouvrir'} onPress={() => item.tab ? onOpenTab(item.tab) : item.action?.()} />
    </View>
  );
}

export function MenuPage({ isAdmin, onOpenTab, onLogout }: { isAdmin: boolean; onOpenTab: (tab: NativeTabKey) => void; onLogout: () => void | Promise<void> }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [language, setLanguage] = useState<LanguageCode>('fr');
  const [languageOpen, setLanguageOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY)
      .then(raw => {
        if (!raw) return;
        const saved = JSON.parse(raw) as { theme?: 'light' | 'dark'; language?: unknown };
        if (saved.theme === 'light' || saved.theme === 'dark') setTheme(saved.theme);
        if (isLanguageCode(saved.language)) setLanguage(saved.language);
      })
      .catch(() => undefined);
  }, []);

  async function saveSettings(next: { theme?: 'light' | 'dark'; language?: LanguageCode }) {
    const value = { theme, language, ...next };
    setTheme(value.theme);
    setLanguage(value.language);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(value)).catch(() => undefined);
  }

  const toggleTheme = () => {
    void saveSettings({ theme: theme === 'light' ? 'dark' : 'light' });
  };
  const openOracleWeb = () => {
    Linking.openURL('https://web.oracle-plus.online?source=messenger-native-menu').catch(() => undefined);
  };
  const openSpirituality = () => {
    Linking.openURL('https://oracle-plus.online/consultation').catch(() => undefined);
  };
  const openPrivacy = () => {
    Linking.openURL(`${FRONTEND_URL}/privacy`).catch(() => undefined);
  };
  const openTerms = () => {
    Linking.openURL(`${FRONTEND_URL}/terms`).catch(() => undefined);
  };
  const shareApp = async () => {
    await Share.share({
      title: 'Oracle Messenger',
      message: 'Oracle Messenger: https://messenger.oracle-plus.online',
    });
  };

  const account: MenuItem[] = [
    { icon: User, label: 'Profil', sub: 'Profil, photo, nom et préférences personnelles.', tab: 'profile' },
    { icon: Contact, label: 'Contacts', sub: 'Retrouver et inviter vos contacts Oracle Messenger.', tab: 'contacts' },
  ];
  const services: MenuItem[] = [
    { icon: BriefcaseBusiness, label: 'Business Assistant', sub: 'Fiches clients, relances, notes et réponses professionnelles.', tab: 'business' },
    { icon: Bot, label: 'Réponses IA', sub: 'Préparer des réponses automatiques avec un prompt contrôlé.', tab: 'ai' },
    { icon: Wand2, label: 'Créer un flyer IA', sub: "Créez des affiches et flyers professionnels avec l'intelligence artificielle.", tab: 'flyers' },
    { icon: Video, label: 'IA Vidéo', sub: 'Créez vos vidéos de présentation IA avec voix off et musique.', tab: 'videos' },
    { icon: CreditCard, label: 'Paiements', sub: 'Paystack et vérification serveur des crédits.', tab: 'payments' },
    { icon: Image, label: 'Galerie', sub: 'Médias locaux téléchargés et validés.', tab: 'gallery' },
    { icon: Languages, label: 'Traduction', sub: 'Rédiger, reformuler ou traduire un message avant envoi.', tab: 'translate' },
    { icon: Video, label: 'Meeting', sub: 'Créer ou rejoindre une salle avec un lien partageable.', tab: 'meeting' },
    { icon: NotebookPen, label: 'Notes', sub: 'Notes locales conservées sur ce téléphone.', tab: 'notes' },
    { icon: CalendarDays, label: 'Rappels', sub: 'Rappels locaux avec notification Android.', tab: 'events' },
    { icon: Globe, label: 'Oracle Web', sub: 'Créer mon site web, appli ou boutique.', action: openOracleWeb },
    { icon: Sparkles, label: 'Spiritualité', sub: 'Accéder aux consultations et services Oracle Plus.', action: openSpirituality },
  ];
  const settings: MenuItem[] = [
    {
      icon: theme === 'light' ? Moon : Sun,
      label: theme === 'light' ? 'Mode sombre' : 'Mode clair',
      sub: 'Préférence visuelle conservée sur ce téléphone.',
      action: toggleTheme,
      actionLabel: 'Changer',
    },
    {
      icon: Languages,
      label: 'Langue',
      sub: 'Choisir la langue de l’interface.',
      action: () => setLanguageOpen(current => !current),
      actionLabel: 'Choisir',
      end: LANGUAGES.find(item => item.code === language)?.flag,
    },
    { icon: Settings, label: 'Paramètres', sub: 'Notifications, sécurité et stockage.', tab: 'profile' },
    { icon: Shield, label: 'Confidentialité', sub: 'Politique de confidentialité Oracle Messenger.', action: openPrivacy },
    { icon: FileText, label: 'Conditions', sub: "Règles d'utilisation et services Oracle Messenger.", action: openTerms },
    ...(isAdmin ? [{ icon: Shield, label: 'Administration', sub: 'Statistiques, notifications et message système.', tab: 'admin' as NativeTabKey }] : []),
    { icon: Share2, label: 'Partager', sub: 'Partager Oracle Messenger.', action: shareApp },
    { icon: LogOut, label: 'Déconnexion', sub: 'Fermer la session sur ce téléphone.', action: onLogout },
  ];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <PageHeader title="Menu" subtitle="Compte, services et réglages principaux." />
      <Section title="Compte">
        {account.map(item => <ServiceRow key={item.label} item={item} onOpenTab={onOpenTab} />)}
      </Section>
      <Section title="Services">
        {services.map(item => <ServiceRow key={item.label} item={item} onOpenTab={onOpenTab} />)}
      </Section>
      <Section title="Réglages">
        {settings.map(item => (
          <View key={item.label}>
            <ServiceRow item={item} onOpenTab={onOpenTab} />
            {item.label === 'Langue' && languageOpen ? (
              <View style={styles.languageList}>
                {LANGUAGES.map(option => (
                  <Pressable
                    key={option.code}
                    style={[styles.languageRow, option.code === language && styles.languageRowActive]}
                    onPress={() => {
                      setLanguageOpen(false);
                      void saveSettings({ language: option.code });
                    }}
                  >
                    <Text style={styles.languageFlag}>{option.flag}</Text>
                    <Text style={styles.languageLabel}>{option.label}</Text>
                    {option.code === language ? <Text style={styles.languageCheck}>✓</Text> : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 0, paddingBottom: 86, backgroundColor: colors.background },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 15, fontWeight: '800', marginBottom: 2 },
  rowSub: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  rowEnd: { color: colors.text, fontSize: 18, fontWeight: '900' },
  languageList: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, paddingLeft: 58 },
  languageRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 12, marginVertical: 2 },
  languageRowActive: { backgroundColor: '#EAF4F1' },
  languageFlag: { width: 28, fontSize: 18 },
  languageLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
  languageCheck: { color: colors.brand, fontSize: 18, fontWeight: '900' },
});
