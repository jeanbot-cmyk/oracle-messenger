import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera } from 'lucide-react-native';
import { api } from '@/services/api';
import { colors } from '@/theme/colors';
import type { AuthSession } from '@/types/messenger';
import { COUNTRIES, initials, normalizeOnboardingPhone, type Country } from './homeUtils';

type NativeOnboardingProps = {
  session: AuthSession;
  onComplete: (session: AuthSession) => Promise<void>;
  onLogout: () => Promise<void>;
};

export function NativeOnboarding({ session, onComplete, onLogout }: NativeOnboardingProps) {
  const [name, setName] = useState(session.user.name || '');
  const [bio, setBio] = useState(session.user.bio || '');
  const [avatar, setAvatar] = useState(session.user.avatar || '');
  const [phone, setPhone] = useState(session.user.phone || '');
  const [country, setCountry] = useState<Country>(COUNTRIES.find(item => item.code === 'CI') || COUNTRIES[0]);
  const [showCountries, setShowCountries] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredCountries = useMemo(() => {
    const needle = countrySearch.trim().toLowerCase();
    if (!needle) return COUNTRIES;
    return COUNTRIES.filter(item => (
      item.name.toLowerCase().includes(needle) ||
      item.dial.includes(needle) ||
      item.code.toLowerCase().includes(needle)
    ));
  }, [countrySearch]);

  const pickAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Permission galerie requise pour ajouter une photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    if (asset.base64) {
      setAvatar(`data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
    } else {
      setAvatar(asset.uri);
    }
    setError('');
  }, []);

  const saveOnboarding = useCallback(async () => {
    const cleanName = name.trim();
    const cleanPhone = normalizeOnboardingPhone(country, phone);
    if (!cleanName) {
      setError('Le nom est requis.');
      return;
    }
    if (cleanPhone.replace(/\D/g, '').length < 8) {
      setError('Le numéro de téléphone est requis avec un format valide.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const saved: any = await api.updateMe(session.token, {
        name: cleanName,
        bio: bio.trim(),
        avatar: avatar || undefined,
        phone: cleanPhone,
      });
      const nextSession: AuthSession = {
        token: saved?.token || session.token,
        user: {
          ...session.user,
          ...saved,
          name: saved?.name || cleanName,
          bio: saved?.bio ?? bio.trim(),
          avatar: saved?.avatar ?? avatar,
          phone: saved?.phone || cleanPhone,
          isNew: false,
        },
      };
      delete (nextSession.user as any).token;
      await onComplete(nextSession);
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err || '');
      setError(raw.includes('autre compte Google') || raw.includes('409') || raw.includes('déjà lié')
        ? 'Ce numéro est déjà lié à un autre compte Google. Connectez-vous avec le Gmail associé à ce numéro.'
        : raw.includes('votre compte Oracle Messenger') || raw.includes('même compte Google')
          ? 'Ce numéro appartient déjà à votre compte. Reconnexion du bon profil en cours impossible, réessayez.'
          : raw || 'Erreur lors de la sauvegarde du profil.');
    } finally {
      setSaving(false);
    }
  }, [avatar, bio, country, name, onComplete, phone, session]);

  const phoneIsInvalid = normalizeOnboardingPhone(country, phone).replace(/\D/g, '').length < 8;
  const submitDisabled = saving || !name.trim() || phoneIsInvalid;

  return (
    <SafeAreaView style={styles.onboardingSafe}>
      <ScrollView contentContainerStyle={styles.onboardingContent} keyboardShouldPersistTaps="handled">
        <View style={styles.onboardingHeader}>
          <Text style={styles.onboardingEyebrow}>Bienvenue sur</Text>
          <Text style={styles.onboardingTitle}>Oracle Messenger</Text>
          <Text style={styles.onboardingSubtitle}>Complétez votre profil pour commencer.</Text>
        </View>

        <Pressable onPress={pickAvatar} style={styles.onboardingAvatarWrap}>
          <View style={styles.onboardingAvatar}>
            {avatar ? <Image source={{ uri: avatar }} style={styles.avatarImage} /> : <Text style={styles.onboardingAvatarText}>{initials(name)}</Text>}
          </View>
          <View style={styles.onboardingCameraBadge}>
            <Camera size={16} color="#FFFFFF" />
          </View>
        </Pressable>
        <Text style={styles.onboardingHint}>Appuyez pour ajouter une photo</Text>

        {error ? <Text style={styles.onboardingError}>{error}</Text> : null}

        <View style={styles.onboardingForm}>
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Votre nom *</Text>
            <TextInput
              value={name}
              onChangeText={text => { setName(text); setError(''); }}
              placeholder="Ex : Jean Dupont"
              placeholderTextColor={colors.muted}
              maxLength={50}
              style={styles.onboardingInput}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              value={bio}
              onChangeText={setBio}
              placeholder="Dites quelque chose sur vous..."
              placeholderTextColor={colors.muted}
              maxLength={160}
              multiline
              style={[styles.onboardingInput, styles.onboardingTextarea]}
            />
            <Text style={styles.fieldCounter}>{bio.length}/160</Text>
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Numéro de téléphone *</Text>
            <View style={styles.phoneRow}>
              <Pressable style={styles.countryButton} onPress={() => setShowCountries(current => !current)}>
                <Text style={styles.countryFlag}>{country.flag}</Text>
                <Text style={styles.countryDial}>{country.dial}</Text>
                <Text style={styles.countryChevron}>⌄</Text>
              </Pressable>
              <TextInput
                value={phone}
                onChangeText={text => { setPhone(text.replace(/[^\d\s]/g, '')); setError(''); }}
                placeholder="Ex: 0102030405"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                style={[styles.onboardingInput, styles.phoneInput]}
              />
            </View>
          </View>

          {showCountries ? (
            <View style={styles.countryPicker}>
              <TextInput
                value={countrySearch}
                onChangeText={setCountrySearch}
                placeholder="Rechercher un pays ou code..."
                placeholderTextColor={colors.muted}
                style={styles.countrySearch}
              />
              {filteredCountries.slice(0, 60).map(item => (
                <Pressable key={`${item.code}-${item.dial}`} style={styles.countryOption} onPress={() => { setCountry(item); setShowCountries(false); setCountrySearch(''); }}>
                  <Text style={styles.countryOptionFlag}>{item.flag}</Text>
                  <Text style={styles.countryOptionName}>{item.name}</Text>
                  <Text style={styles.countryOptionDial}>{item.dial}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable
            onPress={saveOnboarding}
            disabled={submitDisabled}
            style={[styles.onboardingSubmit, submitDisabled && styles.disabledButton]}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.onboardingSubmitText}>Commencer à discuter →</Text>}
          </Pressable>
          <Pressable onPress={onLogout} disabled={saving} style={styles.onboardingLogout}>
            <Text style={styles.onboardingLogoutText}>Changer de compte Google</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  onboardingSafe: { flex: 1, backgroundColor: colors.surface },
  onboardingContent: { flexGrow: 1, backgroundColor: colors.surface, paddingBottom: 28 },
  onboardingHeader: { backgroundColor: colors.brand, paddingHorizontal: 24, paddingTop: 34, paddingBottom: 54, alignItems: 'center' },
  onboardingEyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  onboardingTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', marginTop: 5 },
  onboardingSubtitle: { color: 'rgba(255,255,255,0.82)', fontSize: 14, fontWeight: '700', marginTop: 5, textAlign: 'center' },
  onboardingAvatarWrap: { width: 104, height: 104, borderRadius: 52, alignSelf: 'center', marginTop: -46 },
  onboardingAvatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: colors.border, borderWidth: 4, borderColor: colors.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 12, elevation: 5 },
  avatarImage: { width: '100%', height: '100%' },
  onboardingAvatarText: { color: colors.muted, fontSize: 40, fontWeight: '900' },
  onboardingCameraBadge: { position: 'absolute', right: 3, bottom: 3, width: 32, height: 32, borderRadius: 16, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  onboardingHint: { color: colors.muted, fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 9 },
  onboardingError: { marginHorizontal: 20, marginTop: 14, padding: 11, borderRadius: 12, backgroundColor: '#FEF2F2', color: colors.danger, borderWidth: 1, borderColor: '#FECACA', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  onboardingForm: { paddingHorizontal: 20, paddingTop: 18, gap: 12 },
  fieldBlock: { gap: 7 },
  fieldLabel: { color: colors.brand, fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
  fieldCounter: { color: colors.muted, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  onboardingInput: { minHeight: 50, borderRadius: 16, backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 15, paddingVertical: 11, color: colors.text, fontSize: 15.5, fontWeight: '700' },
  onboardingTextarea: { minHeight: 82, textAlignVertical: 'top' },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  countryButton: { minWidth: 112, minHeight: 50, borderRadius: 15, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  countryFlag: { color: colors.text, fontSize: 13, fontWeight: '900' },
  countryDial: { color: colors.brand, fontSize: 14, fontWeight: '900' },
  countryChevron: { color: colors.muted, fontSize: 16, fontWeight: '900', marginTop: -3 },
  phoneInput: { flex: 1, minWidth: 0, backgroundColor: colors.surface },
  countryPicker: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, backgroundColor: colors.surface, overflow: 'hidden' },
  countrySearch: { minHeight: 46, backgroundColor: colors.input, paddingHorizontal: 14, color: colors.text, fontWeight: '800', borderBottomWidth: 1, borderBottomColor: colors.border },
  countryOption: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  countryOptionFlag: { width: 30, color: colors.text, fontSize: 12, fontWeight: '900' },
  countryOptionName: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800' },
  countryOptionDial: { color: colors.brand, fontSize: 13, fontWeight: '900' },
  onboardingSubmit: { marginTop: 10, minHeight: 56, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', shadowColor: '#000000', shadowOpacity: 0.14, shadowRadius: 12, elevation: 4 },
  disabledButton: { opacity: 0.55 },
  onboardingSubmitText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  onboardingLogout: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  onboardingLogoutText: { color: colors.muted, fontSize: 13, fontWeight: '900' },
});
