import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlignJustify, Menu, MessageCircle, Phone, UserCircle } from 'lucide-react-native';
import { selectionHaptic } from '@/services/haptics';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';
import { colors } from '@/theme/colors';

type NativeBottomTabsProps = {
  tabs: { key: NativeTabKey; label: string }[];
  activeTab: NativeTabKey;
  onTabPress: (tab: NativeTabKey) => void;
};

const ICONS: Partial<Record<NativeTabKey, typeof MessageCircle>> = {
  chats: MessageCircle,
  calls: Phone,
  stories: UserCircle,
  tools: AlignJustify,
  menu: Menu,
};

const TOOL_TABS: NativeTabKey[] = ['tools', 'meeting', 'ai', 'flyers', 'videos', 'translate', 'notes', 'events'];
const MENU_TABS: NativeTabKey[] = ['menu', 'contacts', 'gallery', 'web', 'spirituality', 'payments', 'business', 'profile', 'admin'];
const ROOT_BOTTOM_TABS: NativeTabKey[] = ['chats', 'calls', 'stories', 'tools', 'menu'];
const ROOT_LABELS: Partial<Record<NativeTabKey, string>> = {
  chats: 'Discussions',
  calls: 'Appels',
  stories: 'Actus',
  tools: 'Outils',
  menu: 'Menu',
};

function activeRootTab(activeTab: NativeTabKey): NativeTabKey {
  if (activeTab === 'storyCamera') return 'stories';
  if (TOOL_TABS.includes(activeTab)) return 'tools';
  if (MENU_TABS.includes(activeTab)) return 'menu';
  return activeTab;
}

export function NativeBottomTabs({ tabs, activeTab, onTabPress }: NativeBottomTabsProps) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(7, insets.bottom);
  const selectedRoot = activeRootTab(activeTab);
  const rootTabs = ROOT_BOTTOM_TABS
    .map(rootKey => {
      const exactTab = tabs.find(tab => tab.key === rootKey);
      const childTab = tabs.find(tab => activeRootTab(tab.key) === rootKey);
      const source = exactTab || childTab;
      return source ? { key: rootKey, label: exactTab?.label || ROOT_LABELS[rootKey] || source.label } : null;
    })
    .filter((tab): tab is { key: NativeTabKey; label: string } => Boolean(tab));

  return (
    <View style={[styles.tabs, { paddingBottom: bottomPadding }]}>
      {rootTabs.map(tab => {
        const Icon = ICONS[tab.key] || Menu;
        const active = tab.key === selectedRoot;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              selectionHaptic();
              onTabPress(tab.key);
            }}
            style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.tabPressed]}
          >
            <Icon size={21} color={active ? '#FFFFFF' : '#334155'} strokeWidth={active ? 2.25 : 1.9} />
            <Text numberOfLines={1} maxFontSizeMultiplier={1.06} style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    minHeight: 64,
    paddingTop: 6,
    paddingHorizontal: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.96)',
    flexDirection: 'row',
    shadowColor: '#102A2A',
    shadowOpacity: 0.04,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 8,
  },
  tab: { flex: 1, minWidth: 0, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 4, marginHorizontal: 2, borderRadius: 15 },
  tabActive: { backgroundColor: colors.header, shadowColor: '#102A2A', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  tabPressed: { opacity: 0.72 },
  tabText: { color: '#334155', fontSize: 11.5, lineHeight: 13, fontWeight: '800', textAlign: 'center' },
  tabTextActive: { color: '#FFFFFF', fontWeight: '900' },
});
