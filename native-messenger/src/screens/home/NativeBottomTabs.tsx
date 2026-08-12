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
            <View style={[styles.iconPill, active && styles.iconPillActive]}>
              <Icon size={22} color={active ? colors.text : colors.secondary} strokeWidth={active ? 2.35 : 2.05} />
            </View>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.06} style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    minHeight: 70,
    paddingTop: 7,
    paddingHorizontal: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17,27,33,0.08)',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    shadowColor: '#111B21',
    shadowOpacity: 0.045,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -4 },
    elevation: 6,
  },
  tab: { flex: 1, minWidth: 0, minHeight: 54, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 3, borderRadius: 16 },
  tabActive: { backgroundColor: 'transparent' },
  tabPressed: { opacity: 0.72 },
  iconPill: { minWidth: 54, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  iconPillActive: { backgroundColor: '#F1F0ED' },
  tabText: { color: colors.text, fontSize: 11.2, lineHeight: 13, fontWeight: '800', textAlign: 'center' },
  tabTextActive: { color: colors.text, fontWeight: '900' },
});
