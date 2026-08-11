import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshCcw } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';

type NativeTab = { key: NativeTabKey; label: string };

type NativeHomeShellHeaderProps = {
  subtitle: string;
  tabs: NativeTab[];
  activeTab: NativeTabKey;
  onRefresh: () => void | Promise<void>;
  onTabPress: (tab: NativeTabKey) => void;
};

export function NativeHomeShellHeader({ subtitle, tabs, activeTab, onRefresh, onTabPress }: NativeHomeShellHeaderProps) {
  return (
    <>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Oracle Messenger</Text>
          <Text style={styles.headerSubtitle}>{subtitle}</Text>
        </View>
        <Pressable style={styles.headerButton} onPress={onRefresh}>
          <RefreshCcw size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      <View style={styles.tabWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {tabs.map(tab => (
            <Pressable key={tab.key} onPress={() => onTabPress(tab.key)} style={[styles.tabItem, activeTab === tab.key && styles.tabItemActive]}>
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: colors.header, paddingHorizontal: 18, paddingTop: 18, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  headerSubtitle: { color: 'rgba(255,255,255,0.68)', marginTop: 3, fontSize: 12, fontWeight: '700' },
  headerButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  tabWrap: { backgroundColor: colors.header, paddingBottom: 10 },
  tabBar: { paddingHorizontal: 12, gap: 8 },
  tabItem: { minHeight: 38, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
  tabItemActive: { backgroundColor: colors.brand },
  tabText: { color: 'rgba(255,255,255,0.76)', fontSize: 12.5, fontWeight: '900' },
  tabTextActive: { color: '#FFFFFF' },
});
