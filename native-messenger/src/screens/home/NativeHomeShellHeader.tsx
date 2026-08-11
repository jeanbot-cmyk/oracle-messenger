import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, MoreVertical, RefreshCcw } from 'lucide-react-native';
import { colors } from '@/theme/colors';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';

type NativeHomeShellHeaderProps = {
  title: string;
  subtitle: string;
  onRefresh: () => void | Promise<void>;
  onTabPress: (tab: NativeTabKey) => void;
};

export function NativeHomeShellHeader({ title, subtitle, onRefresh, onTabPress }: NativeHomeShellHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitleWrap}>
        <Text numberOfLines={1} style={styles.headerTitle}>{title}</Text>
        <Text numberOfLines={1} style={styles.headerSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.headerActions}>
        <Pressable style={styles.headerButton} onPress={onRefresh} accessibilityLabel="Actualiser">
          <RefreshCcw size={19} color="#F8FAFC" strokeWidth={1.9} />
        </Pressable>
        <Pressable style={styles.headerButton} onPress={() => onTabPress('storyCamera')} accessibilityLabel="Prendre une photo">
          <Camera size={20} color="#F8FAFC" strokeWidth={1.9} />
        </Pressable>
        <Pressable style={styles.headerButton} onPress={() => onTabPress('menu')} accessibilityLabel="Menu">
          <MoreVertical size={21} color="#F8FAFC" strokeWidth={1.9} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.header,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    minHeight: 66,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  headerTitleWrap: { flex: 1, minWidth: 0, paddingRight: 10 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, lineHeight: 24, fontWeight: '900', letterSpacing: 0 },
  headerSubtitle: { color: 'rgba(255,255,255,0.68)', marginTop: 3, fontSize: 12, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerButton: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
});
