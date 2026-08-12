import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera } from 'lucide-react-native';
import { FRONTEND_URL } from '@/config/env';
import { NativePhotoViewer } from '@/screens/home/NativePhotoViewer';
import { highQualityImageUri } from '@/screens/home/homeUtils';
import { api } from '@/services/api';
import { saveSession } from '@/services/session';
import { colors } from '@/theme/colors';
import type { AuthSession, User } from '@/types/messenger';
import { AlertText, Loading, SecondaryButton } from './FeatureUi';

function initials(name?: string | null) {
  return String(name || '?').trim().slice(0, 2).toUpperCase();
}

function ownerKey(base: string, ownerId: string) {
  return `${base}:${ownerId || 'local'}`;
}

async function fileToDataUrl(uri: string, mime = 'image/jpeg') {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${base64}`;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text selectable style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export function ProfilePage({ session, onLogout, onBack }: { session: AuthSession; onLogout: () => Promise<void>; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(session.user.name || '');
  const [bio, setBio] = useState(session.user.bio || '');
  const [avatar, setAvatar] = useState(session.user.avatar || '');
  const [phone, setPhone] = useState(session.user.phone || '');
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [user, setUser] = useState<User>(session.user);
  const storageKey = useMemo(() => ownerKey('oracle-native-profile', session.user.id || session.user.email || session.token), [session.token, session.user.email, session.user.id]);
  const profileLink = user.username
    ? `${FRONTEND_URL}/u/${encodeURIComponent(user.username)}`
    : `${FRONTEND_URL}/install`;
  const displayAvatar = highQualityImageUri(avatar) || avatar;

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(storageKey)
      .then(raw => {
        if (!alive || !raw) return;
        const local = JSON.parse(raw);
        if (typeof local.name === 'string') setName(local.name);
        if (typeof local.bio === 'string') setBio(local.bio);
        if (typeof local.avatar === 'string') setAvatar(local.avatar);
        if (typeof local.phone === 'string') setPhone(local.phone);
      })
      .catch(() => undefined);
    api.me(session.token)
      .then(remote => {
        if (!alive) return;
        setUser(remote);
        setName(remote.name || '');
        setBio(remote.bio || '');
        setAvatar(remote.avatar || '');
        setPhone(remote.phone || '');
        return AsyncStorage.setItem(storageKey, JSON.stringify({
          name: remote.name || '',
          bio: remote.bio || '',
          avatar: remote.avatar || '',
          phone: remote.phone || '',
        }));
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [session.token, storageKey]);

  const pickAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice('Permission galerie requise pour modifier la photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.78,
      base64: false,
      allowsEditing: true,
      aspect: [1, 1],
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setBusy(true);
    try {
      setAvatar(await fileToDataUrl(asset.uri, asset.mimeType || 'image/jpeg'));
      setNotice('');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Préparation photo impossible.');
    } finally {
      setBusy(false);
    }
  }, []);

  const save = useCallback(async () => {
    if (!name.trim()) {
      setNotice('Le nom est requis.');
      return;
    }
    setBusy(true);
    try {
      const saved: any = await api.updateMe(session.token, {
        name: name.trim(),
        bio: bio.trim(),
        avatar: avatar || undefined,
      });
      const nextSession: AuthSession = {
        token: saved?.token || session.token,
        user: {
          ...session.user,
          ...saved,
          name: saved?.name || name.trim(),
          bio: saved?.bio ?? bio.trim(),
          avatar: saved?.avatar ?? avatar,
          phone: saved?.phone ?? phone,
          isNew: false,
        },
      };
      delete (nextSession.user as any).token;
      await saveSession(nextSession);
      await AsyncStorage.setItem(storageKey, JSON.stringify({
        name: nextSession.user.name || '',
        bio: nextSession.user.bio || '',
        avatar: nextSession.user.avatar || '',
        phone: nextSession.user.phone || '',
      }));
      setUser(nextSession.user);
      setPhone(nextSession.user.phone || '');
      setNotice('Profil enregistré.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Enregistrement profil impossible.');
    } finally {
      setBusy(false);
    }
  }, [avatar, bio, name, phone, session.token, session.user, storageKey]);

  const shareProfile = useCallback(async () => {
    try {
      await Share.share({ title: 'Oracle Messenger', message: `Écris-moi sur Oracle Messenger ${profileLink}`, url: profileLink });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Partage du profil impossible.');
    }
  }, [profileLink]);

  const copyProfileLink = useCallback(async () => {
    await Clipboard.setStringAsync(profileLink);
    setNotice('Lien du profil copié.');
  }, [profileLink]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.page, { paddingBottom: 112 + Math.max(insets.bottom, 8) }]} showsVerticalScrollIndicator>
      <View style={styles.header}>
        <View style={styles.headerBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retour"
            onPress={onBack}
            style={({ pressed }) => [styles.backCircle, pressed && styles.pressed]}
          >
            <ArrowLeft size={24} color="#FFFFFF" strokeWidth={2.6} />
          </Pressable>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.headerTitle}>Mon profil</Text>
          <Pressable onPress={save} disabled={busy || !name.trim()} style={[styles.headerSave, (busy || !name.trim()) && styles.disabled]}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.headerSaveText}>{busy ? '...' : 'Enregistrer'}</Text>
          </Pressable>
        </View>
        <View style={styles.profileHero}>
          <View style={styles.profileAvatarWrap}>
            <Pressable
              accessibilityRole="imagebutton"
              accessibilityLabel="Agrandir la photo du profil"
              onPress={() => avatar ? setAvatarOpen(true) : void pickAvatar()}
              disabled={busy}
              style={styles.profileAvatar}
            >
              {displayAvatar ? <Image source={{ uri: displayAvatar }} style={styles.avatarImage} /> : <Text style={styles.profileAvatarText}>{initials(name || user.name)}</Text>}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Changer la photo"
              onPress={pickAvatar}
              disabled={busy}
              hitSlop={8}
              style={styles.cameraBubble}
            >
              <Camera size={27} color={colors.header} strokeWidth={2.5} fill={colors.header} />
            </Pressable>
          </View>
          <Text maxFontSizeMultiplier={1.08} style={styles.photoHint}>Appuyez sur la photo pour l’agrandir</Text>
        </View>
      </View>

      <View style={styles.body}>
        <AlertText text={notice} />
        <Loading active={busy} />

        <View style={styles.formCard}>
          <View style={styles.formRow}>
            <Text style={styles.formLabel}>NOM</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Votre nom"
              placeholderTextColor={colors.muted}
              maxLength={50}
              maxFontSizeMultiplier={1.08}
              style={styles.input}
            />
          </View>
          <View style={styles.formRowLast}>
            <Text style={styles.formLabel}>BIO</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Bio ou statut"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={160}
              maxFontSizeMultiplier={1.08}
              style={[styles.input, styles.textarea]}
            />
            <Text style={styles.counter}>{bio.length}/160</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardIcon}>🔗</Text>
            <Text style={styles.cardTitle}>Votre lien unique</Text>
          </View>
          <View style={styles.linkBox}>
            <Text selectable style={styles.linkText}>{profileLink}</Text>
          </View>
          <View style={styles.helpBox}>
            <Text style={styles.helpText}>💡 Ce lien est votre identifiant Oracle Messenger</Text>
            <Text style={styles.helpText}>Partagez-le sur vos réseaux, par message ou par SMS pour que vos contacts vous écrivent directement.</Text>
            <Text style={styles.helpText}>Quand quelqu’un clique dessus, il installe l’app et arrive directement dans votre conversation.</Text>
          </View>
          <View style={styles.profileLinkActions}>
            <Pressable accessibilityRole="button" onPress={copyProfileLink} style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}>
              <Text style={styles.copyButtonText}>📋 Copier</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={shareProfile} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed]}>
              <Text style={styles.shareButtonText}>📤 Partager</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.formLabel}>📱 TÉLÉPHONE</Text>
          <Text selectable style={[styles.readonlyValue, !phone && styles.mutedValue]}>{phone || 'Aucun numéro enregistré'}</Text>
          <Text style={styles.phoneMeta}>Permet à vos contacts de vous retrouver par numéro. Un numéro ne peut appartenir qu’à un seul compte.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.formLabel}>Email</Text>
          <Text selectable style={styles.readonlyValue}>{user.email || session.user.email || '—'}</Text>
        </View>

        <View style={styles.card}>
          <InfoRow label="Identifiant" value={user.id || session.user.id} />
          <InfoRow label="Statut" value={user.status || 'Standard'} />
          <InfoRow label="Notifications" value="Gérées par Android" />
          <InfoRow label="Sécurité" value="Session stockée en SecureStore" />
          <InfoRow label="Stockage" value="Médias locaux dans le stockage app" />
        </View>

        <View style={styles.bottomAction}>
          <SecondaryButton label="Déconnexion" onPress={onLogout} disabled={busy} />
        </View>
      </View>
      </ScrollView>
      <View style={[styles.fixedFooter, { paddingBottom: Math.max(14, insets.bottom + 12) }]}>
        <Pressable onPress={save} disabled={busy || !name.trim()} style={[styles.saveButton, (busy || !name.trim()) && styles.disabled]}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.08} style={styles.saveButtonText}>{busy ? 'Enregistrement...' : 'Enregistrer'}</Text>
        </Pressable>
      </View>
      <NativePhotoViewer
        visible={avatarOpen}
        uri={displayAvatar}
        title={name || user.name}
        fallbackText={initials(name || user.name)}
        onClose={() => setAvatarOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  page: { backgroundColor: colors.background },
  header: { backgroundColor: colors.header, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 16 },
  headerBar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  backCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  headerTitle: { flex: 1, color: '#FFFFFF', fontSize: 17, lineHeight: 21, fontWeight: '900' },
  headerSave: { minHeight: 38, borderRadius: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 0 },
  headerSaveText: { color: '#FFFFFF', fontSize: 13.5, lineHeight: 17, fontWeight: '900' },
  disabled: { opacity: 0.58 },
  avatarImage: { width: '100%', height: '100%' },
  profileHero: { alignItems: 'center', gap: 8, paddingTop: 8 },
  profileAvatarWrap: { width: 76, height: 76, position: 'relative' },
  profileAvatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.30)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.48)', overflow: 'hidden' },
  profileAvatarText: { color: '#FFFFFF', fontWeight: '800', fontSize: 26 },
  cameraBubble: { position: 'absolute', right: -2, bottom: 2, width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  photoHint: { color: 'rgba(255,255,255,0.86)', fontSize: 13, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  body: { marginTop: 0, paddingHorizontal: 10, paddingTop: 10, gap: 10 },
  formCard: { backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, shadowColor: '#102A2A', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 },
  formRow: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.input },
  formRowLast: { minHeight: 158, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  formLabel: { color: colors.header, fontSize: 13, lineHeight: 17, fontWeight: '900', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  input: { minHeight: 38, padding: 0, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '500' },
  textarea: { minHeight: 86, textAlignVertical: 'top', lineHeight: 22, fontSize: 16 },
  counter: { color: colors.muted, fontSize: 12, lineHeight: 16, textAlign: 'right', fontWeight: '700', marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 18, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 11, shadowColor: '#102A2A', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  cardIcon: { fontSize: 22 },
  cardTitle: { color: colors.text, fontSize: 17, lineHeight: 22, fontWeight: '900' },
  linkBox: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 12 },
  linkText: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '800' },
  helpBox: { backgroundColor: '#EEF2F1', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(16,42,42,0.12)', paddingHorizontal: 12, paddingVertical: 12, gap: 6 },
  helpText: { color: colors.text, fontSize: 13.5, lineHeight: 20, fontWeight: '800' },
  profileLinkActions: { flexDirection: 'row', gap: 12 },
  copyButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: '#F1F3F6', borderWidth: 1, borderColor: '#DDE2E8', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  copyButtonText: { color: colors.text, fontSize: 14.5, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  shareButton: { flex: 1, minHeight: 48, borderRadius: 14, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  shareButtonText: { color: '#FFFFFF', fontSize: 14.5, lineHeight: 19, fontWeight: '900', textAlign: 'center' },
  readonlyValue: { color: colors.text, fontSize: 15.5, fontWeight: '500', lineHeight: 22 },
  mutedValue: { color: colors.muted },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { color: colors.muted, fontSize: 12.5, fontWeight: '900', flexShrink: 0 },
  infoValue: { color: colors.text, fontSize: 12.5, lineHeight: 18, fontWeight: '800', flex: 1, textAlign: 'right' },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
  phoneMeta: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '600' },
  bottomAction: { gap: 10, paddingBottom: 8 },
  fixedFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#F8F6EF', borderTopWidth: 1, borderTopColor: 'rgba(16,42,42,0.10)', paddingHorizontal: 16, paddingTop: 12 },
  saveButton: { minHeight: 52, borderRadius: 18, backgroundColor: colors.header, alignItems: 'center', justifyContent: 'center', shadowColor: '#102A2A', shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  saveButtonText: { color: '#FFFFFF', fontSize: 17, lineHeight: 22, fontWeight: '900' },
});
