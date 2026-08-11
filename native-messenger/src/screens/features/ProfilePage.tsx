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
import { AlertText, Loading, PageHeader, PrimaryButton, SecondaryButton, Section } from './FeatureUi';

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
      <PageHeader title="Profil" subtitle="Compte, photo, lien Oracle et réglages locaux." />
      <Section title="Profil">
        <View style={styles.profileHero}>
          <Pressable onPress={pickAvatar} disabled={busy} style={styles.profileAvatar}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.profileAvatarText}>{initials(name || user.name)}</Text>}
          </Pressable>
          <Text style={styles.profileName}>{user.name || name || 'Utilisateur'}</Text>
          <Text style={styles.profileMeta}>{user.username ? `@${user.username}` : user.email || 'Oracle Messenger'}</Text>
          <SecondaryButton label="Changer la photo" onPress={pickAvatar} disabled={busy} />
        </View>
        <TextInput value={name} onChangeText={setName} placeholder="Nom public" placeholderTextColor={colors.muted} style={styles.input} />
        <TextInput value={bio} onChangeText={setBio} placeholder="Bio ou statut" placeholderTextColor={colors.muted} multiline maxLength={160} style={[styles.input, styles.textarea]} />
        <PrimaryButton label="Enregistrer" onPress={save} disabled={busy || !name.trim()} />
        <Loading active={busy} />
        <AlertText text={notice} />
      </Section>

      <Section title="Lien Oracle">
        <Text style={styles.pageCopy}>Lien public associé au username lorsque disponible.</Text>
        <View style={styles.linkBox}>
          <Text selectable style={styles.linkText}>{profileLink}</Text>
        </View>
        <SecondaryButton label="Partager mon profil" onPress={shareProfile} />
      </Section>

      <Section title="Compte">
        <InfoRow label="Email" value={user.email || session.user.email || '—'} />
        <InfoRow label="Téléphone" value={phone || 'Aucun numéro enregistré'} />
        <InfoRow label="Identifiant" value={user.id || session.user.id} />
        <InfoRow label="Statut" value={user.status || 'Standard'} />
        <Text style={styles.cardMeta}>Le numéro reste lié au compte et ne se modifie pas depuis le profil.</Text>
      </Section>

      <Section title="Paramètres">
        <InfoRow label="Confidentialité" value="Profil personnel" />
        <InfoRow label="Notifications" value="Gérées par Android" />
        <InfoRow label="Sécurité" value="Session stockée en SecureStore" />
        <InfoRow label="Stockage" value="Médias locaux dans le stockage app" />
      </Section>

      <Section title="Session">
        <SecondaryButton label="Déconnexion" onPress={onLogout} disabled={busy} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 96, gap: 0, backgroundColor: colors.background },
  pageCopy: { color: colors.muted, fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  input: { minHeight: 48, borderRadius: 15, backgroundColor: colors.input, color: colors.text, paddingHorizontal: 14, paddingVertical: 10, fontWeight: '800', borderWidth: 1, borderColor: 'transparent' },
  textarea: { minHeight: 96, textAlignVertical: 'top' },
  avatarImage: { width: '100%', height: '100%' },
  profileHero: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  profileAvatar: { width: 112, height: 112, borderRadius: 40, overflow: 'hidden', backgroundColor: '#EAF4F1', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFFFFF' },
  profileAvatarText: { color: colors.header, fontWeight: '900', fontSize: 32 },
  profileName: { color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center' },
  profileMeta: { color: colors.muted, fontSize: 12.5, fontWeight: '800', textAlign: 'center' },
  linkBox: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: '#F8FAFC', padding: 12 },
  linkText: { color: colors.text, fontSize: 13, lineHeight: 19, fontWeight: '800' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { color: colors.muted, fontSize: 12.5, fontWeight: '900', flexShrink: 0 },
  infoValue: { color: colors.text, fontSize: 12.5, lineHeight: 18, fontWeight: '800', flex: 1, textAlign: 'right' },
  cardMeta: { color: colors.muted, fontSize: 11.5, fontWeight: '800' },
});
