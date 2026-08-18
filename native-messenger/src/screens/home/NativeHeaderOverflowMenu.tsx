import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { BriefcaseBusiness, Camera, DoorOpen, Languages, Moon, Shield, Share2, Sparkles, Sun, User } from 'lucide-react-native';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { LANGUAGES, readAppSettings, saveAppSettings, type LanguageCode, useLanguage } from '@/services/language';
import { shareOracleMessengerApp } from '@/services/shareOracleApp';
import { colors } from '@/theme/colors';

type HeaderMenuItem = {
  icon: typeof User;
  title: string;
  subtitle?: string;
  end?: string;
  danger?: boolean;
  action: () => void | Promise<void>;
};

const SPIRITUALITY_URL = 'https://oracle-plus.online';

function Divider() {
  return <View style={styles.divider} />;
}

function MenuRow({ item, onClose }: { item: HeaderMenuItem; onClose: () => void }) {
  const Icon = item.icon;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        onClose();
        void item.action();
      }}
      android_ripple={{ color: item.danger ? 'rgba(220,38,38,0.08)' : 'rgba(16,42,42,0.08)' }}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <View style={[styles.itemIcon, item.danger && styles.itemIconDanger]}>
        <Icon size={23} color={item.danger ? '#DC2626' : colors.header} strokeWidth={2} />
      </View>
      <View style={styles.itemCopy}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={[styles.itemTitle, item.danger && styles.itemDanger]}>{item.title}</Text>
        {item.subtitle ? <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.itemSubtitle}>{item.subtitle}</Text> : null}
      </View>
      {item.end ? <Text style={styles.itemEnd}>{item.end}</Text> : null}
    </Pressable>
  );
}

export function NativeHeaderOverflowMenu({
  visible,
  isAdmin,
  onClose,
  onOpenTab,
  onLogout,
}: {
  visible: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onOpenTab: (tab: NativeTabKey) => void;
  onLogout: () => void | Promise<void>;
}) {
  const { width, height } = useWindowDimensions();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [languageOpen, setLanguageOpen] = useState(false);
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

  function openTab(tab: NativeTabKey) {
    onOpenTab(tab);
  }

  function openExternalUrl(url: string) {
    void Linking.openURL(url).catch(() => undefined);
  }

  async function shareApp() {
    await shareOracleMessengerApp();
  }

  const selectedLanguage = LANGUAGES.find(item => item.code === language);
  const rows: HeaderMenuItem[] = [
    { icon: Sparkles, title: t('menu.spirituality'), subtitle: 'Consultation spirituelle', action: () => openExternalUrl(SPIRITUALITY_URL) },
    { icon: Camera, title: t('menu.gallery'), subtitle: 'Galerie locale', action: () => openTab('gallery') },
    { icon: BriefcaseBusiness, title: t('menu.business'), subtitle: 'CRM & Business Hub', action: () => openTab('business') },
    { icon: theme === 'light' ? Moon : Sun, title: theme === 'light' ? t('menu.dark') : t('menu.light'), action: () => saveSettings({ theme: theme === 'light' ? 'dark' : 'light' }) },
    { icon: Languages, title: t('menu.language'), end: selectedLanguage?.flag, action: () => setLanguageOpen(current => !current) },
    { icon: Share2, title: t('menu.share'), subtitle: 'Inviter des contacts', action: shareApp },
    { icon: User, title: t('menu.profile'), action: () => openTab('profile') },
    ...(isAdmin ? [{ icon: Shield, title: t('menu.admin'), subtitle: 'Statistiques & diffusion', action: () => openTab('admin') } as HeaderMenuItem] : []),
    { icon: DoorOpen, title: t('menu.logout'), danger: true, action: onLogout },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.menu, { width: Math.min(292, width - 34), maxHeight: Math.min(height * 0.78, 680) }]}
          onPress={event => event.stopPropagation()}
        >
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
            <MenuRow item={rows[0]} onClose={onClose} />
            <Divider />
            <MenuRow item={rows[1]} onClose={onClose} />
            <MenuRow item={rows[2]} onClose={onClose} />
            <Divider />
            <MenuRow item={rows[3]} onClose={onClose} />
            <Pressable
              accessibilityRole="button"
              onPress={() => setLanguageOpen(current => !current)}
              android_ripple={{ color: 'rgba(16,42,42,0.08)' }}
              style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
            >
              <View style={styles.itemIcon}>
                <Languages size={23} color={colors.header} strokeWidth={2} />
              </View>
              <View style={styles.itemCopy}>
                <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.itemTitle}>{t('menu.language')}</Text>
              </View>
              <Text style={styles.itemEnd}>{selectedLanguage?.flag}</Text>
            </Pressable>
            {languageOpen ? (
              <View style={styles.languageList}>
                {LANGUAGES.map(option => (
                  <Pressable
                    key={option.code}
                    style={[styles.languageRow, option.code === language && styles.languageRowActive]}
                    onPress={() => {
                      setLanguageOpen(false);
                      onClose();
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
            <Divider />
            <MenuRow item={rows[5]} onClose={onClose} />
            <Divider />
            <MenuRow item={rows[6]} onClose={onClose} />
            {isAdmin ? (
              <>
                <Divider />
                <MenuRow item={rows[7]} onClose={onClose} />
              </>
            ) : null}
            <Divider />
            <MenuRow item={rows[isAdmin ? 8 : 7]} onClose={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'transparent' },
  menu: {
    position: 'absolute',
    right: 16,
    top: 72,
    overflow: 'hidden',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(16,42,42,0.12)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#102A2A',
    shadowOpacity: 0.22,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 18 },
    elevation: 22,
  },
  menuContent: { paddingVertical: 10 },
  divider: { height: 1, backgroundColor: 'rgba(16,42,42,0.10)', marginHorizontal: 18, marginVertical: 9 },
  item: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 17, paddingHorizontal: 18, paddingVertical: 15 },
  itemPressed: { backgroundColor: 'rgba(16,42,42,0.08)' },
  itemIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(16,42,42,0.07)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemIconDanger: { backgroundColor: 'rgba(220,38,38,0.08)' },
  itemCopy: { flex: 1, minWidth: 0 },
  itemTitle: { color: colors.text, fontSize: 16, lineHeight: 19, fontWeight: '900' },
  itemSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 17, fontWeight: '700', marginTop: 3 },
  itemEnd: { minWidth: 24, color: colors.muted, fontSize: 19, lineHeight: 22, fontWeight: '900', textAlign: 'right' },
  itemDanger: { color: '#DC2626' },
  languageList: { backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: 4 },
  languageRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24 },
  languageRowActive: { backgroundColor: 'rgba(16,42,42,0.08)' },
  languageFlag: { width: 28, fontSize: 18 },
  languageLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
  languageCheck: { color: colors.brand, fontSize: 18, fontWeight: '900' },
});
