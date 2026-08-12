import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, MoreVertical } from 'lucide-react-native';
import { selectionHaptic } from '@/services/haptics';
import { colors } from '@/theme/colors';
import type { NativeTabKey } from '@/screens/NativeFeaturePages';

type NativeHomeShellHeaderProps = {
  title: string;
  subtitle: string;
  onRefresh: () => void | Promise<void>;
  onTabPress: (tab: NativeTabKey) => void;
  onMenuPress?: () => void;
};

export function NativeHomeShellHeader({ title, onTabPress, onMenuPress }: NativeHomeShellHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTitleWrap}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.06} style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.headerActions}>
        <Pressable
          style={styles.headerButton}
          onPress={() => {
            selectionHaptic();
            onTabPress('storyCamera');
          }}
          accessibilityLabel="Prendre une photo"
        >
          <Camera size={20} color="#F8FAFC" strokeWidth={1.9} />
        </Pressable>
        <Pressable
          style={styles.headerButton}
          onPress={() => {
            selectionHaptic();
            if (onMenuPress) onMenuPress();
            else onTabPress('menu');
          }}
          accessibilityLabel="Menu"
        >
          <MoreVertical size={21} color="#F8FAFC" strokeWidth={1.9} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.header,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 8,
    minHeight: 58,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  headerTitleWrap: { flex: 1, minWidth: 0, paddingRight: 10 },
  headerTitle: { color: '#FFFFFF', fontSize: 20, lineHeight: 22, fontWeight: '900', letterSpacing: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' },
});
