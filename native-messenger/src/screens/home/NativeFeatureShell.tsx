import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { selectionHaptic } from '@/services/haptics';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { colors } from '@/theme/colors';

const FEATURE_TITLES: Partial<Record<NativeTabKey, string>> = {
  calls: 'Appels',
  stories: 'Actus',
  storyCamera: 'Caméra',
  tools: 'Outils',
  meeting: 'Outils',
  translate: 'Outils',
  notes: 'Outils',
  events: 'Outils',
  menu: 'Menu',
  contacts: 'Sélectionner un contact',
  gallery: 'Galerie',
  web: 'Web',
  spirituality: 'Spiritualité',
  ai: 'Outils',
  flyers: 'Outils',
  videos: 'Outils',
  payments: 'Paiements',
  business: 'Business & CRM',
  profile: 'Profil',
  admin: 'Administration',
};

export function NativeFeatureShell({
  tab,
  children,
  onBackToChats,
  onSwipeTab,
}: {
  tab: NativeTabKey;
  children: ReactNode;
  onBackToChats: () => void;
  onSwipeTab?: (direction: 'next' | 'previous') => void;
}) {
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => (
      Math.abs(gesture.dx) > 72 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35
    ),
    onPanResponderRelease: (_, gesture) => {
      if (Math.abs(gesture.dx) > 86 && Math.abs(gesture.dy) < 54) {
        selectionHaptic();
        if (onSwipeTab) onSwipeTab(gesture.dx < 0 ? 'next' : 'previous');
        else onBackToChats();
      }
    },
  }), [onBackToChats, onSwipeTab]);

  return (
    <View style={styles.shell} {...panResponder.panHandlers}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour aux discussions"
          onPress={() => {
            selectionHaptic();
            onBackToChats();
          }}
          android_ripple={{ color: 'rgba(17,27,33,0.08)', borderless: true }}
          style={styles.backButton}
        >
          <ArrowLeft size={23} color={colors.text} strokeWidth={2.7} />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.title}>{FEATURE_TITLES[tab] || 'Oracle Messenger'}</Text>
        </View>
      </View>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
  topBar: {
    minHeight: 60,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backButton: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontSize: 19, lineHeight: 23, fontWeight: '900' },
  content: { flex: 1 },
});
