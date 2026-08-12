import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { highQualityImageUri } from '@/screens/home/homeUtils';
import { selectionHaptic } from '@/services/haptics';
import { colors } from '@/theme/colors';
import type { User } from '@/types/messenger';

function initials(name?: string | null) {
  return String(name || '?').trim().slice(0, 2).toUpperCase();
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.pageHeader}>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.04} style={styles.pageHeaderTitle}>{title}</Text>
      {subtitle ? <Text numberOfLines={2} maxFontSizeMultiplier={1.04} style={styles.pageHeaderSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function StatCard({ label, value, highlighted }: { label: string; value: string | number; highlighted?: boolean }) {
  return (
    <View style={[styles.statCard, highlighted && styles.statCardHighlighted]}>
      <Text style={styles.statCardValue}>{value}</Text>
      <Text style={styles.statCardLabel}>{label}</Text>
    </View>
  );
}

export function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      disabled={disabled}
      style={[styles.primaryButton, disabled && styles.disabled]}
    >
      <Text maxFontSizeMultiplier={1.05} style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        selectionHaptic();
        onPress();
      }}
      disabled={disabled}
      style={[styles.secondaryButton, disabled && styles.disabled]}
    >
      <Text maxFontSizeMultiplier={1.05} style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function AlertText({ text }: { text?: string }) {
  if (!text) return null;
  return <Text style={styles.alert}>{text}</Text>;
}

export function Loading({ active }: { active: boolean }) {
  if (!active) return null;
  return <ActivityIndicator color={colors.brand} style={styles.loader} />;
}

export function UserRow({
  user,
  actionLabel,
  onPress,
  hideUsername,
}: {
  user: User;
  actionLabel?: string;
  onPress?: () => void;
  hideUsername?: boolean;
}) {
  const subtitle = hideUsername
    ? user.status || 'Sur Oracle Messenger'
    : user.email || user.phone || user.status || 'Oracle Messenger';
  const avatar = highQualityImageUri(user.avatar) || user.avatar;
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials(user.name)}</Text>}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{user.name || user.email || 'Utilisateur'}</Text>
        <Text style={styles.rowSub}>{subtitle}</Text>
      </View>
      {actionLabel && onPress ? <SecondaryButton label={actionLabel} onPress={onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: { minHeight: 58, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 10, justifyContent: 'center', marginTop: 6, marginBottom: 2 },
  pageHeaderTitle: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '900' },
  pageHeaderSubtitle: { color: colors.muted, fontSize: 13, lineHeight: 18, fontWeight: '700', marginTop: 4 },
  section: { backgroundColor: colors.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 13, gap: 10, marginTop: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 16, lineHeight: 20, fontWeight: '900' },
  statCard: { flex: 1, minWidth: 92, minHeight: 70, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 10 },
  statCardHighlighted: { backgroundColor: '#E4F7DF', borderColor: 'rgba(37,211,102,0.18)' },
  statCardValue: { color: colors.header, fontSize: 18, lineHeight: 22, fontWeight: '900', textAlign: 'center' },
  statCardLabel: { color: colors.secondary, fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center', marginTop: 5 },
  primaryButton: { minHeight: 44, borderRadius: 22, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 17, fontWeight: '900', textAlign: 'center' },
  secondaryButton: { minHeight: 38, borderRadius: 19, backgroundColor: '#EEF2F1', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  secondaryButtonText: { color: colors.header, fontSize: 12.5, lineHeight: 16, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  loader: { marginVertical: 6 },
  alert: { color: '#9A3412', backgroundColor: '#FFF7ED', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 12, fontSize: 13, lineHeight: 18, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EAF4F1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.header, fontWeight: '900', fontSize: 15 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 15, lineHeight: 19, fontWeight: '800' },
  rowSub: { color: colors.muted, fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 2 },
});
