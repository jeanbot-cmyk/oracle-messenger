import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { FRONTEND_URL } from '@/config/env';
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

export function ProfilePage({ session, onLogout }: { session: AuthSession; onLogout: () => Promise<void> }) {
  const [name, setName] = useState(session.user.name || '');
  const [bio, setBio] = useState(session.user.bio || '');
  const [avatar, setAvatar] = useState(session.user.avatar || '');
  const [phone, setPhone] = useState(session.user.phone || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [user, setUser] = useState<User>(session.user);
  const storageKey = useMemo(() => ownerKey('oracle-native-profile', session.user.id || session.user.email || session.token), [session.token, session.user.email, session.user.id]);
  const profileLink = user.username
    ? `${FRONTEND_URL}/u/${encodeURIComponent(user.username)}`
    : `${FRONTEND_URL}/install`;

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
      await Share.share({ title: 'Oracle Messenger', message: `Mon profil Oracle Messenger: ${profileLink}`, url: profileLink });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Partage du profil impossible.');
    }
  }, [profileLink]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <View style={styles.headerBar}>
          <Text numberOfLines={1} style={styles.headerTitle}>Profil</Text>
          <Pressable onPress={save} disabled={busy || !name.trim()} style={[styles.headerSave, (busy || !name.trim()) && styles.disabled]}>
            <Text style={styles.headerSaveText}>{busy ? '...' : 'Enregistrer'}</Text>
          </Pressable>
        </View>
        <View style={styles.profileHero}>
          <Pressable onPress={pickAvatar} disabled={busy} style={styles.profileAvatar}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.profileAvatarText}>{initials(name || user.name)}</Text>}
          </Pressable>
          <Text style={styles.profileName}>{user.name || name || 'Utilisateur'}</Text>
          <Text style={styles.profileMeta}>{user.username ? `@${user.username}` : user.email || 'Oracle Messenger'}</Text>
          <Text style={styles.photoHint}>Appuyez pour modifier la photo</Text>
        </View>
      </View>

      <View style={styles.body}>
        <AlertText text={notice} />
        <Loading active={busy} />

        <View style={styles.formCard}>
          <View style={styles.formRow}>
            <Text style={styles.formLabel}>Nom</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Votre nom"
              placeholderTextColor={colors.muted}
              maxLength={50}
              style={styles.input}
            />
          </View>
          <View style={styles.formRowLast}>
            <Text style={styles.formLabel}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Bio ou statut"
              placeholderTextColor={colors.muted}
              multiline
              maxLength={160}
              style={[styles.input, styles.textarea]}
            />
            <Text style={styles.counter}>{bio.length}/160</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardIcon}>🔗</Text>
            <Text style={styles.cardTitle}>Lien unique</Text>
          </View>
          <View style={styles.linkBox}>
            <Text selectable style={styles.linkText}>{profileLink}</Text>
          </View>
          <View style={styles.helpBox}>
            <Text style={styles.helpText}>💡 Partagez ce lien pour permettre à vos contacts d’ouvrir directement votre profil Oracle Messenger.</Text>
          </View>
          <SecondaryButton label="Partager mon profil" onPress={shareProfile} />
        </View>

        <View style={styles.card}>
          <Text style={styles.formLabel}>📱 Téléphone</Text>
          <Text selectable style={[styles.readonlyValue, !phone && styles.mutedValue]}>{phone || 'Aucun numéro enregistré'}</Text>
          <Text style={styles.cardMeta}>Ce numéro est lié au compte et ne se modifie pas depuis le profil.</Text>
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
          <Pressable onPress={save} disabled={busy || !name.trim()} style={[styles.saveButton, (busy || !name.trim()) && styles.disabled]}>
            <Text style={styles.saveButtonText}>{busy ? 'Enregistrement...' : 'Enregistrer'}</Text>
          </Pressable>
          <SecondaryButton label="Déconnexion" onPress={onLogout} disabled={busy} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 96, backgroundColor: colors.background },
  header: { backgroundColor: colors.header, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30 },
  headerBar: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { flex: 1, color: '#FFFFFF', fontSize: 18, lineHeight: 22, fontWeight: '900' },
  headerSave: { minHeight: 34, borderRadius: 17, backgroundColor: colors.online, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 },
  headerSaveText: { color: '#102A2A', fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.58 },
  avatarImage: { width: '100%', height: '100%' },
  profileHero: { alignItems: 'center', gap: 8, paddingTop: 8 },
  profileAvatar: { width: 110, height: 110, borderRadius: 55, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.30)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.50)' },
  profileAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 48 },
  profileName: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  profileMeta: { color: 'rgba(255,255,255,0.82)', fontSize: 12.5, fontWeight: '800', textAlign: 'center' },
  photoHint: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  body: { marginTop: -16, paddingHorizontal: 16, gap: 12 },
  formCard: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, shadowColor: '#102A2A', shadowOpacity: 0.06, shadowRadius: 14, elevation: 2 },
  formRow: { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.input },
  formRowLast: { paddingHorizontal: 16, paddingVertical: 12 },
  formLabel: { color: colors.brand, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { minHeight: 24, padding: 0, color: colors.text, fontSize: 16, fontWeight: '500' },
  textarea: { minHeight: 70, textAlignVertical: 'top', lineHeight: 22, fontSize: 15 },
  counter: { color: colors.muted, fontSize: 11, textAlign: 'right', fontWeight: '700', marginTop: 4 },
  card: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10, shadowColor: '#102A2A', shadowOpacity: 0.05, shadowRadius: 12, elevation: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardIcon: { fontSize: 18 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  linkBox: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 10 },
  linkText: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  helpBox: { backgroundColor: colors.brandSoft, borderRadius: 10, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 12, paddingVertical: 10 },
  helpText: { color: colors.text, fontSize: 12.5, lineHeight: 20, fontWeight: '700' },
  readonlyValue: { color: colors.text, fontSize: 15, fontWeight: '800', lineHeight: 21 },
  mutedValue: { color: colors.muted },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { color: colors.muted, fontSize: 12.5, fontWeight: '900', flexShrink: 0 },
  infoValue: { color: colors.text, fontSize: 12.5, lineHeight: 18, fontWeight: '800', flex: 1, textAlign: 'right' },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
  bottomAction: { gap: 10, paddingBottom: 8 },
  saveButton: { minHeight: 54, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#102A2A', shadowOpacity: 0.14, shadowRadius: 12, elevation: 4 },
  saveButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
});
