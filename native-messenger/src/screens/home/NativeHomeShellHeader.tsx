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
          <Camera size={24} color={colors.text} strokeWidth={2.25} />
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
          <MoreVertical size={24} color={colors.text} strokeWidth={2.25} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingTop: 15,
    paddingBottom: 12,
    minHeight: 72,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitleWrap: { flex: 1, minWidth: 0, paddingRight: 10 },
  headerTitle: { color: colors.text, fontSize: 28, lineHeight: 34, fontWeight: '900', letterSpacing: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
});
