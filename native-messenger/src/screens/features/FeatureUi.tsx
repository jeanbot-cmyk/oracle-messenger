import type { ReactNode } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
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
      <Text numberOfLines={1} style={styles.pageHeaderTitle}>{title}</Text>
      {subtitle ? <Text numberOfLines={2} style={styles.pageHeaderSubtitle}>{subtitle}</Text> : null}
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
    <Pressable onPress={onPress} disabled={disabled} style={[styles.primaryButton, disabled && styles.disabled]}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.secondaryButton, disabled && styles.disabled]}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
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

export function UserRow({ user, actionLabel, onPress }: { user: User; actionLabel?: string; onPress?: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.avatar}>
        {user.avatar ? <Image source={{ uri: user.avatar }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials(user.name)}</Text>}
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{user.name || user.email || 'Utilisateur'}</Text>
        <Text style={styles.rowSub}>{user.username ? `@${user.username}` : user.email || user.status || 'Oracle Messenger'}</Text>
      </View>
      {actionLabel && onPress ? <SecondaryButton label={actionLabel} onPress={onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pageHeader: { minHeight: 92, borderRadius: 28, backgroundColor: colors.header, paddingHorizontal: 20, paddingVertical: 18, justifyContent: 'center', marginHorizontal: 12, marginTop: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  pageHeaderTitle: { color: '#FFFFFF', fontSize: 28, lineHeight: 32, fontWeight: '900' },
  pageHeaderSubtitle: { color: 'rgba(255,255,255,0.76)', fontSize: 13, lineHeight: 18, fontWeight: '800', marginTop: 5 },
  section: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 24, padding: 18, gap: 14, marginHorizontal: 12, marginTop: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 20, lineHeight: 24, fontWeight: '900' },
  statCard: { flex: 1, minWidth: 96, minHeight: 92, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 12 },
  statCardHighlighted: { backgroundColor: '#E4F7DF', borderColor: 'rgba(37,211,102,0.18)' },
  statCardValue: { color: colors.header, fontSize: 26, lineHeight: 30, fontWeight: '900', textAlign: 'center' },
  statCardLabel: { color: colors.secondary, fontSize: 12.5, lineHeight: 16, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  primaryButton: { minHeight: 48, borderRadius: 24, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '900', textAlign: 'center' },
  secondaryButton: { minHeight: 40, borderRadius: 20, backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  secondaryButtonText: { color: colors.header, fontSize: 12.5, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  loader: { marginVertical: 6 },
  alert: { color: '#9A3412', backgroundColor: '#FFF7ED', borderRadius: 12, padding: 10, fontSize: 12.5, lineHeight: 18, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EAF4F1', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: colors.header, fontWeight: '900', fontSize: 14 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.text, fontSize: 14.5, fontWeight: '900' },
  rowSub: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 2 },
});
