import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BriefcaseBusiness, Menu, MessageCircle, Phone, UserCircle } from 'lucide-react-native';
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
  tools: BriefcaseBusiness,
  menu: Menu,
};

const TOOL_TABS: NativeTabKey[] = ['tools', 'meeting', 'ai', 'flyers', 'videos', 'translate', 'notes', 'events'];

function isTabActive(tabKey: NativeTabKey, activeTab: NativeTabKey) {
  if (tabKey === activeTab) return true;
  if (tabKey === 'stories') return activeTab === 'storyCamera';
  if (tabKey === 'tools') return TOOL_TABS.includes(activeTab);
  return false;
}

export function NativeBottomTabs({ tabs, activeTab, onTabPress }: NativeBottomTabsProps) {
  return (
    <View style={styles.tabs}>
      {tabs.map(tab => {
        const Icon = ICONS[tab.key] || Menu;
        const active = isTabActive(tab.key, activeTab);
        return (
          <Pressable key={tab.key} onPress={() => onTabPress(tab.key)} style={styles.tab}>
            <Icon size={21} color={active ? colors.brand : '#334155'} strokeWidth={1.9} />
            <Text numberOfLines={1} style={[styles.tabText, active && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    minHeight: 68,
    paddingTop: 8,
    paddingBottom: 8,
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
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
  tabText: { color: '#334155', fontSize: 12, lineHeight: 13, fontWeight: '800', textAlign: 'center' },
  tabTextActive: { color: colors.brand, fontWeight: '900' },
});
