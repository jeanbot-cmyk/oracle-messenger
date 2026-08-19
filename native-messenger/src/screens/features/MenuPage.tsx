import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Bot, BriefcaseBusiness, CalendarDays, ChevronRight, Contact, CreditCard, Database as DatabaseIcon, FileText, Image, Languages, LogOut, Moon, NotebookPen, Search, Shield, Settings, Share2, Sparkles, Sun, User, Video, Wand2 } from 'lucide-react-native';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { NativeLegalDocumentPanel } from '@/legal/NativeLegalDocumentPanel';
import type { LegalDocumentId } from '@/legal/oracleLegalDocuments';
import { LANGUAGES, readAppSettings, saveAppSettings, type LanguageCode, useLanguage } from '@/services/language';
import { shareOracleMessengerApp } from '@/services/shareOracleApp';
import { colors } from '@/theme/colors';
import { AlertText } from './FeatureUi';

type MenuItem = {
  icon: typeof User;
  label: string;
  sub: string;
  tab?: NativeTabKey;
  action?: () => void | Promise<void>;
  actionLabel?: string;
  end?: string;
};

const SPIRITUALITY_URL = 'https://oracle-plus.online';
type LegalView = LegalDocumentId;

function ServiceRow({ item, onOpenTab }: { item: MenuItem; onOpenTab: (tab: NativeTabKey) => void }) {
  const Icon = item.icon;
  const open = () => item.tab ? onOpenTab(item.tab) : item.action?.();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={open}
      android_ripple={{ color: 'rgba(16,42,42,0.06)' }}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIcon}><Icon size={22} color={colors.header} strokeWidth={1.9} /></View>
      <View style={styles.rowText}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.rowTitle}>{item.label}</Text>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.08} style={styles.rowSub}>{item.sub}</Text>
      </View>
      {item.end ? <Text style={styles.rowEnd}>{item.end}</Text> : null}
      <ChevronRight size={16} color="#C4C4C4" strokeWidth={2.2} />
    </Pressable>
  );
}

function MenuSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <View style={styles.searchWrap}>
      <View style={styles.searchRow}>
        <Search size={18} color="#64748B" strokeWidth={1.9} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Rechercher..."
          placeholderTextColor="#94A3B8"
          maxFontSizeMultiplier={1.08}
          style={styles.searchInput}
        />
      </View>
    </View>
  );
}

function MenuSection({ title, items, onOpenTab }: { title: string; items: MenuItem[]; onOpenTab: (tab: NativeTabKey) => void }) {
  if (!items.length) return null;
  return (
    <>
      <Text style={styles.sectionLabel}>{title}</Text>
      <View style={styles.section}>
        {items.map(item => <ServiceRow key={item.label} item={item} onOpenTab={onOpenTab} />)}
      </View>
    </>
  );
}

export function MenuPage({ isAdmin, onOpenTab, onLogout }: { isAdmin: boolean; onOpenTab: (tab: NativeTabKey) => void; onLogout: () => void | Promise<void> }) {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [languageOpen, setLanguageOpen] = useState(false);
  const [legalView, setLegalView] = useState<LegalView | null>(null);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const { language, setLanguage, t } = useLanguage();

  useEffect(() => {
    readAppSettings()
      .then(saved => {
        if (saved.theme) setTheme(saved.theme);
      })
      .catch(() => undefined);
  }, []);

  async function saveSettings(next: { theme?: 'light' | 'dark'; language?: LanguageCode }) {
    const value = await saveAppSettings({ theme, language, ...next });
    if (value.theme) setTheme(value.theme);
  }

  const toggleTheme = () => {
    void saveSettings({ theme: theme === 'light' ? 'dark' : 'light' });
  };
  const openPrivacy = () => {
    setNotice('');
    setLanguageOpen(false);
    setLegalView(current => current === 'privacy' ? null : 'privacy');
  };
  const openTerms = () => {
    setNotice('');
    setLanguageOpen(false);
    setLegalView(current => current === 'terms' ? null : 'terms');
  };
  const openDataPolicy = () => {
    setNotice('');
    setLanguageOpen(false);
    setLegalView(current => current === 'data' ? null : 'data');
  };
  const openExternalUrl = (url: string) => {
    void Linking.openURL(url).catch(() => undefined);
  };
  const shareApp = async () => {
    await shareOracleMessengerApp();
  };

  const account: MenuItem[] = [
    { icon: User, label: t('menu.profile'), sub: 'Profil, photo, nom et préférences personnelles.', tab: 'profile' },
    { icon: Contact, label: t('menu.contacts'), sub: 'Importez et invitez vos contacts.', tab: 'contacts' },
  ];
  const services: MenuItem[] = [
    { icon: BriefcaseBusiness, label: t('menu.business'), sub: 'CRM & Business Hub', tab: 'business' },
    { icon: Image, label: t('menu.gallery'), sub: 'Galerie locale', tab: 'gallery' },
    { icon: Bot, label: t('menu.ai'), sub: 'Préparer des réponses automatiques avec un prompt contrôlé.', tab: 'ai' },
    { icon: Wand2, label: t('menu.flyers'), sub: "Créez des affiches et flyers professionnels avec l'intelligence artificielle.", tab: 'flyers' },
    { icon: Video, label: t('menu.videos'), sub: 'Créez vos vidéos de présentation IA avec voix off et musique.', tab: 'videos' },
    { icon: CreditCard, label: t('menu.payments'), sub: 'Paystack, Western Union international et vérification serveur.', tab: 'payments' },
    { icon: Languages, label: t('menu.translate'), sub: 'Rédiger, reformuler ou traduire un message avant envoi.', tab: 'translate' },
    { icon: Video, label: t('menu.meeting'), sub: 'Créer ou rejoindre une salle de direct avec un lien partageable.', tab: 'meeting' },
    { icon: NotebookPen, label: t('menu.notes'), sub: 'Notes locales conservées sur ce téléphone.', tab: 'notes' },
    { icon: CalendarDays, label: t('menu.events'), sub: 'Rappels locaux avec notification Android.', tab: 'events' },
    { icon: Sparkles, label: t('menu.spirituality'), sub: 'Consultation spirituelle.', action: () => openExternalUrl(SPIRITUALITY_URL) },
  ];
  const settings: MenuItem[] = [
    {
      icon: theme === 'light' ? Moon : Sun,
      label: theme === 'light' ? t('menu.dark') : t('menu.light'),
      sub: 'Préférence visuelle conservée sur ce téléphone.',
      action: toggleTheme,
      actionLabel: 'Changer',
    },
    {
      icon: Languages,
      label: t('menu.language'),
      sub: 'Choisir la langue de l’interface.',
      action: () => setLanguageOpen(current => !current),
      actionLabel: 'Choisir',
      end: LANGUAGES.find(item => item.code === language)?.flag,
    },
    { icon: Settings, label: 'Paramètres', sub: 'Notifications, sécurité et stockage.', tab: 'profile' },
    { icon: Shield, label: t('menu.privacy'), sub: 'Politique de confidentialité Oracle Messenger.', action: openPrivacy },
    { icon: DatabaseIcon, label: 'Données', sub: 'Stockage local, transit serveur, conservation et suppression.', action: openDataPolicy },
    { icon: FileText, label: t('menu.terms'), sub: "Règles d'utilisation et services Oracle Messenger.", action: openTerms },
    ...(isAdmin ? [{ icon: Shield, label: t('menu.admin'), sub: 'Statistiques, notifications et message système.', tab: 'admin' as NativeTabKey }] : []),
    { icon: Share2, label: t('menu.share'), sub: 'Partager Oracle Messenger.', action: shareApp },
    { icon: LogOut, label: t('menu.logout'), sub: 'Fermer la session sur ce téléphone.', action: onLogout },
  ];
  const filterItems = (items: MenuItem[]) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(item => `${item.label} ${item.sub}`.toLowerCase().includes(needle));
  };
  const accountItems = filterItems(account);
  const serviceItems = filterItems(services);
  const settingItems = filterItems(settings);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <MenuSearch value={query} onChange={setQuery} />
      <View style={styles.pageIntro}>
        <Text maxFontSizeMultiplier={1.08} style={styles.pageTitle}>{t('menu.title')}</Text>
        <Text maxFontSizeMultiplier={1.08} style={styles.pageSubtitle}>{t('menu.subtitle')}</Text>
      </View>
      <Text style={styles.independentNotice}>Oracle Messenger est une application éditée par Oracle Plus. Elle n’est pas affiliée, sponsorisée ni approuvée par Oracle Corporation ou ses filiales.</Text>
      <View style={styles.noticeWrap}><AlertText text={notice} /></View>
      {legalView ? <NativeLegalDocumentPanel documentId={legalView} onClose={() => setLegalView(null)} embedded /> : null}
      <MenuSection title={t('menu.account')} items={accountItems} onOpenTab={onOpenTab} />
      <MenuSection title={t('menu.services')} items={serviceItems} onOpenTab={onOpenTab} />
      {settingItems.length ? (
        <>
          <Text style={styles.sectionLabel}>{t('menu.settings')}</Text>
          <View style={styles.section}>
            {settingItems.map(item => (
              <View key={item.label}>
                <ServiceRow item={item} onOpenTab={onOpenTab} />
                {item.label === t('menu.language') && languageOpen ? (
                  <View style={styles.languageList}>
                    {LANGUAGES.map(option => (
                      <Pressable
                        key={option.code}
                        style={[styles.languageRow, option.code === language && styles.languageRowActive]}
                        onPress={() => {
                          setLanguageOpen(false);
                          void setLanguage(option.code);
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
          </View>
        </>
      ) : null}
      {!accountItems.length && !serviceItems.length && !settingItems.length ? (
        <View style={styles.empty}>
          <Text style={styles.rowTitle}>Aucun élément trouvé</Text>
          <Text style={styles.rowSub}>Essayez une autre recherche.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 0, paddingBottom: 86, backgroundColor: colors.background },
  searchWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 9, backgroundColor: colors.surface },
  searchRow: { minHeight: 44, borderRadius: 22, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, minHeight: 42, color: colors.text, fontSize: 15, fontWeight: '600', paddingHorizontal: 0 },
  pageIntro: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  pageTitle: { color: colors.title, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  pageSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 19, fontWeight: '600', marginTop: 4 },
  independentNotice: { marginHorizontal: 16, marginTop: 10, marginBottom: 2, color: colors.muted, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 11.5, lineHeight: 16, fontWeight: '800' },
  noticeWrap: { marginHorizontal: 16 },
  legalPanel: { marginHorizontal: 16, marginTop: 10, marginBottom: 4, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', shadowColor: '#102A2A', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  legalHeader: { minHeight: 74, backgroundColor: '#EAF4F1', borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  legalHeaderIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  legalHeaderText: { flex: 1, minWidth: 0 },
  legalTitle: { color: colors.text, fontSize: 15.5, lineHeight: 19, fontWeight: '900' },
  legalSubtitle: { color: colors.muted, fontSize: 11.5, lineHeight: 16, fontWeight: '700', marginTop: 3 },
  legalClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  legalBlock: { paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 7 },
  legalBlockHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  legalIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#EEF2F1', alignItems: 'center', justifyContent: 'center' },
  legalBlockTitle: { flex: 1, color: colors.header, fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  legalBulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  legalDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.brand, marginTop: 7 },
  legalText: { flex: 1, color: colors.text, fontSize: 12.2, lineHeight: 17, fontWeight: '700' },
  sectionLabel: { backgroundColor: colors.background, color: '#64748B', fontSize: 11, lineHeight: 14, fontWeight: '900', letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 },
  section: { backgroundColor: colors.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  rowPressed: { backgroundColor: '#EAF4F1' },
  rowIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#EEF2F1', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 15, lineHeight: 18, fontWeight: '800' },
  rowSub: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
  rowEnd: { color: colors.text, fontSize: 18, fontWeight: '900' },
  empty: { minHeight: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 6 },
  languageList: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6, paddingLeft: 58, paddingRight: 16, backgroundColor: colors.surface },
  languageRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, paddingHorizontal: 12, marginVertical: 2 },
  languageRowActive: { backgroundColor: '#EAF4F1' },
  languageFlag: { width: 28, fontSize: 18 },
  languageLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
  languageCheck: { color: colors.brand, fontSize: 18, fontWeight: '900' },
});
